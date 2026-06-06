import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/prices/variants/[id]/restore
// Восстанавливает soft-deleted вариант прайса. Фото в Vercel Blob осталось
// нетронутым при удалении — variant полностью функционален после restore.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;

    const result = await prisma.priceVariant.updateMany({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Вариант не найден в корзине" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Restore variant error:", error);
    return NextResponse.json({ error: "Ошибка восстановления" }, { status: 500 });
  }
}
