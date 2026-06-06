import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/measurements/[id]/restore
// Восстанавливает soft-deleted замер. Комнаты (MeasurementRoom) не теряли
// связь — они снова видны автоматически.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.measurementObject.updateMany({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Замер не найден в корзине" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Restore measurement error:", error);
    return NextResponse.json({ error: "Ошибка восстановления" }, { status: 500 });
  }
}
