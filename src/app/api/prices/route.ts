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

    const mpMap: Record<string, { price: number; photoUrl: string | null; isHidden: boolean }> = {};
    for (const mp of masterPrices) {
      mpMap[mp.itemCode] = {
        price: mp.price,
        photoUrl: mp.photoUrl,
        isHidden: mp.isHidden,
      };
    }

    // Return all items with master's overrides (price/photo/hidden)
    const items = PRODUCT_ITEMS.map((item) => {
      const mp = mpMap[item.code];
      return {
        code: item.code,
        name: item.name,
        unit: item.unit,
        category: item.category,
        description: item.description,
        defaultPrice: item.defaultPrice,
        price: mp?.price ?? item.defaultPrice,
        photoUrl: mp?.photoUrl ?? null,
        isHidden: mp?.isHidden ?? false,
        isCustom: mp != null && mp.price !== item.defaultPrice,
      };
    });

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
