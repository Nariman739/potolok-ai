import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { priceBookCompanyId } from "@/lib/price-items";

// POST /api/prices/variants/[id]/restore
// Восстанавливает soft-deleted вариант прайса. Фото в Vercel Blob осталось
// нетронутым при удалении — variant полностью функционален после restore.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;

    // Корзина — по компании (с 01.10.2026 варианты живут в PriceItem).
    const scope = await getScope(master);
    const companyId = await priceBookCompanyId(scope.ownerId);
    const result = await prisma.priceItem.updateMany({
      where: { id, companyId, deletedAt: { not: null } },
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
