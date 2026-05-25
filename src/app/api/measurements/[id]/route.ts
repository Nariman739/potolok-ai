import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateClient } from "@/lib/clients";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      include: { rooms: { orderBy: { sortOrder: "asc" } } },
    });

    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    return NextResponse.json(obj);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get measurement error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { address, status, totalArea, latitude, longitude, clientId, clientName, clientPhone, rooms } = body as {
      address?: string;
      status?: string;
      totalArea?: number;
      latitude?: number;
      longitude?: number;
      clientId?: string | null;
      clientName?: string;
      clientPhone?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rooms?: { name: string; walls: number[]; normalCorners: boolean[]; angles?: number[]; arcBulges?: number[]; columns?: any[]; area: number; perimeter: number; elements?: any[] }[];
    };

    // Привязка клиента: явный clientId → валидируем; иначе auto-create по имени/телефону.
    // Раньше PATCH принимал только clientId — поэтому при «Обновить» новый клиент не
    // создавался и не появлялся в CRM (в отличие от POST, который создаёт сам).
    let safeClientId: string | null | undefined = undefined;
    if (clientId === null) {
      safeClientId = null;
    } else if (typeof clientId === "string" && clientId) {
      const exists = await prisma.client.findFirst({
        where: { id: clientId, masterId: master.id },
        select: { id: true },
      });
      safeClientId = exists?.id ?? null;
    } else if (clientName || clientPhone) {
      const auto = await getOrCreateClient({
        masterId: master.id,
        name: clientName || null,
        phone: clientPhone || null,
        address: address || null,
      });
      safeClientId = auto?.id ?? undefined;
    }

    // Проверяем что объект принадлежит мастеру
    const owner = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Обновляем метаданные
    await prisma.measurementObject.update({
      where: { id },
      data: {
        ...(address !== undefined && { address }),
        ...(status !== undefined && { status }),
        ...(totalArea !== undefined && { totalArea }),
        ...(latitude != null && { latitude }),
        ...(longitude != null && { longitude }),
        ...(safeClientId !== undefined && { clientId: safeClientId }),
      },
    });

    // Если переданы rooms — пересоздаём их. Старые комнаты с фото
    // полностью заменяются на новые (фото в Vercel Blob остаются,
    // но ссылки в БД пропадают — это допустимо, мастер пересохраняет
    // замер только при добавлении новой комнаты).
    if (rooms && Array.isArray(rooms)) {
      await prisma.measurementRoom.deleteMany({
        where: { objectId: id },
      });
      if (rooms.length > 0) {
        await prisma.measurementRoom.createMany({
          data: rooms.map((r, i) => ({
            objectId: id,
            name: r.name,
            walls: r.walls,
            normalCorners: r.normalCorners || r.walls.map(() => true),
            angles: r.angles ?? undefined,
            arcBulges: r.arcBulges ?? undefined,
            columns: r.columns ?? undefined,
            area: r.area,
            perimeter: r.perimeter,
            elements: r.elements || [],
            sortOrder: i,
          })),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update measurement error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.measurementObject.deleteMany({
      where: { id, masterId: master.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete measurement error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
