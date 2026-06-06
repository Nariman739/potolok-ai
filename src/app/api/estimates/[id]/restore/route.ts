import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/estimates/[id]/restore
// Восстанавливает soft-deleted КП. Используется /dashboard/trash.
// Запись становится снова видна везде (LIST/GET фильтруют deletedAt=null).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    // Ищем именно soft-deleted запись (deletedAt не null), привязанную к мастеру.
    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден в корзине" }, { status: 404 });
    }

    await prisma.estimate.update({
      where: { id },
      data: { deletedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Restore estimate error:", error);
    return NextResponse.json({ error: "Ошибка восстановления" }, { status: 500 });
  }
}
