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

function pickGeometry(room: SavedRoom3D): RoomGeometryFields | null {
  if (Array.isArray(room.walls) && room.walls.length > 0
      && Array.isArray(room.normalCorners) && room.normalCorners.length > 0) {
    return room;
  }
  const dd = room.designerData;
  if (dd && Array.isArray(dd.walls) && dd.walls.length > 0
      && Array.isArray(dd.normalCorners) && dd.normalCorners.length > 0) {
    return dd;
  }
  return null;
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

export function mapRoomToScene3DProps(room: SavedRoom3D | null | undefined): Scene3DInputs | null {
  if (!room) return null;
  const geom = pickGeometry(room);
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
