import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/estimates/[id]/permanent-delete
// Жёсткое удаление soft-deleted КП из корзины. Возможно ТОЛЬКО для записей,
// уже находящихся в корзине (deletedAt не null) — защита от случайного
// мгновенного удаления.
//
// Cascade: ChatSession уйдёт через onDelete:Cascade в schema.
// PDF в Vercel Blob — НЕ удаляем (отдельный bucket cleanup при необходимости).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден в корзине" }, { status: 404 });
    }

    await prisma.estimate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Permanent-delete estimate error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
