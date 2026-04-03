import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const master = await requireAuth();
    const status = request.nextUrl.searchParams.get("status");

    const objects = await prisma.measurementObject.findMany({
      where: {
        masterId: master.id,
        ...(status && { status }),
      },
      include: { rooms: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(objects);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get measurements error:", error);
    return NextResponse.json({ error: "Ошибка загрузки замеров" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { address, status, rooms } = body as {
      address?: string;
      status?: string;
      rooms?: { name: string; walls: number[]; normalCorners: boolean[]; area: number; perimeter: number; elements?: any[] }[];
    };

    const totalArea = rooms
      ? Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100
      : 0;

    const obj = await prisma.measurementObject.create({
      data: {
        masterId: master.id,
        address: address || "",
        status: status || "active",
        totalArea,
        rooms: rooms
          ? {
              create: rooms.map((r, i) => ({
                name: r.name,
                walls: r.walls,
                normalCorners: r.normalCorners || r.walls.map(() => true),
                area: r.area,
                perimeter: r.perimeter,
                elements: r.elements || [],
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { rooms: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(obj);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create measurement error:", error);
    return NextResponse.json({ error: "Ошибка создания замера" }, { status: 500 });
  }
}
