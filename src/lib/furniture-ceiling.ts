/**
 * Helper для мебели «до потолка» — расчёт обхода профилем натяжного потолка.
 *
 * Когда мебель размечена как `ceilingMode: "to-ceiling"` или `"planned"`,
 * профиль идёт ПО граням мебели обращённым в комнату, а грани прижатые к стене
 * (зазор < 5 см) пропускаются — там и так стена.
 *
 * Используется:
 *  - room-designer.tsx → calcLiveCost (живая цена)
 *  - page.tsx → формирование RoomInput (передача на калькулятор)
 *  - calculate.ts (через RoomInput.furnitureCeilingArea/PerimeterDelta/Corners)
 */

export interface Vertex {
  x: number;
  y: number;
}

export interface FurnitureLikeElement {
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  ceilingMode?: "decor" | "to-ceiling" | "planned";
}

export type CeilingMode = "decor" | "to-ceiling" | "planned";

export interface FurnitureCeilingStats {
  /** Площадь to-ceiling мебели (см²) — вычитается из площади потолка. */
  areaToSubtractCm2: number;
  /** Изменение периметра профиля (см). Может быть отрицательным.
   *  perimeterDelta = (длина граней «в комнату») − (длина граней «у стены»). */
  perimeterDeltaCm: number;
  /** Количество доп. углов профиля для обхода to-ceiling мебели. */
  extraCorners: number;
  /** Площадь planned мебели (см²) — для информации в КП (зарезервировано). */
  plannedAreaCm2: number;
  /** Углы под будущую мебель — отдельная позиция в КП. */
  plannedCorners: number;
}

/** Порог в см: грань мебели у стены если ОБЕ её точки на расстоянии < этого. */
const AT_WALL_THRESHOLD_CM = 5;

/** 4 угла мебели в SVG-координатах после rotation вокруг центра. */
export function getFurnitureCorners(el: FurnitureLikeElement): Vertex[] | null {
  if (el.x === undefined || el.y === undefined || !el.width || !el.height) return null;
  const cx = el.x, cy = el.y;
  const halfW = el.width / 2, halfH = el.height / 2;
  const rad = ((el.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const local: Vertex[] = [
    { x: -halfW, y: -halfH },
    { x:  halfW, y: -halfH },
    { x:  halfW, y:  halfH },
    { x: -halfW, y:  halfH },
  ];
  return local.map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

/** Кратчайшее расстояние от точки до отрезка (стены). */
function distPointToSegment(px: number, py: number, a: Vertex, b: Vertex): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Минимум расстояния от точки до ЛЮБОЙ стены комнаты + индекс ближайшей. */
function nearestWallDist(p: Vertex, vertices: Vertex[]): { dist: number; wallIdx: number } {
  let best = { dist: Infinity, wallIdx: -1 };
  for (let i = 0; i < vertices.length - 1; i++) {
    const d = distPointToSegment(p.x, p.y, vertices[i], vertices[i + 1]);
    if (d < best.dist) best = { dist: d, wallIdx: i };
  }
  return best;
}

/**
 * Для каждой из 4 граней мебели (в порядке обхода): true = «у стены»
 * (обе точки грани близко к одной стене), false = «в комнату» (профиль идёт по ней).
 */
export function classifyEdges(el: FurnitureLikeElement, vertices: Vertex[]): boolean[] {
  const corners = getFurnitureCorners(el);
  if (!corners) return [false, false, false, false];
  const result: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i], p2 = corners[(i + 1) % 4];
    const n1 = nearestWallDist(p1, vertices);
    const n2 = nearestWallDist(p2, vertices);
    // Защита: считаем «у стены» только если обе точки близко к ОДНОЙ стене
    const atWall = n1.dist < AT_WALL_THRESHOLD_CM
                && n2.dist < AT_WALL_THRESHOLD_CM
                && n1.wallIdx === n2.wallIdx;
    result.push(atWall);
  }
  return result;
}

/**
 * Считает доп. углы профиля для обхода одной мебели.
 * Логика по парам соседних граней:
 *  - in-room + in-room → +1 (профиль поворачивает в комнате)
 *  - in-room + at-wall → +1 (профиль с мебели возвращается на стену)
 *  - at-wall + at-wall → 0 (мебель в углу комнаты, профиль идёт по углу комнаты)
 */
function countCorners(atWall: boolean[]): number {
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const a = atWall[i], b = atWall[(i + 1) % 4];
    if (!(a && b)) count++;
  }
  return count;
}

/** Длина грани (расстояние между двумя углами мебели). */
function edgeLen(corners: Vertex[], i: number): number {
  const p1 = corners[i], p2 = corners[(i + 1) % 4];
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Главный helper: проходит по всем мебелям и возвращает суммарную статистику
 * для расчёта периметра/площади/углов профиля.
 */
export function furnitureCeilingStats(
  elements: FurnitureLikeElement[],
  vertices: Vertex[],
): FurnitureCeilingStats {
  const stats: FurnitureCeilingStats = {
    areaToSubtractCm2: 0,
    perimeterDeltaCm: 0,
    extraCorners: 0,
    plannedAreaCm2: 0,
    plannedCorners: 0,
  };

  for (const el of elements) {
    if (el.type !== "furniture") continue;
    const mode = el.ceilingMode;
    if (mode !== "to-ceiling" && mode !== "planned") continue;
    const corners = getFurnitureCorners(el);
    if (!corners || !el.width || !el.height) continue;
    const area = el.width * el.height;
    const atWall = classifyEdges(el, vertices);
    const corns = countCorners(atWall);
    if (mode === "to-ceiling") {
      stats.areaToSubtractCm2 += area;
      stats.extraCorners += corns;
      // perimeter delta: добавляем in-room грани, вычитаем at-wall грани
      for (let i = 0; i < 4; i++) {
        const len = edgeLen(corners, i);
        if (atWall[i]) stats.perimeterDeltaCm -= len;
        else stats.perimeterDeltaCm += len;
      }
    } else {
      // planned
      stats.plannedAreaCm2 += area;
      stats.plannedCorners += corns;
    }
  }

  return stats;
}
