import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { priceBookCompanyId } from "@/lib/price-items";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Прайс компании меняет её владелец" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const { name, unit, price } = body as { name?: string; unit?: string; price?: number };
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      return NextResponse.json({ error: "Неверная цена" }, { status: 400 });
    }

    const companyId = await priceBookCompanyId(scope.ownerId);
    const item = await prisma.priceItem.updateMany({
      where: { id, companyId, category: "custom", deletedAt: null },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(unit !== undefined && { unit }),
        ...(price !== undefined && { price: Number(price) }),
      },
    });

    if (item.count === 0) {
      return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update custom item error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Прайс компании меняет её владелец" }, { status: 403 });
    }
    const { id } = await params;
    const companyId = await priceBookCompanyId(scope.ownerId);
    // Мягкое удаление, как у остального прайса: вернуть можно из корзины.
    const item = await prisma.priceItem.updateMany({
      where: { id, companyId, category: "custom", deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (item.count === 0) {
      return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete custom item error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
