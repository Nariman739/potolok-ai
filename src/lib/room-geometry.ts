import type {
  RoomInput,
  RoomShape,
  LShapeDimensions,
  TShapeDimensions,
  CustomWall,
  CustomDimensions,
} from "./types";

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

/** Direction vectors: 0=right(+x), 1=down(+y), 2=left(-x), 3=up(-y) */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Convert wall-by-wall description to polygon vertices.
 *  Walk starts at origin (0,0) heading RIGHT. */
export function wallsToVertices(walls: CustomWall[]): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = [];
  let x = 0, y = 0, dir = 0;

  for (const wall of walls) {
    vertices.push({ x, y });
    x += DX[dir] * wall.length;
    y += DY[dir] * wall.length;
    dir = wall.turnRight ? (dir + 1) % 4 : (dir + 3) % 4;
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
  let x = 0, y = 0, dir = 0;
  for (const wall of walls) {
    x += DX[dir] * wall.length;
    y += DY[dir] * wall.length;
    dir = wall.turnRight ? (dir + 1) % 4 : (dir + 3) % 4;
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

/** Area in m² based on room shape */
export function computeArea(room: RoomInput): number {
  const shape = getRoomShape(room);

  if (shape === "custom" && room.customDims) {
    return shoelaceArea(wallsToVertices(room.customDims.walls));
  }

  if (shape === "l-shape" && room.lShapeDims) {
    if (isNewLShapeFormat(room.lShapeDims)) {
      const { a, b, d, e } = room.lShapeDims;
      // New format: area = A*B + E*D
      return a * b + (e!) * d;
    }
    // Old format: area = a*b + d*(c-b)
    const { a, b, c, d } = room.lShapeDims;
    return a * b + d * (c - b);
  }

  if (shape === "t-shape" && room.tShapeDims) {
    const { a, b, c, d } = room.tShapeDims;
    return a * b + c * d;
  }

  return room.length * room.width;
}

/** Perimeter in meters based on room shape */
export function computePerimeter(room: RoomInput): number {
  const shape = getRoomShape(room);

  if (shape === "custom" && room.customDims) {
    return room.customDims.walls.reduce((sum, w) => sum + w.length, 0);
  }

  if (shape === "l-shape" && room.lShapeDims) {
    if (isNewLShapeFormat(room.lShapeDims)) {
      const { a, b, c, d, e } = room.lShapeDims;
      // P = A + B + C + D + E + F, where F = B + D
      return a + 2 * b + c + 2 * d + (e!);
    }
    // Old format
    const { a, c } = room.lShapeDims;
    return 2 * (a + c);
  }

  if (shape === "t-shape" && room.tShapeDims) {
    const { a, b, d } = room.tShapeDims;
    return 2 * (a + b + d);
  }

  return 2 * (room.length + room.width);
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
