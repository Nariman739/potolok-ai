import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true, _count: { select: { rooms: true } } },
    });

    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Support both single room and array of rooms (for PhotoUpload bulk add)
    const roomsInput = Array.isArray(body) ? body : [body];

    const created = [];
    for (let i = 0; i < roomsInput.length; i++) {
      const r = roomsInput[i] as {
        name: string;
        walls: number[];
        normalCorners: boolean[];
        angles?: number[];
        arcBulges?: number[];
        columns?: unknown[];
        area: number;
        perimeter: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements?: any;
      };

      const room = await prisma.measurementRoom.create({
        data: {
          objectId: id,
          name: r.name || "",
          walls: r.walls,
          normalCorners: r.normalCorners,
          angles: r.angles ?? undefined,
          arcBulges: r.arcBulges ?? undefined,
          columns: r.columns as any ?? undefined,
          area: r.area,
          perimeter: r.perimeter,
          elements: r.elements ?? [],
          sortOrder: obj._count.rooms + i,
        },
      });
      created.push(room);
    }

    // Update totalArea on the object
    const allRooms = await prisma.measurementRoom.findMany({
      where: { objectId: id },
      select: { area: true },
    });
    const totalArea = Math.round(allRooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
    await prisma.measurementObject.update({
      where: { id },
      data: { totalArea },
    });

    return NextResponse.json(created.length === 1 ? created[0] : created);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Add room error:", error);
    return NextResponse.json({ error: "Ошибка добавления комнаты" }, { status: 500 });
  }
}
