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

    // Удаление объекта уносит в корзину и его КП одним и тем же моментом
    // (DELETE /objects/:id). Возвращали же только сам объект: он оживал без
    // цены, без КП и выпадал из «Должны мне» (аудит 24.09.2026). Поднимаем
    // пачку целиком — по той же отметке времени, с запасом в пару секунд.
    const trashed = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    });
    if (!trashed?.deletedAt) {
      return NextResponse.json({ error: "Замер не найден в корзине" }, { status: 404 });
    }
    const from = new Date(trashed.deletedAt.getTime() - 2000);
    const to = new Date(trashed.deletedAt.getTime() + 2000);

    const [, estimates] = await prisma.$transaction([
      prisma.measurementObject.update({ where: { id }, data: { deletedAt: null } }),
      prisma.estimate.updateMany({
        where: { measurementObjectId: id, deletedAt: { gte: from, lte: to } },
        data: { deletedAt: null },
      }),
    ]);

    return NextResponse.json({ success: true, estimatesRestored: estimates.count });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Restore measurement error:", error);
    return NextResponse.json({ error: "Ошибка восстановления" }, { status: 500 });
  }
}
