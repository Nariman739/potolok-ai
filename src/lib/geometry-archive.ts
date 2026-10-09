// Анонимный архив геометрии (09.10.2026). См. model GeometryArchive в schema.prisma.
//
// Зачем: замеры и КП мастеров — база для подсказок ассистента (средняя цена
// за м², типовые комнаты, расстановка света). Когда мастер окончательно
// удаляет объект или аккаунт, персональные данные обязаны исчезнуть, а чистая
// геометрия («комната 3,5×5,2, 6 спотов, 8 050 ₸/м²») персональными данными
// не является — её копируем сюда ДО удаления.
//
// Что НЕ попадает в архив: адрес, координаты, клиент, мастер, компания,
// фото, ссылки на 3D-снимки, точная дата (только месяц), публичные id.
// Ошибка архивации не должна мешать удалению: вызывающий код глотает её.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type ArchiveReason = "object-permanent-delete" | "account-delete";

type RoomRow = {
  name: string;
  walls: unknown;
  normalCorners: unknown;
  angles: unknown;
  arcBulges: unknown;
  cornerRadii: unknown;
  columns: unknown;
  measureDiagonals: unknown;
  obliqueDiagonals: unknown;
  area: number;
  perimeter: number;
  elements: unknown;
  wallProfiles: unknown;
  variantOverrides: unknown;
  sortOrder: number;
};

type EstimateRow = {
  status: string;
  totalArea: number;
  total: number;
  discountPercent: number;
  roomsData: unknown;
  createdAt: Date;
};

const ROOM_SELECT = {
  name: true,
  walls: true,
  normalCorners: true,
  angles: true,
  cornerRadii: true,
  arcBulges: true,
  columns: true,
  measureDiagonals: true,
  obliqueDiagonals: true,
  area: true,
  perimeter: true,
  elements: true,
  wallProfiles: true,
  variantOverrides: true,
  sortOrder: true,
} as const;

const ESTIMATE_SELECT = {
  status: true,
  totalArea: true,
  total: true,
  discountPercent: true,
  roomsData: true,
  createdAt: true,
} as const;

function month(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 7) : null;
}

// Название комнаты иногда содержит имя клиента («спальня Айгуль») — оставляем
// только общеупотребимые слова, остальное в «комната».
const ROOM_WORDS = /(зал|спальн|кухн|коридор|прихож|ванн|санузел|туалет|балкон|лодж|детск|гостин|кабинет|гардероб|кладов|холл|офис|бөлме|ас үй|жатын|дәліз|комнат|помещ)/i;
function roomName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  return ROOM_WORDS.test(n) && n.length <= 30 && !/\d{6,}/.test(n) ? n : "комната";
}

function packRooms(rooms: RoomRow[]) {
  return rooms
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      name: roomName(r.name),
      walls: r.walls,
      normalCorners: r.normalCorners,
      angles: r.angles,
      arcBulges: r.arcBulges,
      cornerRadii: r.cornerRadii,
      columns: r.columns,
      measureDiagonals: r.measureDiagonals,
      obliqueDiagonals: r.obliqueDiagonals,
      area: r.area,
      perimeter: r.perimeter,
      elements: r.elements,
      wallProfiles: r.wallProfiles,
      variantOverrides: r.variantOverrides,
    }));
}

function packEstimates(estimates: EstimateRow[]) {
  return estimates.map((e) => ({
    status: e.status,
    totalArea: e.totalArea,
    total: e.total,
    discountPercent: e.discountPercent,
    month: month(e.createdAt),
    // roomsData — RoomInput[]: размеры, полотно, споты, люстры; имён клиентов там нет
    roomsData: e.roomsData,
  }));
}

/** Архивирует один объект замера (с его комнатами и привязанными КП). Возвращает id записи или null. */
export async function archiveObjectGeometry(
  objectId: string,
  reason: ArchiveReason,
  currency: string | null,
): Promise<string | null> {
  const obj = await prisma.measurementObject.findUnique({
    where: { id: objectId },
    select: {
      measuredAt: true,
      createdAt: true,
      rooms: { select: ROOM_SELECT },
      estimates: { select: ESTIMATE_SELECT },
    },
  });
  if (!obj || obj.rooms.length === 0) return null;

  const rooms = packRooms(obj.rooms);
  const row = await prisma.geometryArchive.create({
    data: {
      reason,
      currency,
      measuredMonth: month(obj.measuredAt ?? obj.createdAt),
      roomCount: rooms.length,
      totalArea: Math.round(rooms.reduce((s, r) => s + (r.area || 0), 0) * 100) / 100,
      rooms: rooms as unknown as Prisma.InputJsonValue,
      estimates: obj.estimates.length ? (packEstimates(obj.estimates) as unknown as Prisma.InputJsonValue) : undefined,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Перед удалением аккаунта: все объекты мастера (включая корзину) + КП без
 * объекта (быстрые КП по фото/голосу). Возвращает число записей архива.
 */
export async function archiveMasterGeometry(masterId: string): Promise<number> {
  const master = await prisma.master.findUnique({ where: { id: masterId }, select: { currency: true } });
  const currency = master?.currency ?? null;

  const objects = await prisma.measurementObject.findMany({
    where: { masterId },
    select: { id: true },
  });
  let n = 0;
  for (const o of objects) {
    try {
      if (await archiveObjectGeometry(o.id, "account-delete", currency)) n++;
    } catch (e) {
      console.error("[geometry-archive] object failed:", o.id, e instanceof Error ? e.message : e);
    }
  }

  const loose = await prisma.estimate.findMany({
    where: { masterId, measurementObjectId: null, totalArea: { gt: 0 } },
    select: ESTIMATE_SELECT,
  });
  if (loose.length > 0) {
    await prisma.geometryArchive.create({
      data: {
        reason: "account-delete",
        currency,
        measuredMonth: null,
        roomCount: 0,
        totalArea: Math.round(loose.reduce((s, e) => s + e.totalArea, 0) * 100) / 100,
        rooms: [] as unknown as Prisma.InputJsonValue,
        estimates: packEstimates(loose) as unknown as Prisma.InputJsonValue,
      },
    });
    n++;
  }
  return n;
}
