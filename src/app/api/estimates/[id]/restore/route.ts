import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

// POST /api/estimates/[id]/restore
// Восстанавливает soft-deleted КП. Используется /dashboard/trash.
// Запись становится снова видна везде (LIST/GET фильтруют deletedAt=null).
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

    // Ищем именно soft-deleted запись (deletedAt не null), привязанную к мастеру.
    const existing = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: { not: null } },
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
