import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { priceBookCompanyId } from "@/lib/price-items";

// POST /api/prices/variants/[id]/permanent-delete
// Жёсткое удаление soft-deleted варианта прайса. Доступно только из корзины.
// В отличие от обычного soft-delete, ЗДЕСЬ удаляется фото из Vercel Blob.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;

    const scope = await getScope(master);
    const companyId = await priceBookCompanyId(scope.ownerId);
    const existing = await prisma.priceItem.findFirst({
      where: { id, companyId, deletedAt: { not: null } },
      select: { id: true, photoUrl: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Вариант не найден в корзине" }, { status: 404 });
    }

    if (existing.photoUrl) {
      try { await del(existing.photoUrl); } catch { /* ignore — blob cleanup best-effort */ }
    }
    await prisma.priceItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Permanent-delete variant error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
