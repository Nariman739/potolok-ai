import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope, currencyFor } from "@/lib/company";
import { calculate } from "@/lib/calculate";
import type { RoomInput, ExtraItem } from "@/lib/types";
import { priceBookCompanyId, priceMapFor, customItemsMapFor, ownItemsByIdFor } from "@/lib/price-items";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const body = await request.json();
    const { rooms, extraItems } = body as { rooms: RoomInput[]; extraItems?: ExtraItem[] };

    if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json(
        { error: "Добавьте хотя бы одну комнату" },
        { status: 400 }
      );
    }

    // Прайс компании — PriceItem («Мой прайс», 01.10.2026)
    const companyId = await priceBookCompanyId(scope.ownerId);
    const priceMap = await priceMapFor(companyId, await currencyFor(scope.ownerId));
    const customItemsMap = await customItemsMapFor(companyId);

    const ownItemsById = await ownItemsByIdFor(companyId);

    const result = calculate(rooms, priceMap, customItemsMap, extraItems, ownItemsById);
    if (!Number.isFinite(result.total)) {
      return NextResponse.json({ error: "Не удалось посчитать: у комнаты нет размеров" }, { status: 400 });
    }

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
