import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

// POST /api/measurements/[id]/restore
// Восстанавливает soft-deleted замер. Комнаты (MeasurementRoom) не теряли
// связь — они снова видны автоматически.
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

    const result = await prisma.measurementObject.updateMany({
      where: { id, ...inScope(scope), deletedAt: { not: null } },
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
