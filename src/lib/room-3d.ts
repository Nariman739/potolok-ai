// Утилита для преобразования сохранённой комнаты (формат roomsData в Estimate
// или MeasurementRoom) в props для <Scene3D> из @/components/room-3d.
//
// Структура roomsData различается:
//  • Estimate.roomsData = RoomInput[] (от calculator/quick-estimate). Геометрия
//    прячется внутри `designerData: { walls, normalCorners, angles, elements, ... }`,
//    профили по стенам — в `wallProfileData.wallProfiles`, вставка — `withInsert`/`insertColor`.
//  • MeasurementRoom — поля walls/normalCorners/wallProfiles/wallFurniture лежат на верхнем уровне.
//
// Утилита учитывает оба источника. Для случаев без полной геометрии (КП из
// telegram-bot или ассистента без рисованной комнаты) возвращает null — публичная
// страница покажет fallback / скроет 3D-кнопку.
//
// 11.11.2026 (паритет с 3D приложения, пакет А): вместе с геометрией в сцену идут
// профили стен, вставка и «фасад шкафа» — те же поля, что приложение кладёт в
// RoomSnapshot (open-room-3d.ts). Только чтение, формат данных не меняется.

import { getVertices } from "./room-geometry";
import type { RoomElement } from "./room-types";
import { normalizeWallFurniture, type WallFurnitureEntry } from "./wall-furniture";

interface RoomGeometryFields {
  walls?: number[];
  normalCorners?: boolean[];
  angles?: number[];
  elements?: RoomElement[];
  ceilingHeight?: number;
}

/** Минимальная форма комнаты, достаточная для Scene3D. */
export interface SavedRoom3D extends RoomGeometryFields {
  /** RoomInput.designerData — где calculator/quick-estimate прячут геометрию. */
  designerData?: RoomGeometryFields;
  /** MeasurementRoom.wallProfiles: Record<wallIndex, WallProfileType | variantId>. */
  wallProfiles?: Record<string, string> | null;
  /** RoomInput.wallProfileData — профили по стенам в КП. */
  wallProfileData?: { wallProfiles?: Record<string, string> } | null;
  withInsert?: boolean | null;
  insertColor?: string | null;
  /** «Фасад шкафа (только для 3D)» — как лежит в MeasurementRoom.wallFurniture. */
  wallFurniture?: unknown;
  [k: string]: unknown;
}

export interface Scene3DInputs {
  vertices: { x: number; y: number }[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  /** Профили по стенам (индекс = стена vertices[i]→[i+1]); пусто — обычный багет везде. */
  wallProfiles?: Record<number, string>;
  /** Вставка в комнате: false — без вставки; пусто — со вставкой (как в КП). */
  withInsert?: boolean;
  /** Цвет вставки: чёрная или белая (пусто — белая). */
  insertColor?: "black" | "white";
  /** Стены-фасады встроенного шкафа и их цвет. */
  wallFurniture?: WallFurnitureEntry[];
}

const DEFAULT_CEILING_HEIGHT_CM = 270;

/**
 * 3D по КП из приложения доступен для КП, созданных не раньше этого момента (решение Наримана
 * 13.11.2026: «только в новых КП»). У старых КП из приложения 3D по ссылке не было — у них
 * ничего не меняется. ПОРОГ СТАВИТСЯ ПРИ ВЫКАТЕ — одна строка.
 */
export const KP_3D_FROM_ANGLES_SINCE = new Date("2026-11-14T00:00:00+05:00");

/** Контур «стены + углы» должен замкнуться: расхождение не больше 5 см или 2 % периметра. */
const CLOSE_TOLERANCE_CM = 5;
const CLOSE_TOLERANCE_SHARE = 0.02;

function pickGeometry(room: SavedRoom3D, fromAngles = false): RoomGeometryFields | null {
  if (Array.isArray(room.walls) && room.walls.length > 0
      && Array.isArray(room.normalCorners) && room.normalCorners.length > 0) {
    return room;
  }
  const dd = room.designerData;
  if (dd && Array.isArray(dd.walls) && dd.walls.length > 0
      && Array.isArray(dd.normalCorners) && dd.normalCorners.length > 0) {
    return dd;
  }
  // Комната из приложения: в КП лежат стены и углы поворота, normalCorners там нет. Вершины
  // getVertices строит по углам; normalCorners — как их шлёт само приложение (угол > 0).
  if (fromAngles && Array.isArray(room.walls) && room.walls.length >= 3
      && Array.isArray(room.angles) && room.angles.length === room.walls.length
      && room.walls.every((w) => typeof w === "number" && Number.isFinite(w) && w > 0)
      && room.angles.every((a) => typeof a === "number" && Number.isFinite(a))) {
    return { ...room, normalCorners: room.angles.map((a) => a > 0) };
  }
  return null;
}

/**
 * Контур замыкается? У комнат с косыми стенами приложение достраивает форму по диагоналям, а
 * сайт этого не умеет: по одним стенам и углам такая комната вышла бы перекошенной — клиенту
 * её не показываем.
 */
export function contourCloses(walls: number[], angles: number[]): boolean {
  const v = getVertices(walls, angles.map((a) => a > 0), angles);
  const last = v[v.length - 1];
  if (!last || !Number.isFinite(last.x) || !Number.isFinite(last.y)) return false;
  const perimeter = walls.reduce((s, w) => s + w, 0);
  return Math.hypot(last.x - v[0].x, last.y - v[0].y) <= Math.max(CLOSE_TOLERANCE_CM, perimeter * CLOSE_TOLERANCE_SHARE);
}

/** Record<string, string> из JSON → Record<number, string> только с целыми индексами стен. */
function pickWallProfiles(raw: unknown, wallCount: number): Record<number, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<number, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= wallCount || typeof v !== "string" || !v) continue;
    out[i] = v;
    n++;
  }
  return n > 0 ? out : undefined;
}

