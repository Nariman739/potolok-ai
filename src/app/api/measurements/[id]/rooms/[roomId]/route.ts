import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const master = await requireAuth();
    const { id, roomId } = await params;
    const body = await request.json();
    const { name, walls, normalCorners, area, perimeter, elements } = body as {
      name?: string;
      walls?: number[];
      normalCorners?: boolean[];
      area?: number;
      perimeter?: number;
      elements?: unknown;
    };

    // Verify ownership
    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (name !== undefined) data.name = name;
    if (walls !== undefined) data.walls = walls;
    if (normalCorners !== undefined) data.normalCorners = normalCorners;
    if (area !== undefined) data.area = area;
    if (perimeter !== undefined) data.perimeter = perimeter;
    if (elements !== undefined) data.elements = elements;

    const result = await prisma.measurementRoom.updateMany({
      where: { id: roomId, objectId: id },
      data,
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    // Update totalArea
    if (area !== undefined) {
      const allRooms = await prisma.measurementRoom.findMany({
        where: { objectId: id },
        select: { area: true },
      });
      const totalArea = Math.round(allRooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
      await prisma.measurementObject.update({
        where: { id },
        data: { totalArea },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update room error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const master = await requireAuth();
    const { id, roomId } = await params;

    // Verify ownership
    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const result = await prisma.measurementRoom.deleteMany({
      where: { id: roomId, objectId: id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    // Update totalArea
    const allRooms = await prisma.measurementRoom.findMany({
      where: { objectId: id },
      select: { area: true },
    });
    const totalArea = Math.round(allRooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
    await prisma.measurementObject.update({
      where: { id },
      data: { totalArea },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete room error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
