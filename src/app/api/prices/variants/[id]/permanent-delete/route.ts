import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/prices/variants/[id]/permanent-delete
// Жёсткое удаление soft-deleted варианта прайса. Доступно только из корзины.
// В отличие от обычного soft-delete, ЗДЕСЬ удаляется фото из Vercel Blob.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;

    const existing = await prisma.priceVariant.findFirst({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      select: { id: true, photoUrl: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Вариант не найден в корзине" }, { status: 404 });
    }

    if (existing.photoUrl) {
      try { await del(existing.photoUrl); } catch { /* ignore — blob cleanup best-effort */ }
    }
    await prisma.priceVariant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Permanent-delete variant error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
