import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_ITEMS } from "@/lib/constants";

export async function GET() {
  try {
    const master = await requireAuth();

    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: master.id },
    });

    const priceMap: Record<string, number> = {};
    for (const mp of masterPrices) {
      priceMap[mp.itemCode] = mp.price;
    }

    // Return all items with master's price (or default)
    const items = PRODUCT_ITEMS.map((item) => ({
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      description: item.description,
      defaultPrice: item.defaultPrice,
      price: priceMap[item.code] ?? item.defaultPrice,
      isCustom: item.code in priceMap && priceMap[item.code] !== item.defaultPrice,
    }));

    // Also load custom items and append them
    const customItems = await prisma.customItem.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "asc" },
    });

    const customPriceItems = customItems.map((ci) => ({
      code: ci.code,
      name: ci.name,
      unit: ci.unit,
      category: "custom" as const,
      description: undefined,
      defaultPrice: ci.price,
      price: ci.price,
      isCustom: false,
      isCustomItem: true,
      customItemId: ci.id,
    }));

    return NextResponse.json([...items, ...customPriceItems]);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get prices error:", error);
    return NextResponse.json(
      { error: "Ошибка получения цен" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { items } = body as { items: { itemCode: string; price: number }[] };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Данные цен обязательны" },
        { status: 400 }
      );
    }

    // Upsert all prices
    await Promise.all(
      items.map((item) =>
        prisma.masterPrice.upsert({
          where: {
            masterId_itemCode: {
              masterId: master.id,
              itemCode: item.itemCode,
            },
          },
          update: { price: item.price },
          create: {
            masterId: master.id,
            itemCode: item.itemCode,
            price: item.price,
          },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update prices error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления цен" },
      { status: 500 }
    );
  }
}
