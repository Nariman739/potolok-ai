import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEstimateLocked, estimateLockMessage } from "@/lib/estimate-lock";
import { getScope, inScope } from "@/lib/company";
import type { CalculationResult, LineItem, RoomResult } from "@/lib/types";
import { resolveAdjust, estimateAdjustData } from "@/lib/kp-adjust-server";
import { KpAdjustError } from "@/lib/kp-adjust-server";

/**
 * PATCH /api/estimates/[id]/items
 * Принимает обновлённый список roomResults (или extraItems) и пересохраняет
 * calculationData + totals. Используется для inline-редактирования позиций КП.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = (await request.json()) as {
      roomResults?: RoomResult[];
      extraItems?: LineItem[];
    };

    const existing = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: { partner: { select: { amount: true, percent: true, coef: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }
    if (isEstimateLocked(existing)) {
      return NextResponse.json({ error: estimateLockMessage(existing) }, { status: 409 });
    }

    const calc = existing.calculationData as unknown as CalculationResult;

    const updatedRoomResults = (body.roomResults ?? calc.roomResults ?? []).map(
      (rr) => recalcRoom(rr)
    );
    const updatedExtraItems = (body.extraItems ?? calc.extraItems ?? []).map(
      (it) => ({ ...it, total: round(it.quantity * it.unitPrice) })
    );

    // Итог считает resolveAdjust: позиции правятся «как есть» (в них уже сидит
    // посредник, если он был), а скидка мастера остаётся — раньше правка одной
    // строки молча обнуляла скидку в total.
    const adjust = resolveAdjust(
      { ...calc, roomResults: updatedRoomResults, extraItems: updatedExtraItems },
      { discount: undefined, partner: undefined },
      existing
    );
    const newTotal = adjust.total;

    await prisma.estimate.update({
      where: { id },
      data: estimateAdjustData(adjust),
    });

    revalidatePath(`/dashboard/estimates/${id}`);

    return NextResponse.json({ success: true, total: newTotal });
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Patch estimate items error:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения позиций" },
      { status: 500 }
    );
  }
}

function recalcRoom(rr: RoomResult): RoomResult {
  const items = rr.items.map((it) => ({
    ...it,
    total: round(it.quantity * it.unitPrice),
  }));
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const subtotalAfterHeight = rr.heightMultiplied
    ? round(subtotal * 1.3)
    : round(subtotal);
  return { ...rr, items, subtotal: round(subtotal), subtotalAfterHeight };
}

function round(n: number): number {
  return Math.round(n);
}
