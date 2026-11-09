import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { syncClientStatusForObject } from "@/lib/clients";
import { applyCrmColumn } from "@/lib/crm-board";
import { installColumnFor, mainObject, type CrmColumn } from "@/lib/crm-columns";
import type { Prisma } from "@/generated/prisma/client";

// Эти колонки только ручные и важнее расчёта: без переноса карточка осталась бы в них
const BEFORE_INSTALL = ["purchase", "planning"];
const INSTALL_COLUMNS = ["install_planned", "install"];

/**
 * Назначить, перенести или отменить замер/монтаж клиента.
 * Тело: { kind, at: ISO | null, eventId?, objectId? }; at = null — отмена.
 * eventId и objectId — конкретная запись календаря, без них берётся ближайшая.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const { kind, at, eventId, objectId } = (await request.json()) as {
      kind?: unknown;
      at?: unknown;
      eventId?: unknown;
      objectId?: unknown;
    };

    if (kind !== "measure" && kind !== "install") {
      return NextResponse.json({ error: "Неизвестный тип записи" }, { status: 400 });
    }
    if (at === undefined) {
      return NextResponse.json({ error: "Нет даты" }, { status: 400 });
    }
    const when = at === null ? null : new Date(String(at));
    if (when && Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
    }

    const now = new Date();
    const type = kind === "install" ? "INSTALL" : "MEASUREMENT";
    const client = await prisma.client.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: {
        id: true,
        status: true,
        crmColumn: true,
        measurements: {
          where: { deletedAt: null },
          select: { id: true, createdAt: true, installAt: true },
        },
        events: {
          where: { type, scheduledAt: { gt: now } },
          orderBy: { scheduledAt: "asc" },
          select: { id: true },
        },
      },
    });
    if (!client) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }
    if (eventId && !client.events.some((e) => e.id === eventId)) {
      return NextResponse.json({ error: "Запись уже изменили" }, { status: 404 });
    }
    if (objectId && !client.measurements.some((o) => o.id === objectId)) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    const main = mainObject(client.measurements);
    const object =
      kind === "install" && !eventId
        ? objectId
          ? client.measurements.find((o) => o.id === objectId)!
          : main
        : null;
    const touch = prisma.client.update({ where: { id }, data: { updatedAt: now } });

    if (object && (when || object.installAt)) {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.measurementObject.update({ where: { id: object.id }, data: { installAt: when } }),
        touch,
      ];
      // Дата монтажа живёт в объекте: события на будущее стали бы второй датой
      if (!objectId && client.events.length > 0) {
        ops.push(prisma.clientEvent.deleteMany({ where: { id: { in: client.events.map((e) => e.id) } } }));
      }
      await prisma.$transaction(ops);

      let moved = true;
      if (object.id === main?.id) {
        const crm = client.crmColumn ?? "";
        const next: CrmColumn | null = when
          ? BEFORE_INSTALL.includes(crm)
            ? installColumnFor(when, now)
            : null
          : INSTALL_COLUMNS.includes(crm)
            ? "planning"
            : null;
        if (next) {
          try {
            await applyCrmColumn(client, next);
          } catch (error) {
            console.error("Plan column error:", error);
            moved = false;
          }
        }
      }
      await syncClientStatusForObject(object.id).catch(() => {});
      return NextResponse.json({ ok: true, moved });
    }

    const targetId = (eventId as string | undefined) ?? client.events[0]?.id;
    if (!when) {
      if (targetId) await prisma.$transaction([prisma.clientEvent.delete({ where: { id: targetId } }), touch]);
      return NextResponse.json({ ok: true, moved: true });
    }
    await prisma.$transaction([
      targetId
        ? // Напоминание должно уйти заново, уже на новую дату
          prisma.clientEvent.update({ where: { id: targetId }, data: { scheduledAt: when, reminderSentAt: null } })
        : prisma.clientEvent.create({ data: { clientId: id, type, scheduledAt: when } }),
      touch,
    ]);
    return NextResponse.json({ ok: true, moved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Client plan error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
