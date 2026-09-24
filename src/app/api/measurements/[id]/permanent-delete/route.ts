import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

// POST /api/measurements/[id]/permanent-delete
// Жёсткое удаление soft-deleted замера. Доступно только из корзины.
//
// Cascade: MeasurementRoom уйдёт через onDelete:Cascade. Фото комнат
// в Vercel Blob остаются — отдельный bucket cleanup при необходимости.
// Visualization — onDelete зависит от schema (если cascade — тоже удалится).
// 24.09.2026: корзина осталась на проверке «я автор записи», когда всё
// остальное перешло на принадлежность компании. Уволенный сотрудник мог
// вернуть из корзины и БЕЗВОЗВРАТНО удалить объект, КП или клиента бригады —
// то есть уничтожить ровно те данные, которые переход на компании и защищал.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    const existing = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Замер не найден в корзине" }, { status: 404 });
    }

    await prisma.measurementObject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Permanent-delete measurement error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
