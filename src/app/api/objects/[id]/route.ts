import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import {
  resolveStage,
  autoStage,
  isObjectStage,
  STAGE_LABELS,
  pickPrimaryEstimate,
} from "@/lib/object-stage";
import { moneySummary } from "@/lib/money";

/**
 * Карточка объекта — вся жизнь заказа в одном месте: замер и комнаты,
 * варианты КП, отправки в цех, клиент, история.
 */

type HistoryItem = { at: string; type: string; text: string; estimateId?: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: {
        rooms: { orderBy: { sortOrder: "asc" } },
        client: { select: { id: true, name: true, phone: true, address: true, status: true } },
        measuredBy: { select: { id: true, name: true } },
        installer: { select: { id: true, name: true, phone: true } },
        estimates: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            publicId: true,
            clientName: true,
            total: true,
            totalArea: true,
            status: true,
            confirmedVariant: true,
            recommendedVariant: true,
            contractSignedAt: true,
            actSignedAt: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            partner: { select: { amount: true } },
          },
        },
        workshopOrders: { orderBy: { sentAt: "desc" } },
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    if (!obj) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    const primary = pickPrimaryEstimate(obj.estimates);
    // Деньги (Этап 4): цена — принятое/последнее КП; закрыл = смонтировали + деньги.
    // Процент материала — владельца компании (общая настройка, как прайс).
    const owner = await prisma.master.findUnique({ where: { id: scope.ownerId }, select: { materialPercent: true } });
    const money = moneySummary({
      price: primary?.total ?? null,
      payments: obj.payments,
      materialCost: obj.materialCost,
      materialPercent: owner?.materialPercent ?? 40,
      installerFee: obj.installerFee,
      installerPaidAt: obj.installerPaidAt,
      partnerAmount: primary?.partner?.amount ?? 0,
    });
    const { stage, isManual } = resolveStage({
      manualStage: obj.manualStage,
      estimates: obj.estimates,
      workshopOrders: obj.workshopOrders,
      settled: money.settled,
    });

    // История объекта: собираем из того, что знаем сами, плюс события клиента,
    // которые относятся к КП этого объекта (просмотр, принятие).
    const history: HistoryItem[] = [];
    history.push({
      at: (obj.measuredAt ?? obj.createdAt).toISOString(),
      type: "MEASURED",
      text: `Замер · ${obj.rooms.length} ${roomsWord(obj.rooms.length)} · ${obj.totalArea} м²`,
    });
    for (const e of obj.estimates) {
      history.push({
        at: e.createdAt.toISOString(),
        type: "KP_CREATED",
        text: `КП на ${Math.round(e.total).toLocaleString("ru-KZ")} ₸`,
        estimateId: e.id,
      });
      if (e.contractSignedAt) {
        history.push({ at: e.contractSignedAt.toISOString(), type: "CONTRACT_SIGNED", text: "Договор подписан", estimateId: e.id });
      }
      if (e.actSignedAt) {
        history.push({ at: e.actSignedAt.toISOString(), type: "ACT_SIGNED", text: "Акт подписан", estimateId: e.id });
      }
    }
    for (const pay of obj.payments) {
      history.push({
        at: pay.paidAt.toISOString(),
        type: "PAYMENT",
        text: `Получено ${pay.amount.toLocaleString("ru-KZ")} ₸${pay.kind === "prepayment" ? " · предоплата" : pay.kind === "final" ? " · остаток" : ""}${pay.note ? ` · ${pay.note}` : ""}`,
      });
    }
    for (const w of obj.workshopOrders) {
      history.push({
        at: w.sentAt.toISOString(),
        type: "WORKSHOP_SENT",
        text: `В цех · ${w.roomsCount} ${roomsWord(w.roomsCount)}${w.note ? ` · ${w.note}` : ""}`,
      });
    }
    if (obj.client) {
      const estimateIds = new Set(obj.estimates.map((e) => e.id));
      const events = await prisma.clientEvent.findMany({
        where: {
          clientId: obj.client.id,
          type: { in: ["KP_VIEWED", "KP_CONFIRMED", "KP_REJECTED", "INSTALL", "CALL", "NOTE"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { type: true, content: true, metadata: true, createdAt: true, scheduledAt: true },
      });
      for (const ev of events) {
        const meta = (ev.metadata ?? {}) as { estimateId?: string };
        // События про КП берём только этого объекта; звонки и заметки — все
        // (у клиента обычно один объект, а разделить их пока нечем).
        if (ev.type.startsWith("KP_") && meta.estimateId && !estimateIds.has(meta.estimateId)) continue;
        const text =
          ev.type === "KP_VIEWED" ? "Клиент открыл КП"
          : ev.type === "KP_CONFIRMED" ? "Клиент принял КП"
          : ev.type === "KP_REJECTED" ? "Клиент отклонил КП"
          : ev.type === "INSTALL" ? `Монтаж${ev.scheduledAt ? " · " + ev.scheduledAt.toLocaleDateString("ru-KZ") : ""}`
          : ev.type === "CALL" ? `Звонок${ev.content ? " · " + ev.content : ""}`
          : ev.content || "Заметка";
        history.push({ at: ev.createdAt.toISOString(), type: ev.type, text, estimateId: meta.estimateId });
      }
    }
    history.sort((a, b) => b.at.localeCompare(a.at));

    return NextResponse.json({
      id: obj.id,
      address: obj.address,
      totalArea: obj.totalArea,
      latitude: obj.latitude,
      longitude: obj.longitude,
      measuredAt: (obj.measuredAt ?? obj.createdAt).toISOString(),
      createdAt: obj.createdAt.toISOString(),
      updatedAt: obj.updatedAt.toISOString(),
      publicShareId: obj.publicShareId,
      client: obj.client,
      // Кто делает (Этап 3) — мобилка показывает только когда scope.isTeam
      measuredBy: obj.measuredBy,
      installer: obj.installer,
      installerFee: obj.installerFee,
      installAt: obj.installAt?.toISOString() ?? null,
      workOrderUrl: obj.workOrderToken ? `https://potolok.ai/n/${obj.workOrderToken}` : null,
      rooms: obj.rooms,
      estimates: obj.estimates.map((e) => ({
        ...e,
        isPrimary: primary?.id === e.id,
      })),
      workshopOrders: obj.workshopOrders,
      money: { ...money, payments: obj.payments.map((p) => ({ id: p.id, amount: p.amount, kind: p.kind, note: p.note, paidAt: p.paidAt.toISOString() })) },
      stage,
      stageLabel: STAGE_LABELS[stage],
      stageIsManual: isManual,
      autoStage: autoStage({ estimates: obj.estimates, workshopOrders: obj.workshopOrders }),
      primaryEstimateId: primary?.id ?? null,
      total: primary?.total ?? null,
      history,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get object error:", error);
    return NextResponse.json({ error: "Ошибка загрузки объекта" }, { status: 500 });
  }
}

/**
 * Ручной этап. Тело: { manualStage: "installed" | ... | null }.
 * null — вернуть автоматический расчёт.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = (await request.json()) as {
      manualStage?: unknown;
      measuredByMemberId?: unknown;
      installerMemberId?: unknown;
      installerFee?: unknown;
      installAt?: unknown;
      materialCost?: unknown;
      installerPaid?: unknown;
    };

    const data: {
      manualStage?: string | null;
      measuredByMemberId?: string | null;
      installerMemberId?: string | null;
      installerFee?: number | null;
      installAt?: Date | null;
      materialCost?: number | null;
      installerPaidAt?: Date | null;
    } = {};
    if ("materialCost" in body) {
      const v = body.materialCost;
      if (v !== null && (typeof v !== "number" || v < 0 || v > 100_000_000)) {
        return NextResponse.json({ error: "Сумма материала некорректна" }, { status: 400 });
      }
      data.materialCost = v === null ? null : Math.round(v as number);
    }
    if ("installerPaid" in body) {
      data.installerPaidAt = body.installerPaid ? new Date() : null;
    }

    if ("manualStage" in body) {
      const manualStage = body.manualStage;
      if (manualStage !== null && !isObjectStage(manualStage)) {
        return NextResponse.json({ error: "Неизвестный этап" }, { status: 400 });
      }
      data.manualStage = manualStage as string | null;
    }
    // Исполнители — только участники этой компании
    const memberIds = new Set(scope.members.map((m) => m.id));
    for (const key of ["measuredByMemberId", "installerMemberId"] as const) {
      if (key in body) {
        const v = body[key];
        if (v !== null && (typeof v !== "string" || !memberIds.has(v))) {
          return NextResponse.json({ error: "Такого человека нет в компании" }, { status: 400 });
        }
        data[key] = v as string | null;
      }
    }
    if ("installerFee" in body) {
      const v = body.installerFee;
      if (v !== null && (typeof v !== "number" || v < 0 || v > 100_000_000)) {
        return NextResponse.json({ error: "Сумма монтажа некорректна" }, { status: 400 });
      }
      data.installerFee = v === null ? null : Math.round(v as number);
    }
    if ("installAt" in body) {
      const v = body.installAt;
      if (v !== null) {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Дата монтажа некорректна" }, { status: 400 });
        data.installAt = d;
      } else data.installAt = null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нечего менять" }, { status: 400 });
    }

    const existing = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    const updated = await prisma.measurementObject.update({
      where: { id },
      data,
      select: {
        manualStage: true,
        installerFee: true,
        installAt: true,
        materialCost: true,
        installerPaidAt: true,
        measuredBy: { select: { id: true, name: true } },
        installer: { select: { id: true, name: true, phone: true } },
        estimates: { where: { deletedAt: null }, select: { status: true, total: true, createdAt: true, deletedAt: true, partner: { select: { amount: true } } } },
        workshopOrders: { select: { id: true } },
        payments: { select: { id: true, amount: true, kind: true, note: true, paidAt: true } },
      },
    });
    const primary = pickPrimaryEstimate(updated.estimates);
    const owner = await prisma.master.findUnique({ where: { id: scope.ownerId }, select: { materialPercent: true } });
    const money = moneySummary({
      price: primary?.total ?? null,
      payments: updated.payments,
      materialCost: updated.materialCost,
      materialPercent: owner?.materialPercent ?? 40,
      installerFee: updated.installerFee,
      installerPaidAt: updated.installerPaidAt,
      partnerAmount: primary?.partner?.amount ?? 0,
    });
    const { stage, isManual } = resolveStage({ ...updated, settled: money.settled });
    return NextResponse.json({
      stage, stageLabel: STAGE_LABELS[stage], stageIsManual: isManual,
      measuredBy: updated.measuredBy, installer: updated.installer,
      installerFee: updated.installerFee, installAt: updated.installAt?.toISOString() ?? null,
      money: { ...money, payments: updated.payments.map((p) => ({ id: p.id, amount: p.amount, kind: p.kind, note: p.note, paidAt: p.paidAt.toISOString() })) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Patch object error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}

function roomsWord(n: number): string {
  const last2 = n % 100;
  const last = n % 10;
  if (last2 >= 11 && last2 <= 14) return "комнат";
  if (last === 1) return "комната";
  if (last >= 2 && last <= 4) return "комнаты";
  return "комнат";
}
