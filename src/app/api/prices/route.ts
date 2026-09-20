import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { PRODUCT_ITEMS } from "@/lib/constants";

export async function GET() {
  try {
    const master = await requireAuth();
    // Прайс общий на компанию — читаем и пишем у владельца (Этап 3).
    const scope = await getScope(master);

    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: scope.ownerId },
    });

    const mpMap: Record<string, { price: number; installerPrice: number | null; photoUrl: string | null; isHidden: boolean }> = {};
    for (const mp of masterPrices) {
      mpMap[mp.itemCode] = {
        price: mp.price,
        installerPrice: mp.installerPrice,
        photoUrl: mp.photoUrl,
        isHidden: mp.isHidden,
      };
    }

    // Return all items with master's overrides (price/photo/hidden + installer)
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
        installerPrice: mp?.installerPrice ?? null,
        photoUrl: mp?.photoUrl ?? null,
        isHidden: mp?.isHidden ?? false,
        isCustom: mp != null && mp.price !== item.defaultPrice,
      };
    });

    // Also load custom items and append them
    const customItems = await prisma.customItem.findMany({
      where: { masterId: scope.ownerId },
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
    // Прайс общий на компанию — читаем и пишем у владельца (Этап 3).
    const scope = await getScope(master);
    const body = await request.json();
    const { items } = body as { items: { itemCode: string; price: number; installerPrice?: number | null }[] };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Данные цен обязательны" },
        { status: 400 }
      );
    }

    // Upsert all prices (включая installerPrice если передан).
    await Promise.all(
      items.map((item) => {
        const installerPrice = item.installerPrice === null ? null : item.installerPrice;
        return prisma.masterPrice.upsert({
          where: {
            masterId_itemCode: {
              masterId: scope.ownerId,
              itemCode: item.itemCode,
            },
          },
          update: { price: item.price, ...(item.installerPrice !== undefined && { installerPrice }) },
          create: {
            masterId: scope.ownerId,
            itemCode: item.itemCode,
            price: item.price,
            installerPrice: installerPrice ?? null,
          },
        });
      })
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
