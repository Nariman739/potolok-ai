import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getScope, inScope, currencyFor } from "@/lib/company";
import { priceBookCompanyId, priceMapFor } from "@/lib/price-items";
import { pickPrimaryEstimate } from "@/lib/object-stage";
import type { CalculationResult } from "@/lib/types";
import {
  autoWorkOrderLines, parseWorkOrderDoc, sanitizeWorkOrderLines, workOrderTotal,
  type WorkOrderLine, type WorkOrderLinesDoc,
} from "@/lib/work-order-lines";

/**
 * Наряд монтажнику (Этап 3). POST — ссылка: создаётся один раз и живёт вместе
 * с объектом, наряд всегда показывает актуальные комнаты и сумму.
 *
 * GET / PUT (29.10.2026) — строки оплаты монтажнику: мастер правит их в
 * приложении как КП (количество, ставка, свои строки) до отправки, монтажник
 * видит ровно это по ссылке и в PDF. См. src/lib/work-order-lines.ts.
 *
 * installerFee пишет только этот маршрут (и PATCH объекта — тогда строки
 * сбрасываются): одна сумма, один источник.
 */

type Scope = Awaited<ReturnType<typeof getScope>>;

async function loadObject(id: string, scope: Scope) {
  return prisma.measurementObject.findFirst({
    where: { id, ...inScope(scope), deletedAt: null },
    select: {
      id: true,
      workOrderToken: true,
      workOrderLines: true,
      installerFee: true,
      installer: { select: { defaultFee: true } },
      estimates: { where: { deletedAt: null }, select: { id: true, status: true, createdAt: true, updatedAt: true, deletedAt: true } },
    },
  });
}
type Obj = NonNullable<Awaited<ReturnType<typeof loadObject>>>;

/** Авто-строки из главного КП + от какого КП они. */
async function autoLinesFor(obj: Obj, scope: Scope) {
  const primary = pickPrimaryEstimate(obj.estimates);
  const calc = primary
    ? (await prisma.estimate.findUnique({ where: { id: primary.id }, select: { calculationData: true } }))?.calculationData
    : null;
  const prices = await priceMapFor(await priceBookCompanyId(scope.ownerId));
  const lines = autoWorkOrderLines(calc as CalculationResult | null, prices);
  return { lines, primary };
}

function docFrom(lines: WorkOrderLine[], primary: { id: string; updatedAt: Date } | null): WorkOrderLinesDoc {
  return {
    v: 1,
    lines,
    updatedAt: new Date().toISOString(),
    estimateId: primary?.id,
    estimateUpdatedAt: primary?.updatedAt.toISOString(),
  };
}

/** КП пересчитали или главным стало другое после того, как мастер зафиксировал строки. */
function isStale(doc: WorkOrderLinesDoc, primary: { id: string; updatedAt: Date } | null): boolean {
  if (!primary || !doc.estimateId) return false;
  if (doc.estimateId !== primary.id) return true;
  return !!doc.estimateUpdatedAt && primary.updatedAt.getTime() > new Date(doc.estimateUpdatedAt).getTime() + 1000;
}

function unauthorized(error: unknown) {
  return error instanceof Error && error.message === "Unauthorized"
    ? NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const doc = parseWorkOrderDoc(obj.workOrderLines);
    const primary = pickPrimaryEstimate(obj.estimates);
    let lines: WorkOrderLine[];
    let edited = !!doc;
    let stale = false;
    if (doc) {
      lines = doc.lines;
      stale = isStale(doc, primary);
    } else if (obj.installerFee != null) {
      // Сумма вбита руками до построчного наряда — показываем её одной строкой,
      // а не авто-расчёт: монтажник по ссылке видит именно эту цифру.
      lines = [{ key: "fee", room: "", name: "Оплата за монтаж", qty: 1, unit: "усл.", price: obj.installerFee }];
      edited = true;
    } else {
      lines = (await autoLinesFor(obj, scope)).lines;
      // Без КП, но у монтажника из «Людей» есть обычная ставка за объект — подставим.
      const fee = obj.installer?.defaultFee;
      if (lines.length === 0 && fee) lines = [{ key: "fee", room: "", name: "Оплата за монтаж", qty: 1, unit: "усл.", price: fee }];
    }
    return NextResponse.json({
      url: obj.workOrderToken ? `https://potolok.ai/n/${obj.workOrderToken}` : null,
      lines,
      edited,
      stale,
      hasEstimate: !!primary,
      total: workOrderTotal(lines),
      installerFee: obj.installerFee,
      currency: await currencyFor(scope.ownerId),
    });
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order lines error:", error);
    return NextResponse.json({ error: "Не удалось загрузить наряд" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const body = (await request.json()) as { lines?: unknown; reset?: unknown };

    // «Пересчитать из КП»: строки снова считаются из КП. installerFee обнуляем —
    // сумма без строк читается как «вбито руками». Зафиксируется при отправке (POST).
    if (body.reset === true) {
      const { lines } = await autoLinesFor(obj, scope);
      await prisma.measurementObject.update({
        where: { id },
        data: { workOrderLines: Prisma.DbNull, installerFee: null },
      });
      return NextResponse.json({ lines, edited: false, stale: false, total: workOrderTotal(lines) });
    }

    const lines = sanitizeWorkOrderLines(body.lines);
    if ("error" in lines) return NextResponse.json({ error: lines.error }, { status: 400 });
    const total = workOrderTotal(lines);
    const doc = docFrom(lines, pickPrimaryEstimate(obj.estimates));
    // installerFee = сумма строк: так «Деньги» на объекте и наряд не расходятся.
    await prisma.measurementObject.update({
      where: { id },
      data: { workOrderLines: doc, installerFee: total > 0 ? total : null },
    });
    return NextResponse.json({ lines, edited: true, stale: false, total });
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order lines save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить наряд" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    let token = obj.workOrderToken;
    const data: { workOrderToken?: string; workOrderLines?: WorkOrderLinesDoc; installerFee?: number } = {};
    if (!token) {
      token = randomBytes(9).toString("base64url");
      data.workOrderToken = token;
    }
    // Отправил наряд — строки и сумма зафиксированы (29.10.2026): монтажник
    // видит то, что мастер видел на экране, и «Деньги» знают, сколько ему должны.
    // Сумму, вбитую руками раньше, не трогаем — она и так уходит в наряд.
    if (!parseWorkOrderDoc(obj.workOrderLines) && obj.installerFee == null) {
      const { lines, primary } = await autoLinesFor(obj, scope);
      if (lines.length > 0) {
        data.workOrderLines = docFrom(lines, primary);
        data.installerFee = workOrderTotal(lines);
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.measurementObject.update({ where: { id }, data });
    }
    return NextResponse.json({ url: `https://potolok.ai/n/${token}`, token });
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order error:", error);
    return NextResponse.json({ error: "Не удалось создать наряд" }, { status: 500 });
  }
}