export function mapRoomToScene3DProps(
  room: SavedRoom3D | null | undefined,
  /** fromAngles — принять комнату приложения (стены + углы, без normalCorners). Только для КП. */
  opts?: { fromAngles?: boolean },
): Scene3DInputs | null {
  if (!room) return null;
  const geom = pickGeometry(room, opts?.fromAngles === true);
  if (!geom?.walls?.length || !geom.normalCorners?.length) return null;

  const angles = Array.isArray(geom.angles) ? geom.angles : undefined;
  const vertices = getVertices(geom.walls, geom.normalCorners, angles);
  const elements = Array.isArray(geom.elements) ? (geom.elements as RoomElement[]) : [];
  // ceilingHeight в RoomInput — в МЕТРАХ, в MeasurementRoom — в СМ. Унифицируем в см.
  let ceilingCm = DEFAULT_CEILING_HEIGHT_CM;
  const rawTopCh = (room as { ceilingHeight?: unknown }).ceilingHeight;
  const rawGeomCh = geom.ceilingHeight;
  if (typeof rawTopCh === "number" && rawTopCh > 0) {
    ceilingCm = rawTopCh < 10 ? Math.round(rawTopCh * 100) : rawTopCh;
  } else if (typeof rawGeomCh === "number" && rawGeomCh > 0) {
    ceilingCm = rawGeomCh < 10 ? Math.round(rawGeomCh * 100) : rawGeomCh;
  }

  const wallCount = geom.walls.length;
  const wallProfiles = pickWallProfiles(room.wallProfiles ?? room.wallProfileData?.wallProfiles, wallCount);
  const withInsert = typeof room.withInsert === "boolean" ? room.withInsert : undefined;
  const insertColor = room.insertColor === "black" ? "black" : room.insertColor === "white" ? "white" : undefined;
  const wallFurniture = normalizeWallFurniture(room.wallFurniture, wallCount) ?? undefined;

  return {
    vertices,
    walls: geom.walls,
    ceilingHeight: ceilingCm,
    elements,
    ...(wallProfiles && { wallProfiles }),
    ...(withInsert !== undefined && { withInsert }),
    ...(insertColor && { insertColor }),
    ...(wallFurniture && { wallFurniture }),
  };
}

/** Найти первую комнату в массиве для которой доступна 3D-визуализация. */
export function pickRoomForScene3D(rooms: unknown): SavedRoom3D | null {
  if (!Array.isArray(rooms)) return null;
  for (const r of rooms) {
    if (mapRoomToScene3DProps(r as SavedRoom3D)) return r as SavedRoom3D;
  }
  return null;
}

