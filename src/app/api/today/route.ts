import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActionableClients } from "@/lib/clients";
import { resolveStage, pickPrimaryEstimate } from "@/lib/object-stage";

/**
 * «Сегодня» — что делать прямо сейчас (Этап 1, 20.09.2026). Стартовый экран.
 *
 * Четыре блока, каждый — остановка на магистрали, до которой объект доехал и
 * ждёт мастера:
 *  - schedule   — замеры, монтажи, встречи на сегодня и завтра (события
 *                 клиента со scheduledAt);
 *  - toWorkshop — клиент согласовал, а чертёж в цех ещё не уходил;
 *  - waiting    — КП отправлено/просмотрено, а ответа нет уже 2+ дня — пора
 *                 позвонить (85% КП так и остаются без ответа);
 *  - calls      — «перезвонить» по nextContactAt (просрочено/сегодня/завтра).
 */

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
const STALE_DAYS = 2;

function almatyDayBounds() {
  const nowZ = new Date(Date.now() + ALMATY_OFFSET_MS);
  const start = new Date(nowZ);
  start.setUTCHours(0, 0, 0, 0);
  const endTomorrow = new Date(start.getTime() + 2 * 86_400_000 - 1);
  return {
    startOfToday: new Date(start.getTime() - ALMATY_OFFSET_MS),
    endOfToday: new Date(start.getTime() + 86_400_000 - 1 - ALMATY_OFFSET_MS),
    endOfTomorrow: new Date(endTomorrow.getTime() - ALMATY_OFFSET_MS),
  };
}

export async function GET() {
  try {
    const master = await requireAuth();
    const { startOfToday, endOfToday, endOfTomorrow } = almatyDayBounds();
    const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000);

    const [events, objects, orphanStale, calls, objectsCount] = await Promise.all([
      // Замеры / монтажи / встречи на сегодня-завтра
      prisma.clientEvent.findMany({
        where: {
          client: { masterId: master.id, deletedAt: null },
          type: { in: ["MEASUREMENT", "INSTALL", "MEETING"] },
          scheduledAt: { gte: startOfToday, lte: endOfTomorrow },
        },
        orderBy: { scheduledAt: "asc" },
        take: 30,
        select: {
          id: true, type: true, content: true, scheduledAt: true,
          client: { select: { id: true, name: true, phone: true, address: true } },
        },
      }),
      // Объекты с КП — из них выберем «пора в цех» и «клиент молчит»
      prisma.measurementObject.findMany({
        where: { masterId: master.id, deletedAt: null, estimates: { some: { deletedAt: null } } },
        select: {
          id: true, address: true, totalArea: true, manualStage: true,
          client: { select: { id: true, name: true, phone: true } },
          _count: { select: { rooms: true } },
          estimates: {
            where: { deletedAt: null },
            select: { id: true, status: true, total: true, clientName: true, clientPhone: true, createdAt: true, updatedAt: true, deletedAt: true },
          },
          workshopOrders: { select: { id: true } },
        },
      }),
      // КП без объекта, которые ждут ответа
      prisma.estimate.findMany({
        where: {
          masterId: master.id, deletedAt: null, measurementObjectId: null,
          status: { in: ["SENT", "VIEWED"] }, updatedAt: { lt: staleBefore },
        },
        orderBy: { updatedAt: "asc" },
        take: 10,
        select: {
          id: true, status: true, total: true, clientName: true, clientPhone: true, clientAddress: true, updatedAt: true,
          client: { select: { id: true, name: true, phone: true } },
        },
      }),
      getActionableClients(master.id),
      prisma.measurementObject.count({ where: { masterId: master.id, deletedAt: null } }),
    ]);

    const toWorkshop: object[] = [];
    const waiting: object[] = [];
    for (const o of objects) {
      const { stage } = resolveStage({ manualStage: o.manualStage, estimates: o.estimates, workshopOrders: o.workshopOrders });
      const primary = pickPrimaryEstimate(o.estimates);
      const clientName = o.client?.name ?? primary?.clientName ?? null;
      const phone = o.client?.phone ?? primary?.clientPhone ?? null;
      const base = {
        kind: "object" as const,
        id: o.id,
        title: o.address || clientName || "Без адреса",
        clientId: o.client?.id ?? null,
        clientName,
        clientPhone: phone,
        total: primary?.total ?? null,
        roomsCount: o._count.rooms,
        totalArea: o.totalArea,
        estimateId: primary?.id ?? null,
      };
      if (stage === "confirmed" && o.workshopOrders.length === 0 && o._count.rooms > 0) {
        toWorkshop.push({ ...base, since: (primary?.updatedAt ?? primary?.createdAt)?.toISOString() ?? null });
      } else if ((stage === "sent" || stage === "viewed") && primary && primary.updatedAt < staleBefore) {
        waiting.push({
          ...base,
          viewed: stage === "viewed",
          since: primary.updatedAt.toISOString(),
          days: Math.floor((Date.now() - primary.updatedAt.getTime()) / 86_400_000),
        });
      }
    }
    for (const e of orphanStale) {
      waiting.push({
        kind: "estimate" as const,
        id: e.id,
        title: e.clientAddress || e.client?.name || e.clientName || "КП",
        clientId: e.client?.id ?? null,
        clientName: e.client?.name ?? e.clientName ?? null,
        clientPhone: e.client?.phone ?? e.clientPhone ?? null,
        total: e.total,
        roomsCount: 0,
        totalArea: 0,
        estimateId: e.id,
        viewed: e.status === "VIEWED",
        since: e.updatedAt.toISOString(),
        days: Math.floor((Date.now() - e.updatedAt.getTime()) / 86_400_000),
      });
    }
    (waiting as { since: string }[]).sort((a, b) => a.since.localeCompare(b.since));

    return NextResponse.json({
      schedule: events.map((ev) => ({
        id: ev.id,
        type: ev.type,
        content: ev.content,
        at: ev.scheduledAt!.toISOString(),
        isToday: ev.scheduledAt! <= endOfToday,
        client: ev.client,
      })),
      toWorkshop,
      waiting: waiting.slice(0, 10),
      calls,
      // Новичку вместо пустых блоков показываем три шага «Замерь → Посчитай → Отправь»
      objectsCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get today error:", error);
    return NextResponse.json({ error: "Ошибка загрузки «Сегодня»" }, { status: 500 });
  }
}
