// Поворот мебели в 3D (06.11.2026).
//
// Правило: 3D повторяет то, что мастер видит на 2D-чертеже. В конструкторе
// значок мебели рисуется как <G rotate(rotation)> — по часовой на экране
// (ось Y вниз), локальная сторона −Y значка = «зад» предмета (у кровати там
// подушки, у дивана спинка). В сцене X = X чертежа, Z = Y чертежа, а поворот
// three.js вокруг Y идёт против часовой, поэтому угол берётся с минусом.
// Раньше знак был плюс: при 0° и 180° разницы нет, а у боковых стен (90°/270°)
// шкаф вставал створками в стену, диван — спинкой в комнату.
//
// Запасное правило — только для типов, у которых на 2D-значке сторона не
// обозначена (шкаф, ТВ, кухня, стенка, радиатор, тумбочка, рабочий стол), и
// только когда предмет стоит у стены: зад — та сторона, что ближе к стене.
// Нужно для комнат с обходом против часовой и для мебели, повёрнутой вручную:
// на чертеже прямоугольник симметричен, мастер не видит, где у него «лицо».

import type { FurnitureType, Vertex2D } from "./types";

/** Типы без обозначенной стороны на 2D-значке, которые в жизни стоят задом к стене. */
const WALL_BACKED = new Set<FurnitureType>([
  "wardrobe",
  "tv",
  "kitchen",
  "wall_panel",
  "radiator",
  "nightstand",
  "desk",
  "tv_stand",
  "shelf",
]);

/** «У стены»: передняя грань не дальше этого расстояния от стены, см. */
const AT_WALL_CM = 25;

function distToWalls(px: number, py: number, vertices: Vertex2D[]): number {
  let best = Infinity;
  // Контур бывает и с замыкающей точкой, и без неё — замыкаем сами.
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Угол мебели в градусах в системе чертежа (как rotation в данных), с учётом
 * запасного правила «зад к стене». Координаты и размеры — в сантиметрах.
 */
export function furnitureRotationDeg(
  el: { furnitureType?: FurnitureType; x?: number; y?: number; height?: number; rotation?: number },
  vertices: Vertex2D[],
): number {
  const rot = el.rotation || 0;
  if (!el.furnitureType || !WALL_BACKED.has(el.furnitureType)) return rot;
  if (el.x === undefined || el.y === undefined || !el.height) return rot;
  const rad = (rot * Math.PI) / 180;
  // Локальная ось глубины (0, 1) после поворота значка: (−sin, cos).
  const fx = -Math.sin(rad);
  const fy = Math.cos(rad);
  const half = el.height / 2;
  const dFront = distToWalls(el.x + fx * half, el.y + fy * half, vertices);
  const dBack = distToWalls(el.x - fx * half, el.y - fy * half, vertices);
  if (dFront <= AT_WALL_CM && dFront < dBack - 1) return (rot + 180) % 360;
  return rot;
}

/**
 * Зазоры от граней габарита до ближайшей стены, см: зад (−Y значка), левый и
 * правый торцы. deg — итоговый угол из furnitureRotationDeg. По ним мебель
 * понимает, что стоит у стены (ТВ висит, тень ложится на стену) и с какой
 * стороны боковая стена (оттоманка углового дивана).
 */
export function furnitureWallGaps(
  el: { x?: number; y?: number; width?: number; height?: number },
  vertices: Vertex2D[],
  deg: number,
): { back: number; front: number; left: number; right: number } {
  if (el.x === undefined || el.y === undefined) return { back: Infinity, front: Infinity, left: Infinity, right: Infinity };
  const rad = (deg * Math.PI) / 180;
  const fx = -Math.sin(rad);
  const fy = Math.cos(rad);
  // локальная ось ширины (1, 0) после поворота значка: (cos, sin)
  const wx = Math.cos(rad);
  const wy = Math.sin(rad);
  const hd = (el.height ?? 0) / 2;
  const hw = (el.width ?? 0) / 2;
  return {
    back: distToWalls(el.x - fx * hd, el.y - fy * hd, vertices),
    front: distToWalls(el.x + fx * hd, el.y + fy * hd, vertices),
    left: distToWalls(el.x - wx * hw, el.y - wy * hw, vertices),
    right: distToWalls(el.x + wx * hw, el.y + wy * hw, vertices),
  };
}

/** rotation.y для three.js по углу чертежа (градусы, по часовой на экране). */
export function furnitureRotationY(deg: number): number {
  return -(deg * Math.PI) / 180;
}
