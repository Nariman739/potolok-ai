/**
 * Двухуровневый потолок — геометрия элемента «2 уровня» (08.11.2026).
 *
 * Чистый модуль без React и Prisma: его читают расчёт КП, чертёж наряда, PDF.
 * Зеркало — potolok-integration/src/lib/shared/level2-geometry.ts (мобилка считает
 * КП и чертёж в цех у себя). Менять оба файла вместе.
 *
 * Модель (решение Наримана, подтверждено фото мастеров 08.11.2026): нарисованный
 * контур C — линия БОРТА, вертикальной ступеньки между уровнями. От стен до борта —
 * нижний уровень (короб по периметру). Внутрь от борта — полка шириной w (на ней
 * LED-лента светит на верх), дальше верхнее полотно U = C, сдвинутый внутрь на w.
 *
 *   верхнее полотно, м²      A_U   — площадь U (углы скруглены radius − w)
 *   нижнее полотно           A_room − A_C — обычная строка «Полотно» уменьшается на A_C
 *   борт (переход), м.п.     P_C по ОТКРЫТЫМ сторонам (сторона на стене — борта нет)
 *   подсветка, м.п.          = борт, если led
 *   полка (A_C − A_U)        не полотно — в КП не идёт
 *
 * Скругление выпуклого угла радиусом r при угле поворота φ: периметр −r·(2·tan(φ/2) − φ),
 * площадь −r²·(tan(φ/2) − φ/2). У прямого угла: −0,429·r и −0,2146·r².
 * Проверка цифр: scratchpad/level2-geometry-check.mts.
 */

import type { Level2Params, RoomElement } from "./room-types";

export type Pt = { x: number; y: number };

/** Дефолты элемента; нет поля на элементе — считаем так. Подсветка по умолчанию ДА
 *  (Нариман 08.11.2026: 90 % двухуровневых идут с контурной подсветкой). */
export const LEVEL2_DEFAULTS: Level2Params = { shelfCm: 10, dropCm: 10, led: true, radiusCm: 0 };
/** Допустимые радиусы скругления углов контура, см. */
export const LEVEL2_RADII = [0, 10, 20] as const;
/** Коды каталога (constants.ts) — три строки КП. */
export const LEVEL2_CODES = { canvas: "level2_canvas", step: "level2_step", led: "level2_led" } as const;
/** Строка монтажнику за борт (ставка 0, пока мастер не задал — как «Монтаж вставки»). */
export const LEVEL2_INSTALL_NAME = "Монтаж 2-го уровня";

/** Сторона контура на стене: ближе этого (см) и параллельна — борта там нет. */
const ON_WALL_TOL_CM = 1;
/** Короче этой доли полки сторона контура «схлопывается» офсетом — верх считаем без полки. */
const MIN_SIDE_TO_SHELF = 2;

export function level2Params(el: Pick<RoomElement, "level2">): Level2Params {
  const p = el.level2;
  if (!p) return { ...LEVEL2_DEFAULTS };
  return {
    shelfCm: num(p.shelfCm, LEVEL2_DEFAULTS.shelfCm),
    dropCm: num(p.dropCm, LEVEL2_DEFAULTS.dropCm),
    led: typeof p.led === "boolean" ? p.led : LEVEL2_DEFAULTS.led,
    radiusCm: num(p.radiusCm, LEVEL2_DEFAULTS.radiusCm),
    ...(p.direction ? { direction: p.direction } : {}),
  };
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
}

/**
 * Контур элемента в см: точки с поворотом (как у свободных линий дизайнера),
 * без дублирующей замыкающей точки. null — контур не годится (меньше 3 точек).
 */
