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
  /** Форма мебели: rect (default) — задаётся width/height; custom — задаётся polygonPoints. */
  furnitureShape?: "rect" | "custom";
  /** Точки полигона мебели в local space (центрированы относительно (0,0)). */
  polygonPoints?: Vertex[];
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

/** Углы мебели в SVG-координатах после rotation вокруг центра.
 *  4 угла для rect (через width/height), произвольное N для custom (через polygonPoints). */
export function getFurnitureCorners(el: FurnitureLikeElement): Vertex[] | null {
  if (el.x === undefined || el.y === undefined) return null;
  const cx = el.x, cy = el.y;
  const rad = ((el.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  let local: Vertex[];
  if (el.polygonPoints && el.polygonPoints.length >= 3) {
    local = el.polygonPoints;
  } else if (el.width && el.height) {
    const halfW = el.width / 2, halfH = el.height / 2;
    local = [
      { x: -halfW, y: -halfH },
      { x:  halfW, y: -halfH },
      { x:  halfW, y:  halfH },
      { x: -halfW, y:  halfH },
    ];
  } else return null;
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

/** Кратчайшее расстояние от точки до полигона (любого ребра). */
function distPointToPolygon(p: Vertex, polyCorners: Vertex[]): number {
  let best = Infinity;
  const n = polyCorners.length;
  for (let i = 0; i < n; i++) {
    const a = polyCorners[i], b = polyCorners[(i + 1) % n];
    const d = distPointToSegment(p.x, p.y, a, b);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Для каждой грани мебели (в порядке обхода): true = «у стены или у соседней to-ceiling/planned мебели»
 * → профиль не идёт по этой грани. false = «в комнату» (профиль идёт по ней).
 *
 * Для модульной сборки: если поставить два блока кухни вплотную, их соприкасающиеся грани
 * считаются «at-wall» (внутренние швы) — профиль их обходит.
 *
 * @param el проверяемая мебель
 * @param vertices вершины комнаты
 * @param allFurniture опционально — все остальные furniture для проверки соседей
 */
export function classifyEdges(
  el: FurnitureLikeElement,
  vertices: Vertex[],
  allFurniture?: FurnitureLikeElement[],
): boolean[] {
  const corners = getFurnitureCorners(el);
  if (!corners) return [false, false, false, false];
  const n = corners.length;

  // Заранее посчитаем углы соседней мебели (только to-ceiling / planned)
  const neighbors: Vertex[][] = [];
  if (allFurniture) {
    for (const other of allFurniture) {
      if (other === el) continue;
      if (other.type !== "furniture") continue;
      if (other.ceilingMode !== "to-ceiling" && other.ceilingMode !== "planned") continue;
      const oc = getFurnitureCorners(other);
      if (oc) neighbors.push(oc);
    }
  }

  const result: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = corners[i], p2 = corners[(i + 1) % n];
    const n1 = nearestWallDist(p1, vertices);
    const n2 = nearestWallDist(p2, vertices);
    const atWall = n1.dist < AT_WALL_THRESHOLD_CM
                && n2.dist < AT_WALL_THRESHOLD_CM
                && n1.wallIdx === n2.wallIdx;
    let atNeighbor = false;
    if (!atWall && neighbors.length > 0) {
      // Грань at-furniture если ОБА её угла близко к ОДНОЙ соседней мебели
      for (const oc of neighbors) {
        const d1 = distPointToPolygon(p1, oc);
        const d2 = distPointToPolygon(p2, oc);
        if (d1 < AT_WALL_THRESHOLD_CM && d2 < AT_WALL_THRESHOLD_CM) {
          atNeighbor = true;
          break;
        }
      }
    }
    result.push(atWall || atNeighbor);
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
  const n = atWall.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = atWall[i], b = atWall[(i + 1) % n];
    if (!(a && b)) count++;
  }
  return count;
}

/** Длина грани (расстояние между двумя углами мебели). */
function edgeLen(corners: Vertex[], i: number): number {
  const n = corners.length;
  const p1 = corners[i], p2 = corners[(i + 1) % n];
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Площадь полигона (shoelace). Возвращает абсолютное значение. */
function polygonArea(corners: Vertex[]): number {
  const n = corners.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p1 = corners[i], p2 = corners[(i + 1) % n];
    s += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(s) / 2;
}

/** Snap furniture к ближайшей стене (поворот + сдвиг впритык) и к соседней мебели вдоль той же стены.
 *  Возвращает обновлённый элемент { x, y, rotation } или null если furniture слишком далеко от любой стены.
 */
export function snapFurnitureToWallAndNeighbors(
  el: FurnitureLikeElement,
  vertices: Vertex[],
  allFurniture: FurnitureLikeElement[],
  opts?: { wallSnapCm?: number; neighborSnapCm?: number },
): { x: number; y: number; rotation: number } | null {
  const wallSnapCm = opts?.wallSnapCm ?? 30;
  const neighborSnapCm = opts?.neighborSnapCm ?? 10;
  if (el.x === undefined || el.y === undefined || !el.width || !el.height) return null;

  // Найти ближайшую стену по проекции центра furniture
  let bestWall = -1, bestDist = Infinity, bestT = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((el.x - a.x) * dx + (el.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx, projY = a.y + t * dy;
    const d = Math.hypot(el.x - projX, el.y - projY);
    if (d < bestDist) { bestDist = d; bestWall = i; bestT = t; }
  }
  if (bestWall < 0) return null;
  const a = vertices[bestWall], b = vertices[bestWall + 1];
  const wDx = b.x - a.x, wDy = b.y - a.y;
  const wLen = Math.hypot(wDx, wDy);
  const wallNx = wDx / wLen, wallNy = wDy / wLen;

  // Длинная сторона furniture — параллельна стене. Угол стены:
  const wallAngleDeg = (Math.atan2(wDy, wDx) * 180) / Math.PI;
  const widthIsLong = el.width >= el.height;
  const longSide = widthIsLong ? el.width : el.height;
  const halfPerp = widthIsLong ? el.height / 2 : el.width / 2;
  // Если furniture слишком далеко от стены (далее чем halfPerp + wallSnapCm) — не snap'им
  if (bestDist > halfPerp + wallSnapCm) return null;

  const newRotation = ((widthIsLong ? wallAngleDeg : (wallAngleDeg - 90)) % 360 + 360) % 360;

  // Перпендикуляр стены — внутрь комнаты (к centroid'у)
  const perp1x = -wallNy, perp1y = wallNx;
  let cX = 0, cY = 0;
  for (let i = 0; i < vertices.length - 1; i++) { cX += vertices[i].x; cY += vertices[i].y; }
  cX /= (vertices.length - 1); cY /= (vertices.length - 1);
  const wallMidX = (a.x + b.x) / 2, wallMidY = (a.y + b.y) / 2;
  const inwardSign = ((cX - wallMidX) * perp1x + (cY - wallMidY) * perp1y) > 0 ? 1 : -1;
  const inX = perp1x * inwardSign, inY = perp1y * inwardSign;

  // Точка на стене — проекция центра furniture
  const projX = a.x + wDx * bestT;
  const projY = a.y + wDy * bestT;
  let newX = projX + inX * halfPerp;
  let newY = projY + inY * halfPerp;

  // Snap к соседней мебели (только to-ceiling/planned, на той же стене)
  // Берём проекцию центров соседей на ось стены, сравниваем с проекцией текущего
  const myT = (newX - a.x) * wallNx + (newY - a.y) * wallNy;
  const myMin = myT - longSide / 2;
  const myMax = myT + longSide / 2;
  let bestSnapDelta = 0, bestSnapAbs = neighborSnapCm + 1;
  for (const other of allFurniture) {
    if (other === el) continue;
    if (other.type !== "furniture") continue;
    if (other.ceilingMode !== "to-ceiling" && other.ceilingMode !== "planned") continue;
    if (other.x === undefined || other.y === undefined || !other.width || !other.height) continue;
    // Сосед должен быть рядом со стеной (его расстояние до стены < halfPerp + threshold)
    const otherProjX = a.x + ((other.x - a.x) * wDx + (other.y - a.y) * wDy) / (wLen * wLen) * wDx;
    const otherProjY = a.y + ((other.x - a.x) * wDx + (other.y - a.y) * wDy) / (wLen * wLen) * wDy;
    const otherDistToWall = Math.hypot(other.x - otherProjX, other.y - otherProjY);
    const otherWidthIsLong = other.width >= other.height;
    const otherLong = otherWidthIsLong ? other.width : other.height;
    const otherHalfPerp = otherWidthIsLong ? other.height / 2 : other.width / 2;
    if (otherDistToWall > otherHalfPerp + AT_WALL_THRESHOLD_CM * 2) continue;
    // Проекция соседа на ось стены
    const otherT = (other.x - a.x) * wallNx + (other.y - a.y) * wallNy;
    const otherMin = otherT - otherLong / 2;
    const otherMax = otherT + otherLong / 2;
    // Кандидаты: моя левая грань = его правая грань → delta = otherMax - myMin
    const candA = otherMax - myMin;
    const candB = otherMin - myMax;
    for (const delta of [candA, candB]) {
      if (Math.abs(delta) < bestSnapAbs) {
        bestSnapAbs = Math.abs(delta);
        bestSnapDelta = delta;
      }
    }
  }
  if (bestSnapAbs <= neighborSnapCm) {
    newX += wallNx * bestSnapDelta;
    newY += wallNy * bestSnapDelta;
  }

  return { x: newX, y: newY, rotation: newRotation };
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
    if (!corners) continue;
    const area = polygonArea(corners);
    const atWall = classifyEdges(el, vertices, elements);
    const corns = countCorners(atWall);
    if (mode === "to-ceiling") {
      stats.areaToSubtractCm2 += area;
      stats.extraCorners += corns;
      // perimeter delta: добавляем in-room грани, вычитаем at-wall грани
      for (let i = 0; i < corners.length; i++) {
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
