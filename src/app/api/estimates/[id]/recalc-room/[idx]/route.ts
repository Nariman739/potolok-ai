import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculate, type CustomItemInfo } from "@/lib/calculate";
import { DEFAULT_PRICES } from "@/lib/constants";
import { buildRoomInputFromDesigner } from "@/lib/room-input-builder";
import type { CalculationResult, RoomInput } from "@/lib/types";

interface DesignerPayload {
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  cornerRadii?: number[];
  area: number;
  perimeter: number;
  elements: Parameters<typeof buildRoomInputFromDesigner>[0]["elements"];
  previewUrl3d?: string;
  name?: string;
}

/**
 * POST /api/estimates/[id]/recalc-room/[idx]
 * Принимает обновлённый чертёж одной комнаты, перестраивает её RoomInput,
 * вызывает calculate() для всего КП и сохраняет.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; idx: string }> }
) {
  try {
    const master = await requireAuth();
    const { id, idx: idxStr } = await params;
    const idx = Number(idxStr);
    if (!Number.isFinite(idx) || idx < 0) {
      return NextResponse.json(
        { error: "Неверный индекс комнаты" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { designer: DesignerPayload };
    if (!body.designer) {
      return NextResponse.json(
        { error: "Нет данных чертежа" },
        { status: 400 }
      );
    }

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });
    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    const roomsData = (estimate.roomsData as unknown as RoomInput[]) ?? [];
    if (idx >= roomsData.length) {
      return NextResponse.json(
        { error: "Комната не найдена" },
        { status: 404 }
      );
    }

    // Собираем обновлённый RoomInput, опираясь на старый (чтобы сохранить ручные настройки).
    const existingRoom = roomsData[idx];
    const newName = body.designer.name?.trim() || existingRoom.name;
    const updatedRoom = buildRoomInputFromDesigner(
      {
        id: existingRoom.id,
        name: newName,
        walls: body.designer.walls,
        normalCorners: body.designer.normalCorners,
        angles: body.designer.angles,
        cornerRadii: body.designer.cornerRadii,
        area: body.designer.area,
        perimeter: body.designer.perimeter,
        elements: body.designer.elements,
        previewUrl3d: body.designer.previewUrl3d,
      },
      { ...existingRoom, name: newName }
    );

    const newRoomsData = roomsData.map((r, i) => (i === idx ? updatedRoom : r));

    // Готовим prices и custom items для пересчёта (как в /api/calculate).
    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: master.id },
    });
    const priceMap: Record<string, number> = { ...DEFAULT_PRICES };
    for (const mp of masterPrices) {
      priceMap[mp.itemCode] = mp.price;
    }

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

    const newCalc: CalculationResult = calculate(
      newRoomsData,
      priceMap,
      customItemsMap
    );

    await prisma.estimate.update({
      where: { id },
      data: {
        roomsData: newRoomsData as unknown as object,
        calculationData: newCalc as unknown as object,
        total: newCalc.total,
        standardTotal: newCalc.total,
        totalArea: newCalc.totalArea,
      },
    });

    // Сбрасываем кеш RSC — иначе страница КП и редактор показывают старый snapshot.
    revalidatePath(`/dashboard/estimates/${id}`);
    revalidatePath(`/dashboard/estimates/${id}/edit-room/${idx}`);

    return NextResponse.json({ success: true, total: newCalc.total });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Recalc room error:", error);
    return NextResponse.json(
      { error: "Ошибка пересчёта комнаты" },
      { status: 500 }
    );
  }
}
