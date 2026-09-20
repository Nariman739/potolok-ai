import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import {
  resolveStage,
  estimateOnlyStage,
  pickPrimaryEstimate,
  type ObjectStage,
} from "@/lib/object-stage";

/**
 * Лента объектов — одна строка на объект вместо двух вкладок «Замеры» и «КП».
 *
 * Строка бывает двух видов:
 *  - kind: "object"   — живой замер (MeasurementObject) со всеми его КП,
 *                       отправками в цех и этапом;
 *  - kind: "estimate" — КП без объекта: быстрое КП (доделка/переделка) или
 *                       старое КП, чей замер был «съеден» до 19.09.2026.
 *                       Их нельзя потерять из виду — 300+ штук у мастеров.
 *
 * Сортировка — по последней активности (правка замера, новое КП, отправка в
 * цех), свежее сверху. Мастер открывает приложение ради «найти объект и
 * отправить в цех» — ему нужны те, с которыми он работал только что.
 */

export type ObjectFeedRow = {
  kind: "object" | "estimate";
  id: string;
  title: string;
  address: string | null;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  roomsCount: number;
  totalArea: number;
  stage: ObjectStage;
  stageIsManual: boolean;
  /** Сумма принятого КП, иначе последнего; null — КП ещё нет. */
  total: number | null;
  estimatesCount: number;
  hasConfirmed: boolean;
  /** Сколько раз чертёж уходил в цех. */
  workshopCount: number;
  workshopSentAt: string | null;
  measuredAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  /** Первая комната с чертежом — для миниатюры в строке. */
  preview: { walls: number[]; angles: number[] } | null;
  /** Для kind=estimate: id КП, чтобы открыть экран КП. Для object — id принятого/последнего КП. */
  primaryEstimateId: string | null;
};

function maxDate(...dates: (Date | null | undefined)[]): Date {
  let best: Date | null = null;
  for (const d of dates) {
    if (d && (!best || d.getTime() > best.getTime())) best = d;
  }
  return best ?? new Date(0);
}

export async function GET(request: NextRequest) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const stageFilter = request.nextUrl.searchParams.get("stage");

    const [objects, orphanEstimates] = await Promise.all([
      prisma.measurementObject.findMany({
        where: { ...inScope(scope), deletedAt: null },
        select: {
          id: true,
          address: true,
          totalArea: true,
          manualStage: true,
          measuredAt: true,
          createdAt: true,
          updatedAt: true,
          clientId: true,
          client: { select: { id: true, name: true, phone: true } },
          _count: { select: { rooms: true } },
          rooms: {
            orderBy: { sortOrder: "asc" },
            select: { walls: true, angles: true },
          },
          estimates: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              total: true,
              clientName: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
            },
          },
          workshopOrders: {
            orderBy: { sentAt: "desc" },
            select: { id: true, sentAt: true },
          },
        },
      }),
      // КП без объекта. Замер у них либо не делался (быстрое КП), либо ушёл в
      // корзину до 19.09.2026 — в ленте они живут отдельной строкой.
      prisma.estimate.findMany({
        where: { ...inScope(scope), deletedAt: null, measurementObjectId: null },
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          clientAddress: true,
          clientId: true,
          client: { select: { id: true, name: true, phone: true } },
          total: true,
          totalArea: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          calculationData: true,
        },
      }),
    ]);

    const rows: ObjectFeedRow[] = [];

    for (const o of objects) {
      const { stage, isManual } = resolveStage({
        manualStage: o.manualStage,
        estimates: o.estimates,
        workshopOrders: o.workshopOrders,
      });
      const primary = pickPrimaryEstimate(o.estimates);
      const previewRoom = o.rooms.find((r) => Array.isArray(r.walls) && (r.walls as number[]).length >= 3);
      const lastEstimateAt = o.estimates.reduce<Date | null>(
        (acc, e) => (acc && acc > e.updatedAt ? acc : e.updatedAt),
        null,
      );
      const clientName = o.client?.name ?? primary?.clientName ?? null;
      rows.push({
        kind: "object",
        id: o.id,
        title: o.address || clientName || "Без адреса",
        address: o.address || null,
        clientId: o.client?.id ?? o.clientId ?? null,
        clientName,
        clientPhone: o.client?.phone ?? null,
        roomsCount: o._count.rooms,
        totalArea: o.totalArea,
        stage,
        stageIsManual: isManual,
        total: primary ? primary.total : null,
        estimatesCount: o.estimates.length,
        hasConfirmed: o.estimates.some((e) => e.status === "CONFIRMED"),
        workshopCount: o.workshopOrders.length,
        workshopSentAt: o.workshopOrders[0]?.sentAt.toISOString() ?? null,
        measuredAt: (o.measuredAt ?? o.createdAt).toISOString(),
        createdAt: o.createdAt.toISOString(),
        lastActivityAt: maxDate(o.updatedAt, lastEstimateAt, o.workshopOrders[0]?.sentAt).toISOString(),
        preview: previewRoom
          ? {
              walls: previewRoom.walls as number[],
              angles: Array.isArray(previewRoom.angles) ? (previewRoom.angles as number[]) : [],
            }
          : null,
        primaryEstimateId: primary?.id ?? null,
      });
    }

    for (const e of orphanEstimates) {
      const calc = e.calculationData as { roomResults?: unknown[] } | null;
      const roomsCount = Array.isArray(calc?.roomResults) ? calc!.roomResults!.length : 0;
      const clientName = e.client?.name ?? e.clientName ?? null;
      const isQuick = !e.totalArea || e.totalArea === 0;
      rows.push({
        kind: "estimate",
        id: e.id,
        title: e.clientAddress || clientName || (isQuick ? "Быстрое КП" : `КП ${e.totalArea.toFixed(1)} м²`),
        address: e.clientAddress || null,
        clientId: e.client?.id ?? e.clientId ?? null,
        clientName,
        clientPhone: e.client?.phone ?? e.clientPhone ?? null,
        roomsCount,
        totalArea: e.totalArea,
        stage: estimateOnlyStage(e.status),
        stageIsManual: false,
        total: e.total,
        estimatesCount: 1,
        hasConfirmed: e.status === "CONFIRMED",
        workshopCount: 0,
        workshopSentAt: null,
        measuredAt: null,
        createdAt: e.createdAt.toISOString(),
        lastActivityAt: e.updatedAt.toISOString(),
        preview: null,
        primaryEstimateId: e.id,
      });
    }

    let result = rows;
    if (q) {
      result = result.filter((r) =>
        [r.title, r.address, r.clientName, r.clientPhone]
          .some((v) => v && v.toLowerCase().includes(q)),
      );
    }
    if (stageFilter) {
      result = result.filter((r) => r.stage === stageFilter);
    }
    result.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get objects feed error:", error);
    return NextResponse.json({ error: "Ошибка загрузки объектов" }, { status: 500 });
  }
}