export function level2Contour(el: Pick<RoomElement, "points" | "rotation" | "type">): Pt[] | null {
  const raw = Array.isArray(el.points) ? el.points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  let pts = raw.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length >= 2) {
    const a = pts[0], z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.y - z.y) < 0.5) pts = pts.slice(0, -1);
  }
  if (pts.length < 3) return null;
  const rot = el.rotation || 0;
  if (!rot) return pts;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rad = (rot * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
  return pts.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function perimeter(pts: Pt[]): number {
  let l = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
}

/** Угол поворота в вершине i со знаком: > 0 — выпуклый (для обхода с положительной площадью). */
function turnAt(pts: Pt[], i: number, orient: 1 | -1): number {
  const n = pts.length;
  const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
  const a1 = Math.atan2(c.y - p.y, c.x - p.x), a2 = Math.atan2(q.y - c.y, q.x - c.x);
  let t = a2 - a1;
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  return t * orient;
}

/**
 * Радиусы по вершинам контура для рисования (как cornerRadii комнаты в roomOutlinePath):
 * r у выпуклых углов, 0 у вогнутых и у слишком коротких сторон.
 */
export function level2CornerRadii(pts: Pt[], r: number): number[] {
  const n = pts.length;
  if (r <= 0 || n < 3) return pts.map(() => 0);
  const orient: 1 | -1 = signedArea(pts) >= 0 ? 1 : -1;
  return pts.map((_, i) => {
    const phi = turnAt(pts, i, orient);
    if (phi <= 1e-9) return 0;
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(q.x - c.x, q.y - c.y);
    const tan = Math.tan(phi / 2);
    return Math.max(0, Math.min(r, l1 / 2 / tan, l2 / 2 / tan));
  });
}

/** Поправки периметра и площади на скругление выпуклых углов радиусом r (см, см²). */
export function roundingCorrections(pts: Pt[], r: number): { dP: number; dA: number } {
  if (r <= 0 || pts.length < 3) return { dP: 0, dA: 0 };
  const orient: 1 | -1 = signedArea(pts) >= 0 ? 1 : -1;
  const radii = level2CornerRadii(pts, r);
  let dP = 0, dA = 0;
  for (let i = 0; i < pts.length; i++) {
    const rr = radii[i];
    if (rr <= 0) continue;
    const phi = turnAt(pts, i, orient);
    const tan = Math.tan(phi / 2);
    dP -= rr * (2 * tan - phi);
    dA -= rr * rr * (tan - phi / 2);
  }
  return { dP, dA };
}

/**
 * Контур, сдвинутый внутрь на d см (стыки — miter). Для полки у борта. Вогнутые углы
 * поддерживаются; при d, сравнимом со стороной, офсет вырождается — проверяйте
 * minSide заранее (см. calcLevel2).
 */
export function offsetInward(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  if (d <= 0 || n < 3) return pts.map((p) => ({ ...p }));
  const orient: 1 | -1 = signedArea(pts) >= 0 ? 1 : -1;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1x = c.x - p.x, e1y = c.y - p.y, e2x = q.x - c.x, e2y = q.y - c.y;
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    // Нормали внутрь: при положительной площади «внутрь» — слева от направления обхода.
    const n1x = (-orient * e1y) / l1, n1y = (orient * e1x) / l1;
    const n2x = (-orient * e2y) / l2, n2y = (orient * e2x) / l2;
    const bx = n1x + n2x, by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    const cosHalf = (bx * n1x + by * n1y) / bl;
    const m = d / Math.max(cosHalf, 0.2);
    out.push({ x: c.x + (bx / bl) * m, y: c.y + (by / bl) * m });
  }
  return out;
}

function distToLine(pt: Pt, a: Pt, b: Pt): number {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs((b.x - a.x) * (a.y - pt.y) - (a.x - pt.x) * (b.y - a.y)) / l;
}

/** Длины сторон контура, НЕ лежащих на стене комнаты (там нужен борт). */
export function openSideLengths(contour: Pt[], room: Pt[] | null, tol = ON_WALL_TOL_CM): number[] {
  const n = contour.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = contour[i], b = contour[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let onWall = false;
    if (room && room.length >= 3) {
      for (let j = 0; j < room.length; j++) {
        const p = room[j], q = room[(j + 1) % room.length];
        const wl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const parallel = Math.abs((b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x)) / (wl * (len || 1)) < 0.02;
        if (parallel && distToLine(a, p, q) < tol && distToLine(b, p, q) < tol) { onWall = true; break; }
      }
    }
    if (!onWall) out.push(len);
  }
  return out;
}

export type Level2Calc = {
  /** Верхнее полотно, м². */
  upperM2: number;
  /** Площадь внутри борта (со скруглением), м² — на столько уменьшается обычное полотно. */
  cutM2: number;
  /** Борт по открытым сторонам, м. */
  bortM: number;
  /** Подсветка, м (0, если led выключен). */
  ledM: number;
  /** Полка между бортом и верхним полотном, м² (не полотно). */
  shelfM2: number;
  /** Весь периметр борта со скруглением, м (и у стен тоже) — для чертежа. */
  contourM: number;
  /** Сторон контура на стене (без борта). */
  sidesOnWall: number;
  /** Верхнее полотно (контур U) в см — для цеха. null — полка не поместилась (упредупреждение). */
  upper: Pt[] | null;
  warnings: Level2Warning[];
  params: Level2Params;
};

export type Level2Warning = "shelf_too_wide" | "inside_other_contour" | "outside_room" | "canvas_negative";

