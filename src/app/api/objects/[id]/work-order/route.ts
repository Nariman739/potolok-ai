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
  autoWorkOrderLines, parseWorkOrderDoc, sanitizeWorkOrderLines, workOrderTotal, type WorkOrderLinesDoc,
} from "@/lib/work-order-lines";

/**
 * Наряд монтажнику (Этап 3). POST — ссылка: создаётся один раз и живёт вместе
 * с объектом, наряд всегда показывает актуальные комнаты и сумму.
 *
 * GET / PUT (29.10.2026) — строки оплаты монтажнику: мастер правит их в
 * приложении как КП (количество, ставка, свои строки) до отправки, монтажник
 * видит ровно это по ссылке и в PDF. См. src/lib/work-order-lines.ts.
 */

async function loadObject(id: string, scope: Awaited<ReturnType<typeof getScope>>) {
  return prisma.measurementObject.findFirst({
    where: { id, ...inScope(scope), deletedAt: null },
    select: {
      id: true,
      workOrderToken: true,
      workOrderLines: true,
      installerFee: true,
      estimates: { where: { deletedAt: null }, select: { id: true, status: true, createdAt: true, deletedAt: true } },
    },
  });
}

async function autoLinesFor(obj: NonNullable<Awaited<ReturnType<typeof loadObject>>>, ownerId: string) {
  const primary = pickPrimaryEstimate(obj.estimates);
  const calc = primary
    ? (await prisma.estimate.findUnique({ where: { id: primary.id }, select: { calculationData: true } }))?.calculationData
    : null;
  const prices = await priceMapFor(await priceBookCompanyId(ownerId));
  return autoWorkOrderLines(calc as CalculationResult | null, prices);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const doc = parseWorkOrderDoc(obj.workOrderLines);
    const lines = doc ? doc.lines : await autoLinesFor(obj, scope.ownerId);
    return NextResponse.json({
      url: obj.workOrderToken ? `https://potolok.ai/n/${obj.workOrderToken}` : null,
      lines,
      edited: !!doc,
      total: workOrderTotal(lines),
      installerFee: obj.installerFee,
      currency: await currencyFor(scope.ownerId),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
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

    // «Сбросить к расчёту»: строки снова считаются из КП, сумма — по ним.
    if (body.reset === true) {
      const lines = await autoLinesFor(obj, scope.ownerId);
      const total = workOrderTotal(lines);
      await prisma.measurementObject.update({
        where: { id },
        data: { workOrderLines: Prisma.DbNull, installerFee: total > 0 ? total : null },
      });
      return NextResponse.json({ lines, edited: false, total });
    }

    const lines = sanitizeWorkOrderLines(body.lines);
    if ("error" in lines) return NextResponse.json({ error: lines.error }, { status: 400 });
    const total = workOrderTotal(lines);
    const doc: WorkOrderLinesDoc = { v: 1, lines, updatedAt: new Date().toISOString() };
    // installerFee = сумма строк: так «Деньги» на объекте и наряд не расходятся.
    await prisma.measurementObject.update({
      where: { id },
      data: { workOrderLines: doc, installerFee: total > 0 ? total : null },
    });
    return NextResponse.json({ lines, edited: true, total });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Work order lines save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить наряд" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: { id: true, workOrderToken: true },
    });
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    let token = obj.workOrderToken;
    if (!token) {
      token = randomBytes(9).toString("base64url");
      await prisma.measurementObject.update({ where: { id }, data: { workOrderToken: token } });
    }
    return NextResponse.json({ url: `https://potolok.ai/n/${token}`, token });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Work order error:", error);
    return NextResponse.json({ error: "Не удалось создать наряд" }, { status: 500 });
  }
}
