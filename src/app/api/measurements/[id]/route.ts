import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { getOrCreateClient, findObjectClientByName, clientAddressFromObject } from "@/lib/clients";
import { isActiveMine, activeByFor } from "@/lib/measurement-active";
import { normalizeWallFurniture } from "@/lib/wall-furniture";
import { Prisma } from "@/generated/prisma/client";

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

    // activeMine — открыт в вебе именно у меня (а не у коллеги по компании).
    return NextResponse.json({ ...obj, activeMine: isActiveMine(obj, master.id) });
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
    const { address, status, totalArea, latitude, longitude, clientId, clientName, clientPhone, rooms, noInsert, canvasItemId } = body as {
      address?: string;
      status?: string;
      totalArea?: number;
      latitude?: number;
      longitude?: number;
      clientId?: string | null;
      clientName?: string;
      clientPhone?: string;
      /** «Убрать вставку везде» на объекте (30.10.2026) */
      noInsert?: boolean;
      /** Плёнка на весь объект (filmKey); null — снять выбор */
      canvasItemId?: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rooms?: { name: string; walls: number[]; normalCorners: boolean[]; angles?: number[]; arcBulges?: number[]; cornerRadii?: number[]; columns?: any[]; measureDiagonals?: number[]; obliqueDiagonals?: { from: number; to: number; length: number }[]; area: number; perimeter: number; elements?: any[]; wallProfiles?: Record<number, string>; variantOverrides?: Record<string, string>; withInsert?: boolean | null; insertColor?: string | null; wallFurniture?: unknown }[];
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
      // Имя без телефона: сначала клиент этого же объекта или его КП (13.11.2026) —
      // приложение после «Создать КП» дописывает объекту имя вторым запросом, и без
      // этого на одно сохранение заводился второй клиент с тем же именем.
      const sameObject = await findObjectClientByName({
        objectId: id,
        scopeWhere: inScope(scope),
        name: clientName,
        phone: clientPhone,
      });
      if (sameObject) {
        safeClientId = sameObject;
      } else {
        const auto = await getOrCreateClient({
          masterId: master.id,
          companyId: scope.companyId,
          masterIds: scope.masterIds,
          name: clientName || null,
          phone: clientPhone || null,
          // Адрес, равный имени, — название объекта, а не адрес клиента.
          address: clientAddressFromObject(address, clientName),
        });
        safeClientId = auto?.id ?? undefined;
      }
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
        ...activeByFor(status, master.id),
        ...(totalArea !== undefined && { totalArea }),
        ...(latitude != null && { latitude }),
        ...(longitude != null && { longitude }),
        ...(safeClientId !== undefined && { clientId: safeClientId }),
        ...(typeof noInsert === "boolean" && { noInsert }),
        ...((canvasItemId === null || (typeof canvasItemId === "string" && canvasItemId.length <= 64)) && { canvasItemId }),
      },
    });

    // Клиента указали уже после КП («Чей это объект?») — дотягиваем его и в КП
    // объекта, у которых клиента ещё нет. Иначе карточка клиента пустая: «ещё
    // нет КП», статус «Новый», хотя объект посчитан и оплачен (21.09.2026).
    if (typeof safeClientId === "string" && safeClientId) {
      await prisma.estimate
        .updateMany({ where: { measurementObjectId: id, clientId: null, deletedAt: null }, data: { clientId: safeClientId } })
        .catch((e) => console.warn("link estimates to client failed:", e));
    }

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
          measureDiagonals: r.measureDiagonals ?? undefined,
          obliqueDiagonals: r.obliqueDiagonals ?? undefined,
          area: r.area,
          perimeter: r.perimeter,
          elements: r.elements || [],
          wallProfiles: r.wallProfiles ?? undefined,
          variantOverrides: r.variantOverrides ?? undefined,
          // null = «как на объекте»; телефон шлёт поле всегда, чтобы снятая галочка комнаты доезжала.
          withInsert: typeof r.withInsert === "boolean" ? r.withInsert : null,
          sortOrder: i,
        };
        // Цвет вставки: старые клиенты поля не шлют — при обновлении не затираем (код-ревью 11.11.2026).
        const insertColor = r.insertColor === "black" || r.insertColor === "white" ? r.insertColor : null;
        // «Фасад шкафа (только для 3D)»: так же — старые сборки и сайт поля не шлют, не затираем.
        const wallFurniture = normalizeWallFurniture(r.wallFurniture, r.walls?.length);
        const rid = (r as { id?: string }).id;
        if (rid && known.has(rid)) {
          await prisma.measurementRoom.update({
            where: { id: rid },
            data: {
              ...data,
              ...(r.insertColor !== undefined && { insertColor }),
              ...(wallFurniture !== undefined && { wallFurniture: wallFurniture ?? Prisma.DbNull }),
            },
          });
          keep.add(rid);
        } else {
          const created = await prisma.measurementRoom.create({ data: { objectId: id, ...data, insertColor, wallFurniture: wallFurniture ?? undefined }, select: { id: true } });
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
    // Замер и объект — одна сущность, и удаляются теперь одинаково (13.11.2026): вместе с
    // объектом в корзину уходят его КП, той же отметкой времени — как в DELETE /api/objects/:id.
    // Раньше этот роут КП не трогал: после удаления замера с сайта КП оставались «живыми» без
    // объекта, а восстановление (оно поднимает КП по отметке времени) возвращало объект без них.
    const existing = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    const now = new Date();
    const [, estimates] = await prisma.$transaction([
      prisma.measurementObject.update({ where: { id }, data: { deletedAt: now } }),
      prisma.estimate.updateMany({ where: { measurementObjectId: id, deletedAt: null }, data: { deletedAt: now } }),
    ]);
    return NextResponse.json({ success: true, estimatesDeleted: estimates.count });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete measurement error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
