import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, LineItem, RoomResult } from "@/lib/types";

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
    const { id } = await params;
    const body = (await request.json()) as {
      roomResults?: RoomResult[];
      extraItems?: LineItem[];
    };

    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    const calc = existing.calculationData as unknown as CalculationResult;

    const updatedRoomResults = (body.roomResults ?? calc.roomResults ?? []).map(
      (rr) => recalcRoom(rr)
    );
    const updatedExtraItems = (body.extraItems ?? calc.extraItems ?? []).map(
      (it) => ({ ...it, total: round(it.quantity * it.unitPrice) })
    );

    const subtotal =
      updatedRoomResults.reduce((s, r) => s + r.subtotalAfterHeight, 0) +
      updatedExtraItems.reduce((s, it) => s + it.total, 0);
    const newTotal = round(subtotal);

    const newCalc: CalculationResult = {
      ...calc,
      roomResults: updatedRoomResults,
      extraItems: updatedExtraItems,
      subtotal: newTotal,
      total: newTotal,
    };

    await prisma.estimate.update({
      where: { id },
      data: {
        // Prisma ожидает Json-совместимое значение. CalculationResult — обычная
        // структура без Date/RegExp/функций, поэтому безопасно кастуем через unknown.
        calculationData: newCalc as unknown as object,
        total: newTotal,
        standardTotal: newTotal,
      },
    });

    revalidatePath(`/dashboard/estimates/${id}`);

    return NextResponse.json({ success: true, total: newTotal });
  } catch (error) {
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
