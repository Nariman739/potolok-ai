import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { calculateForOwner } from "@/lib/calculate-for-owner";
import type { RoomInput, ExtraItem } from "@/lib/types";

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

    const result = await calculateForOwner(scope.ownerId, rooms, extraItems);
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
