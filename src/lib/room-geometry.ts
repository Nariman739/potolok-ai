import type {
  RoomInput,
  RoomShape,
  LShapeDimensions,
  TShapeDimensions,
  CustomWall,
  CustomDimensions,
} from "./types";
import type { Vertex2D } from "./room-types";

// ============================================
// Vertices for room from walls + normalCorners (legacy zamery format)
// Used by 2D room-designer and 3D scene builder
// ============================================

const VERTEX_DX = [1, 0, -1, 0];
const VERTEX_DY = [0, 1, 0, -1];

/** Восстанавливает вершины полигона из (walls, normalCorners | angles).
 *  walls — длины стен в см, в порядке обхода.
 *  normalCorners — legacy boolean[] (true = +90°, false = -90°).
 *  angles — turn angles в градусах после каждой стены. Если задано — приоритетно. */
export function getVertices(
  walls: number[],
  normalCorners: boolean[],
  angles?: number[],
): Vertex2D[] {
  const n = walls.length;
  const wallAngles = angles ?? normalCorners.map((nc) => (nc ? 90 : -90));
  const allRectilinear = wallAngles.every((a) => a === 90 || a === -90);

  const vertices: Vertex2D[] = [{ x: 0, y: 0 }];

  if (allRectilinear) {
    let x = 0;
    let y = 0;
    let dir = 0;
    for (let i = 0; i < n; i++) {
      x += VERTEX_DX[dir] * walls[i];
      y += VERTEX_DY[dir] * walls[i];
      vertices.push({ x, y });
      dir = wallAngles[i] > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
  } else {
    let x = 0;
    let y = 0;
    let dirRad = 0;
    for (let i = 0; i < n; i++) {
      x += Math.cos(dirRad) * walls[i];
      y += Math.sin(dirRad) * walls[i];
      vertices.push({ x, y });
      dirRad += (wallAngles[i] * Math.PI) / 180;
    }
  }

  return vertices;
}

export function getRoomShape(room: RoomInput): RoomShape {
  return room.shape || "rectangle";
}

/**
 * Detect if LShapeDimensions uses old format (4 fields) or new format (5 fields, clockwise).
 * Old: a=top, b=right_height, c=full_left_height, d=bottom_width
 * New: a=top, b=right(↓), c=step(←), d=inner(↓), e=bottom(←)
 */
function isNewLShapeFormat(dims: LShapeDimensions): boolean {
  return dims.e !== undefined && dims.e > 0;
}

// ============================================
// Custom polygon helpers
// ============================================

/** Direction vectors for 90°-only legacy mode: 0=right(+x), 1=down(+y), 2=left(-x), 3=up(-y) */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Get the turn angle for a wall in degrees.
 *  If wall.angle is set, use it. Otherwise: turnRight=true → +90°, false → -90°. */
function getWallAngle(wall: CustomWall): number {
  if (wall.angle !== undefined) return wall.angle;
  return wall.turnRight ? 90 : -90;
}

/** Check if walls use only 90° angles (legacy rectilinear mode) */
function isRectilinear(walls: CustomWall[]): boolean {
  return walls.every(w => {
    const a = getWallAngle(w);
    return a === 90 || a === -90;
  });
}

/** Convert wall-by-wall description to polygon vertices.
 *  Walk starts at origin (0,0) heading RIGHT (angle = 0°).
 *  Supports arbitrary turn angles via wall.angle field. */
export function wallsToVertices(walls: CustomWall[]): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = [];

  if (isRectilinear(walls)) {
    // Fast path: legacy 4-direction mode (exact integer math, no floating point drift)
    let x = 0, y = 0, dir = 0;
    for (const wall of walls) {
      vertices.push({ x, y });
      x += DX[dir] * wall.length;
      y += DY[dir] * wall.length;
      dir = getWallAngle(wall) > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
    return vertices;
  }

  // General path: trigonometric calculation for arbitrary angles
  let x = 0, y = 0;
  let dirRad = 0; // direction in radians, 0 = right (+x)

  for (const wall of walls) {
    vertices.push({ x, y });
    x += Math.cos(dirRad) * wall.length;
    y += Math.sin(dirRad) * wall.length;
    dirRad += getWallAngle(wall) * Math.PI / 180;
  }

  return vertices;
}

/** Area via Shoelace formula */
export function shoelaceArea(vertices: { x: number; y: number }[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(sum) / 2;
}

/** Distance from last vertex back to origin (0 = closed polygon) */
export function polygonGap(walls: CustomWall[]): number {
  if (isRectilinear(walls)) {
    let x = 0, y = 0, dir = 0;
    for (const wall of walls) {
      x += DX[dir] * wall.length;
      y += DY[dir] * wall.length;
      dir = getWallAngle(wall) > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
    return Math.sqrt(x * x + y * y);
  }

  let x = 0, y = 0;
  let dirRad = 0;
  for (const wall of walls) {
    x += Math.cos(dirRad) * wall.length;
    y += Math.sin(dirRad) * wall.length;
    dirRad += getWallAngle(wall) * Math.PI / 180;
  }
  return Math.sqrt(x * x + y * y);
}

/** Validate custom polygon walls */
export function validateCustomDims(dims: CustomDimensions): string | null {
  if (dims.walls.length < 4) return "Минимум 4 стены";
  if (dims.walls.length > 20) return "Максимум 20 стен";
  for (const w of dims.walls) {
    if (w.length <= 0) return "Все стены должны быть больше 0";
  }
  const gap = polygonGap(dims.walls);
  if (gap > 0.01) return `Полигон не замкнут (разрыв ${(gap * 100).toFixed(0)} см)`;
  return null;
}

// ============================================
// Area / Perimeter / BoundingBox / Corners
// ============================================

/** Area in m² based on room shape (rounded to 2 decimal places) */
export function computeArea(room: RoomInput): number {
  const shape = getRoomShape(room);
  let area: number;

  if (shape === "custom" && room.customDims) {
    area = shoelaceArea(wallsToVertices(room.customDims.walls));
  } else if (shape === "l-shape" && room.lShapeDims) {
    if (isNewLShapeFormat(room.lShapeDims)) {
      const { a, b, d, e } = room.lShapeDims;
      area = a * b + (e!) * d;
    } else {
      const { a, b, c, d } = room.lShapeDims;
      area = a * b + d * (c - b);
    }
  } else if (shape === "t-shape" && room.tShapeDims) {
    const { a, b, c, d } = room.tShapeDims;
    area = a * b + c * d;
  } else {
    area = room.length * room.width;
  }

  return Math.round(area * 100) / 100;
}

/** Perimeter in meters based on room shape (rounded to 2 decimal places) */
export function computePerimeter(room: RoomInput): number {
  const shape = getRoomShape(room);
  let perimeter: number;

  if (shape === "custom" && room.customDims) {
    perimeter = room.customDims.walls.reduce((sum, w) => sum + w.length, 0);
  } else if (shape === "l-shape" && room.lShapeDims) {
    if (isNewLShapeFormat(room.lShapeDims)) {
      const { a, b, c, d, e } = room.lShapeDims;
      perimeter = a + 2 * b + c + 2 * d + (e!);
    } else {
      const { a, c } = room.lShapeDims;
      perimeter = 2 * (a + c);
    }
  } else if (shape === "t-shape" && room.tShapeDims) {
    const { a, b, d } = room.tShapeDims;
    perimeter = 2 * (a + b + d);
  } else {
    perimeter = 2 * (room.length + room.width);
  }

  return Math.round(perimeter * 100) / 100;
}

/** Min bounding box dimension for canvas roll selection */
export function getBoundingBoxMinDim(room: RoomInput): number {
  const shape = getRoomShape(room);

  if (shape === "custom" && room.customDims) {
    const verts = wallsToVertices(room.customDims.walls);
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return Math.min(w, h);
  }

  if (shape === "l-shape" && room.lShapeDims) {
    if (isNewLShapeFormat(room.lShapeDims)) {
      const { a, b, d } = room.lShapeDims;
      return Math.min(a, b + d);
    }
    const { a, c } = room.lShapeDims;
    return Math.min(a, c);
  }

  if (shape === "t-shape" && room.tShapeDims) {
    const { a, b, d } = room.tShapeDims;
    return Math.min(a, b + d);
  }

  return Math.min(room.length, room.width);
}

/** Default corner count per shape */
export function getDefaultCorners(shape: RoomShape, wallCount?: number): number {
  switch (shape) {
    case "l-shape":
      return 6;
    case "t-shape":
      return 8;
    case "custom":
      return wallCount || 4;
    default:
      return 4;
  }
}

/** Validate L-shape (new 5-field format): A = C + E, all positive */
export function validateLShape(dims: LShapeDimensions): string | null {
  if (dims.e !== undefined) {
    // New format (clockwise A,B,C,D,E)
    if (dims.a <= 0 || dims.b <= 0 || dims.c <= 0 || dims.d <= 0 || dims.e <= 0)
      return "Все размеры должны быть больше 0";
    const tolerance = 0.005; // 0.5cm tolerance for rounding
    if (Math.abs(dims.a - (dims.c + dims.e)) > tolerance)
      return `Верх (A) должен равняться выступу (C) + низу (E): ${dims.a}м ≠ ${dims.c}+${dims.e}=${(dims.c + dims.e).toFixed(2)}м`;
    return null;
  }
  // Old format fallback
  if (dims.a <= 0 || dims.b <= 0 || dims.c <= 0 || dims.d <= 0)
    return "Все размеры должны быть больше 0";
  if (dims.a <= dims.d)
    return "Верхняя ширина должна быть больше нижней";
  if (dims.c <= dims.b)
    return "Левая высота должна быть больше правой";
  return null;
}

/** Validate T-shape: a > c, all positive */
export function validateTShape(dims: TShapeDimensions): string | null {
  if (dims.a <= 0 || dims.b <= 0 || dims.c <= 0 || dims.d <= 0)
    return "Все размеры должны быть больше 0";
  if (dims.a <= dims.c)
    return "Ширина верха должна быть больше ширины ножки";
  return null;
}

/**
 * Контур комнаты одной SVG-строкой: с дугами на стенах и скруглениями в углах
 * (21.09.2026). До этого дуга рисовалась отдельной линией поверх прямой заливки,
 * а в дизайнере и вовсе терялась: мастер делал эркер, а свет расставлял по
 * прямоугольнику, и такой же прямой чертёж уходил в цех.
 *
 * vertices — углы комнаты БЕЗ замыкающего дубликата.
 * bulges[i] — глубина дуги стены i в см: «+» наружу, «−» внутрь комнаты.
 * cornerRadii[i] — радиус скругления в углу i.
 */
export function roomOutlinePath(
  vertices: Vertex2D[],
  opts: { bulges?: (number | undefined)[] | null; cornerRadii?: (number | undefined)[] | null } = {},
): string {
  const n = vertices.length;
  if (n < 3) return "";
  const at = (i: number) => vertices[((i % n) + n) % n];
  const bulgeOf = (i: number) => opts.bulges?.[((i % n) + n) % n] || 0;
  const radiusAt = (i: number) => {
    const r = opts.cornerRadii?.[((i % n) + n) % n] || 0;
    if (r <= 0) return 0;
    // Скругление рисуем только между двумя прямыми стенами: с дугой оно не сочетается.
    if (bulgeOf(i) !== 0 || bulgeOf(i - 1) !== 0) return 0;
    const prevLen = Math.hypot(at(i).x - at(i - 1).x, at(i).y - at(i - 1).y);
    const nextLen = Math.hypot(at(i + 1).x - at(i).x, at(i + 1).y - at(i).y);
    return Math.min(r, prevLen / 2, nextLen / 2);
  };
  const along = (from: Vertex2D, to: Vertex2D, dist: number) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / len) * dist, y: from.y + ((to.y - from.y) / len) * dist };
  };

  const startR = radiusAt(0);
  const start = startR > 0 ? along(at(0), at(1), startR) : at(0);
  let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const next = at(i + 1);
    const b = bulgeOf(i);
    if (b !== 0) {
      const chord = Math.hypot(next.x - at(i).x, next.y - at(i).y);
      const h = Math.abs(b);
      const r = (chord * chord / 4 + h * h) / (2 * h);
      d += ` A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${b > 0 ? 1 : 0} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
      continue;
    }
    const rNext = radiusAt(i + 1);
    // Не доходим до угла R по ТЕКУЩЕЙ стене, потом дуга через угол на следующую.
    const endPoint = rNext > 0 ? along(next, at(i), rNext) : next;
    d += ` L ${endPoint.x.toFixed(1)} ${endPoint.y.toFixed(1)}`;
    if (rNext > 0) {
      const after = along(next, at(i + 2), rNext);
      d += ` Q ${next.x.toFixed(1)} ${next.y.toFixed(1)} ${after.x.toFixed(1)} ${after.y.toFixed(1)}`;
    }
  }
  return `${d} Z`;
}

/**
 * Контур комнаты частыми точками: дуги стен и скругления углов разложены на
 * отрезки (21.09.2026). Нужен, чтобы проверять «точка внутри комнаты» там, где
 * стена круглая: по прямым вершинам такая проверка врёт — в эркере запрещает,
 * в вогнутой стене разрешает ставить свет за стеной.
 */
export function roomPolygonDense(
  vertices: Vertex2D[],
  opts: { bulges?: (number | undefined)[] | null; cornerRadii?: (number | undefined)[] | null } = {},
  segments = 14,
): Vertex2D[] {
  const n = vertices.length;
  if (n < 3) return vertices;
  const at = (i: number) => vertices[((i % n) + n) % n];
  const bulgeOf = (i: number) => opts.bulges?.[((i % n) + n) % n] || 0;
  // Ориентация обхода: от неё зависит, куда «наружу».
  let signed = 0;
  for (let i = 0; i < n; i++) signed += at(i).x * at(i + 1).y - at(i + 1).x * at(i).y;
  const dir = signed > 0 ? 1 : -1;

  const out: Vertex2D[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i), b = at(i + 1);
    out.push(a);
    const bulge = bulgeOf(i);
    if (!bulge) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Нормаль наружу комнаты с учётом направления обхода.
    const nx = (dy / len) * dir, ny = (-dx / len) * dir;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Контрольная точка Безье: кривая проходит через прогиб bulge в середине.
    const ctrl = { x: mid.x + nx * bulge * 2, y: mid.y + ny * bulge * 2 };
    for (let s = 1; s < segments; s++) {
      const t = s / segments, mt = 1 - t;
      out.push({
        x: mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y,
      });
    }
  }
  return out;
}
