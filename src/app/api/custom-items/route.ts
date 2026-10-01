import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { createCustomItem, priceBookCompanyId, toLegacyCustomItem } from "@/lib/price-items";

// «Свои позиции» веб-калькулятора — с 01.10.2026 это PriceItem{category:"custom"},
// ответ в старой форме CustomItem.
export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const companyId = await priceBookCompanyId(scope.ownerId);
    const items = await prisma.priceItem.findMany({
      where: { companyId, category: "custom", deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(items.map((r) => toLegacyCustomItem(r, scope.ownerId)));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get custom items error:", error);
    return NextResponse.json({ error: "Ошибка получения позиций" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Позиции в прайс компании добавляет её владелец" }, { status: 403 });
    }
    const body = await request.json();
    const { name, unit, price } = body as { name: string; unit: string; price: number };

    if (!name || !unit || price == null || !Number.isFinite(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const companyId = await priceBookCompanyId(scope.ownerId);
    const item = await createCustomItem(companyId, { name: String(name).trim(), unit, price: Number(price) });
    return NextResponse.json(toLegacyCustomItem(item, scope.ownerId));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create custom item error:", error);
    return NextResponse.json({ error: "Ошибка создания позиции" }, { status: 500 });
  }
}
