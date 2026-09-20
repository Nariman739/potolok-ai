import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { getOrCreateClient } from "@/lib/clients";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
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
    const scope = await getScope(master);
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
      rooms?: { name: string; walls: number[]; normalCorners: boolean[]; angles?: number[]; arcBulges?: number[]; cornerRadii?: number[]; columns?: any[]; area: number; perimeter: number; elements?: any[]; wallProfiles?: Record<number, string>; variantOverrides?: Record<string, string> }[];
    };

    // Привязка клиента: явный clientId → валидируем; иначе auto-create по имени/телефону.
    // Раньше PATCH принимал только clientId — поэтому при «Обновить» новый клиент не
    // создавался и не появлялся в CRM (в отличие от POST, который создаёт сам).
    let safeClientId: string | null | undefined = undefined;
    if (clientId === null) {
      safeClientId = null;
    } else if (typeof clientId === "string" && clientId) {
      const exists = await prisma.client.findFirst({
        where: { id: clientId, ...inScope(scope), deletedAt: null },
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
      where: { id, ...inScope(scope), deletedAt: null },
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

    // Комнаты: по id обновляем на месте (id комнат сохраняются — записи «в цеху»,
    // фото и автосохранение с телефона ссылаются на них), без id — создаём,
    // не пришедшие — удаляем. До 20.09.2026 все комнаты пересоздавались с новыми
    // id, и после «Обновить» телефон держал мёртвые ссылки (404/400 в цех).
    //
    // ВАЖНО: пустой массив rooms игнорируется и НЕ стирает существующие.
    // Для очистки списка нужно явно использовать DELETE /api/measurements/[id]/rooms.
    if (rooms && Array.isArray(rooms) && rooms.length > 0) {
      const existingRooms = await prisma.measurementRoom.findMany({ where: { objectId: id }, select: { id: true } });
      const known = new Set(existingRooms.map((r) => r.id));
      const keep = new Set<string>();
      for (const [i, r] of rooms.entries()) {
        const data = {
          name: r.name,
          walls: r.walls,
          normalCorners: r.normalCorners || r.walls.map(() => true),
          angles: r.angles ?? undefined,
          arcBulges: r.arcBulges ?? undefined,
          cornerRadii: r.cornerRadii ?? undefined,
          columns: r.columns ?? undefined,
          area: r.area,
          perimeter: r.perimeter,
          elements: r.elements || [],
          wallProfiles: r.wallProfiles ?? undefined,
          variantOverrides: r.variantOverrides ?? undefined,
          sortOrder: i,
        };
        const rid = (r as { id?: string }).id;
        if (rid && known.has(rid)) {
          await prisma.measurementRoom.update({ where: { id: rid }, data });
          keep.add(rid);
        } else {
          const created = await prisma.measurementRoom.create({ data: { objectId: id, ...data }, select: { id: true } });
          keep.add(created.id);
        }
      }
      await prisma.measurementRoom.deleteMany({ where: { objectId: id, id: { notIn: Array.from(keep) } } });
    }

    const fresh = await prisma.measurementObject.findUnique({
      where: { id },
      include: { rooms: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } } },
    });
    return NextResponse.json({ success: true, rooms: fresh?.rooms ?? [] });
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
    const scope = await getScope(master);
    const { id } = await params;

    // Soft-delete: запись остаётся в БД, восстанавливается через /dashboard/trash.
    // См. PR-A 2026-06-03 — закрывает блокер из аудита 2026-06-01.
    const result = await prisma.measurementObject.updateMany({
      where: { id, ...inScope(scope), deletedAt: null },
      data: { deletedAt: new Date() },
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
