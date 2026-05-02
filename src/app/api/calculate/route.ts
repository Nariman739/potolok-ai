import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculate, type CustomItemInfo } from "@/lib/calculate";
import { DEFAULT_PRICES } from "@/lib/constants";
import type { RoomInput, ExtraItem } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { rooms, extraItems } = body as { rooms: RoomInput[]; extraItems?: ExtraItem[] };

    if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json(
        { error: "Добавьте хотя бы одну комнату" },
        { status: 400 }
      );
    }

    // Load master's custom prices
    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: master.id },
    });

    // Merge: master prices override defaults
    const priceMap: Record<string, number> = { ...DEFAULT_PRICES };
    for (const mp of masterPrices) {
      priceMap[mp.itemCode] = mp.price;
    }

    // Load custom items for calculation
    const customItems = await prisma.customItem.findMany({
      where: { masterId: master.id },
    });
    const customItemsMap: Record<string, CustomItemInfo> = {};
    for (const ci of customItems) {
      customItemsMap[ci.code] = {
        code: ci.code,
        name: ci.name,
        unit: ci.unit,
        price: ci.price,
      };
    }

    const result = calculate(rooms, priceMap, customItemsMap, extraItems);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Calculate error:", error);
    return NextResponse.json(
      { error: "Ошибка расчёта" },
      { status: 500 }
    );
  }
}
