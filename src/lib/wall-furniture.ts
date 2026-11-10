/**
 * «Фасад шкафа (только для 3D)» — Нариман 10.11.2026.
 *
 * ФАЙЛ-БЛИЗНЕЦ, байт-в-байт в двух репо: potolok-ai/src/lib/wall-furniture.ts (сайт)
 * и potolok-ai-app/src/lib/shared/wall-furniture.ts (приложение). Править оба сразу.
 *
 * Мастер помечает ЦЕЛУЮ стену контура как фасад встроенного шкафа до потолка
 * (обход шкафа «бок → лицевая → бок» — три стены по отдельности). В 3D на внутренней
 * грани такой стены рисуется матовый фасад заподлицо, от пола до потолка. Двери и
 * окна не вырезаются: стену с проёмом мастер просто не помечает.
 *
 * Только вид. Расчёт КП, цех, наряд, PDF и эскиз поле не читают — это не
 * «📐 до потолка» у мебели внутри комнаты (та вычитает площадь и идёт в КП).
 * Хранится в MeasurementRoom.wallFurniture отдельно от wallProfiles (его читает расчёт).
 */

export const WALL_FURNITURE_COLORS = ["white", "wood", "gray"] as const;
export type WallFurnitureColor = (typeof WALL_FURNITURE_COLORS)[number];
export type WallFurnitureEntry = { wall: number; color: WallFurnitureColor };

/** Цвет фасада в 3D (матовый, без текстуры). */
export const WALL_FURNITURE_HEX: Record<WallFurnitureColor, string> = {
  white: "#F2F0EC",
  wood: "#D9C4A3",
  gray: "#B9BAB6",
};

/**
 * Приводит пришедшее значение к списку стен.
 *  - undefined — поля не прислали (старая сборка, веб-конструктор): не трогать;
 *  - null, [] или мусор без единой годной записи — снять все пометки (null);
 *  - иначе — по одной записи на стену, по возрастанию номера стены.
 * wallCount — число стен комнаты: записи за пределами контура отбрасываются.
 */
export function normalizeWallFurniture(v: unknown, wallCount?: number): WallFurnitureEntry[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  const byWall = new Map<number, WallFurnitureColor>();
  for (const e of v) {
    if (!e || typeof e !== "object") continue;
    const wall = (e as { wall?: unknown }).wall;
    const color = (e as { color?: unknown }).color;
    if (typeof wall !== "number" || !Number.isInteger(wall) || wall < 0) continue;
    if (wallCount !== undefined && wall >= wallCount) continue;
    if (typeof color !== "string" || !(WALL_FURNITURE_COLORS as readonly string[]).includes(color)) continue;
    byWall.set(wall, color as WallFurnitureColor);
  }
  if (byWall.size === 0) return null;
  return [...byWall.entries()].sort((a, b) => a[0] - b[0]).map(([wall, color]) => ({ wall, color }));
}

/** Цвет фасада на стене или undefined, если стена обычная. */
export function wallFurnitureColor(list: WallFurnitureEntry[] | null | undefined, wall: number): WallFurnitureColor | undefined {
  return list?.find((e) => e.wall === wall)?.color;
}
