// Утилита для преобразования сохранённой комнаты (формат roomsData в Estimate
// или MeasurementRoom) в props для <Scene3D> из @/components/room-3d.
//
// Структура roomsData различается:
//  • Estimate.roomsData = RoomInput[] (от calculator/quick-estimate). Геометрия
//    прячется внутри `designerData: { walls, normalCorners, angles, elements, ... }`.
//  • MeasurementRoom — поля walls/normalCorners лежат на верхнем уровне.
//
// Утилита учитывает оба источника. Для случаев без полной геометрии (КП из
// telegram-bot или ассистента без рисованной комнаты) возвращает null — публичная
// страница покажет fallback / скроет 3D-кнопку.

import { getVertices } from "./room-geometry";
import type { RoomElement } from "./room-types";

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
  [k: string]: unknown;
}

export interface Scene3DInputs {
  vertices: { x: number; y: number }[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
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

  return { vertices, walls: geom.walls, ceilingHeight: ceilingCm, elements };
}

/** Найти первую комнату в массиве для которой доступна 3D-визуализация. */
export function pickRoomForScene3D(rooms: unknown): SavedRoom3D | null {
  if (!Array.isArray(rooms)) return null;
  for (const r of rooms) {
    if (mapRoomToScene3DProps(r as SavedRoom3D)) return r as SavedRoom3D;
  }
  return null;
}