/** У комнаты есть стена-дуга: приложение хранит выгиб в `bulges`, замер на сайте — в `arcBulges`. */
function hasArcWalls(room: SavedRoom3D): boolean {
  for (const key of ["bulges", "arcBulges"] as const) {
    const list = room[key];
    if (Array.isArray(list) && list.some((b) => typeof b === "number" && b !== 0)) return true;
  }
  return false;
}

/**
 * Комната КП для публичного 3D (/kp/<id>/3d и кнопка «3D» на странице КП).
 *  - как раньше: первая комната с normalCorners (КП с сайта) — у любого КП;
 *  - новое: КП, созданное не раньше KP_3D_FROM_ANGLES_SINCE, — первая комната приложения
 *    (стены + углы) с замкнутым контуром и без стен-дуг. Многокомнатные — первая годная комната.
 * fromAngles нужно передать дальше в mapRoomToScene3DProps.
 */
export function pickKpRoomForScene3D(
  rooms: unknown,
  createdAt: Date | string | null | undefined,
  since: Date = KP_3D_FROM_ANGLES_SINCE,
): { room: SavedRoom3D; fromAngles: boolean } | null {
  const legacy = pickRoomForScene3D(rooms);
  if (legacy) return { room: legacy, fromAngles: false };
  if (!Array.isArray(rooms) || !createdAt) return null;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!(created.getTime() >= since.getTime())) return null;
  for (const r of rooms as SavedRoom3D[]) {
    if (!mapRoomToScene3DProps(r, { fromAngles: true })) continue;
    if (!contourCloses(r.walls as number[], r.angles as number[])) continue;
    // Дуга (ненулевой bulge) по хорде «замыкается», но сцена дуг не рисует — клиент увидел бы
    // прямую стену вместо дуги. Такую комнату в 3D не предлагаем.
    if (hasArcWalls(r)) continue;
    return { room: r, fromAngles: true };
  }
  return null;
}

/**
 * Комната объекта для комнаты КП: по id (комната приложения помнит serverId), затем по
 * единственному совпадению имени, затем по номеру — только если списки одной длины (иначе по
 * номеру взялись бы данные чужой комнаты). Не нашли — undefined.
 */
export function matchObjectRoom<M extends { id?: string | null; name?: string | null }>(
  room: { serverId?: unknown; name?: unknown },
  index: number,
  roomsCount: number,
  objectRooms: M[],
): M | undefined {
  if (typeof room.serverId === "string" && room.serverId) {
    const byId = objectRooms.find((r) => r.id === room.serverId);
    if (byId) return byId;
  }
  const name = typeof room.name === "string" ? room.name.trim() : "";
  const byName = name ? objectRooms.filter((r) => (r.name ?? "").trim() === name) : [];
  if (byName.length === 1) return byName[0];
  return objectRooms.length === roomsCount && index >= 0 ? objectRooms[index] : undefined;
}

/**
 * Комната КП с данными для сцены. Источники по порядку: снимок КП → wallProfileData (КП с
 * сайта) → комната объекта. Комната приложения несёт свои профили прямо в КП — это вариант,
 * который видел клиент; раньше они затирались профилями объекта. «Фасад шкафа» в КП обычно
 * нет — берётся из комнаты объекта.
 */
export function kpRoomWithObjectData(
  room: SavedRoom3D,
  objectRoom?: { wallProfiles?: unknown; withInsert?: boolean | null; insertColor?: string | null; wallFurniture?: unknown } | null,
): SavedRoom3D {
  const own = room.wallProfiles && typeof room.wallProfiles === "object" && Object.keys(room.wallProfiles).length > 0
    ? room.wallProfiles
    : undefined;
  const ownFurniture = Array.isArray(room.wallFurniture) && room.wallFurniture.length > 0 ? room.wallFurniture : undefined;
  return {
    ...room,
    wallProfiles: own ?? room.wallProfileData?.wallProfiles ?? (objectRoom?.wallProfiles as Record<string, string> | null | undefined) ?? undefined,
    withInsert: typeof room.withInsert === "boolean" ? room.withInsert : objectRoom?.withInsert,
    insertColor: room.insertColor ?? objectRoom?.insertColor,
    wallFurniture: ownFurniture ?? objectRoom?.wallFurniture ?? undefined,
  };
}