/** Расчёт одного контура. room — вершины комнаты в см (null — без проверки стен). */
export function calcLevel2(contour: Pt[], room: Pt[] | null, params: Level2Params): Level2Calc {
  const warnings: Level2Warning[] = [];
  const r = Math.max(0, params.radiusCm), w = Math.max(0, params.shelfCm);
  const cR = roundingCorrections(contour, r);
  const cutCm2 = Math.abs(signedArea(contour)) + cR.dA;
  const fullP = perimeter(contour);
  const contourP = fullP + cR.dP;

  // Полка: если какая-то сторона короче 2w, офсет вырождается — верх считаем по контуру.
  let upper: Pt[] | null = null;
  let upperCm2 = cutCm2;
  const minSide = Math.min(...contour.map((p, i) => { const q = contour[(i + 1) % contour.length]; return Math.hypot(q.x - p.x, q.y - p.y); }));
  if (w > 0 && minSide >= MIN_SIDE_TO_SHELF * w) {
    upper = offsetInward(contour, w);
    const uR = roundingCorrections(upper, Math.max(0, r - w));
    upperCm2 = Math.abs(signedArea(upper)) + uR.dA;
  } else if (w > 0) {
    warnings.push("shelf_too_wide");
  } else {
    upper = contour.map((p) => ({ ...p }));
  }

  const openLens = openSideLengths(contour, room);
  const sidesOnWall = contour.length - openLens.length;
  const openShare = fullP > 0 ? openLens.reduce((s, l) => s + l, 0) / fullP : 0;
  const bortCm = openShare * contourP;

  if (room && room.length >= 3 && contour.some((p) => !pointInPolygon(p, room) && distToPolygon(p, room) > ON_WALL_TOL_CM)) warnings.push("outside_room");

  return {
    upperM2: r2(upperCm2 / 10000),
    cutM2: r2(cutCm2 / 10000),
    bortM: r2(bortCm / 100),
    ledM: params.led ? r2(bortCm / 100) : 0,
    shelfM2: r2(Math.max(0, cutCm2 - upperCm2) / 10000),
    contourM: r2(contourP / 100),
    sidesOnWall,
    upper,
    warnings,
    params,
  };
}

export type RoomLevel2 = {
  count: number;
  upperM2: number;
  cutM2: number;
  bortM: number;
  ledM: number;
  /** Макс. перепад по контурам (для сводки) и признак «есть подсветка». */
  dropCm: number;
  led: boolean;
  items: { el: RoomElement; contour: Pt[]; calc: Level2Calc }[];
  warnings: Level2Warning[];
};

/** Все контуры «2 уровня» комнаты одной сводкой; контур внутри другого — предупреждение. */
export function calcRoomLevel2(elements: RoomElement[] | null | undefined, room: Pt[] | null): RoomLevel2 | null {
  const items: RoomLevel2["items"] = [];
  for (const el of elements ?? []) {
    if (!el || el.type !== "level2") continue;
    const contour = level2Contour(el);
    if (!contour) continue;
    items.push({ el, contour, calc: calcLevel2(contour, room, level2Params(el)) });
  }
  if (items.length === 0) return null;
  const warnings = new Set<Level2Warning>();
  for (const it of items) for (const wn of it.calc.warnings) warnings.add(wn);
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i !== j && items[i].contour.every((p) => pointInPolygon(p, items[j].contour))) warnings.add("inside_other_contour");
    }
  }
  const sum = (f: (c: Level2Calc) => number) => r2(items.reduce((s, it) => s + f(it.calc), 0));
  return {
    count: items.length,
    upperM2: sum((c) => c.upperM2),
    cutM2: sum((c) => c.cutM2),
    bortM: sum((c) => c.bortM),
    ledM: sum((c) => c.ledM),
    dropCm: Math.max(...items.map((it) => it.calc.params.dropCm)),
    led: items.some((it) => it.calc.params.led),
    items,
    warnings: [...warnings],
  };
}

/**
 * Площадь обычного полотна после вычета контуров: не ниже нуля. Если контуры
 * больше комнаты (нарисованы за стеной / друг в друге) — предупреждение canvas_negative.
 */
export function canvasAfterLevel2(canvasM2: number, lvl: RoomLevel2 | null): { m2: number; warning: Level2Warning | null } {
  if (!lvl) return { m2: canvasM2, warning: null };
  const rest = canvasM2 - lvl.cutM2;
  if (rest < -0.005) return { m2: 0, warning: "canvas_negative" };
  return { m2: r2(Math.max(0, rest)), warning: null };
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
