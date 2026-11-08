/**
 * Двухуровневый потолок — геометрия элемента «2 уровня» (08.11.2026).
 *
 * Чистый модуль без React и Prisma: его читают расчёт КП, чертёж наряда, PDF.
 * Зеркало — potolok-integration/src/lib/shared/level2-geometry.ts (мобилка считает
 * КП и чертёж в цех у себя). Менять оба файла вместе.
 *
 * Модель (решения Наримана 08.11.2026 по фото мастеров, ~/Desktop/двухуровневый-типы):
 * нарисованная линия — БОРТ, вертикальная ступенька между уровнями. В сторону верхнего
 * уровня от борта идёт полка шириной w (на ней LED-лента светит на верхнее полотно),
 * дальше верхнее полотно. С другой стороны борта — нижний уровень.
 *
 *   closed = true  — «остров»/короб по периметру: замкнутый контур, верх внутри (тип 1);
 *   closed = false — открытая линия от стены до стены: концы на стенах, нижний уровень
 *                    со стороны lowSide (полоса вдоль стены — тип 3, полукруг — тип 5).
 *                    lowSide — по ходу самой линии (y вниз): «left» — область, которую
 *                    линия с участком стен обходит против часовой на экране. У полукруга
 *                    под дугой это «left», хотя от хорды область справа: сторона считается
 *                    вдоль борта, дизайнер покажет штриховкой, мастер — переключит.
 *   bulges[i]      — стрелка дуги сегмента i (см), как arcBulges у стен: у острова «+» —
 *                    наружу (к нижнему уровню), «−» — внутрь; у открытой линии «+» — справа
 *                    по ходу хорды (y вниз), «−» — слева. Полукруг у стены = один сегмент
 *                    со стрелкой R, волна = несколько сегментов с чередующимся знаком.
 *
 *   верхнее полотно, м²      A_U   — область верха минус полка
 *   нижнее полотно           A_room − A_low: обычная строка «Полотно» уменьшается на A_low
 *   борт (переход), м.п.     длина борта без сторон, лежащих на стене (концы открытой
 *                            линии на стенах сами по себе не считаются)
 *   подсветка, м.п.          = борт, если led
 *   полка                    не полотно — в КП не идёт
 *
 * Дуги считаются плотной ломаной (шаг ≤ 5 см, не меньше 24 точек на дугу); площадь и
 * длина — по ней. Углы борта (только настоящие вершины, не точки дуг) скругляются
 * радиусом r: длина −r·(2·tan(φ/2) − φ), площадь переходит с выпуклой стороны угла на
 * вогнутую на r²·(tan(φ/2) − φ/2) (90°: −0,429·r и 0,2146·r²). Углы, примыкающие к
 * стене, не скругляются — борт подходит к стене перпендикулярно. Полка — сдвиг
 * сторон борта (miter), стороны на стене не сдвигаются: там нет ступеньки, верхнее
 * полотно идёт до стены. Вывернутый сдвиг (узкий контур, острый угол, вогнутая дуга
 * круче полки) ловится проверкой направления рёбер → shelf_too_wide, верх = без полки.
 * Проверка цифр: scratchpad/level2-geometry-check.mts + level2-review-counterexamples.mts.
 */

import type { Level2Params, RoomElement } from "./room-types";

export type Pt = { x: number; y: number };

/** Дефолты элемента; нет поля на элементе — считаем так. Подсветка по умолчанию ДА
 *  (Нариман 08.11.2026: 90 % двухуровневых идут с контурной подсветкой). */
export const LEVEL2_DEFAULTS: Level2Params = { shelfCm: 10, dropCm: 10, led: true, radiusCm: 0, closed: true, lowSide: "left" };
/** Чипы радиуса скругления в дизайнере, см; «свой» — любое ≥ 0 (Нариман 08.11.2026: углы бывают заметно круглые). */
export const LEVEL2_RADII = [0, 10, 20, 30, 50] as const;
/** Коды каталога (constants.ts) — три строки КП. */
export const LEVEL2_CODES = { canvas: "level2_canvas", step: "level2_step", led: "level2_led" } as const;
/** Строка монтажнику за борт (ставка 0, пока мастер не задал — как «Монтаж вставки»). */
export const LEVEL2_INSTALL_NAME = "Монтаж 2-го уровня";

/** Сторона борта на стене: параллельна, оба конца ближе этого (см) и проекции перекрываются.
 *  3 см — рисуют пальцем (ревью 08.11.2026); в дизайнере ещё и снап к стене ≤ 5 см. */
export const ON_WALL_TOL_CM = 3;
/** Конец открытой линии дальше этого от стены (см) — предупреждение, конец притягиваем. */
const END_TOL_CM = 15;
/** Дуги: шаг ломаной, см, и минимум точек на дугу. */
const ARC_STEP_CM = 5;
const ARC_MIN_POINTS = 24;
const ARC_MAX_POINTS = 96;
/** Соседние точки ближе этого — дубль (двойной тап). */
const DUP_TOL_CM = 0.5;

export function level2Params(el: Pick<RoomElement, "level2">): Level2Params {
  const p = el.level2;
  if (!p) return { ...LEVEL2_DEFAULTS };
  const bulges = Array.isArray(p.bulges) ? p.bulges.map((b) => (typeof b === "number" && Number.isFinite(b) ? b : 0)) : undefined;
  return {
    shelfCm: num(p.shelfCm, LEVEL2_DEFAULTS.shelfCm),
    dropCm: num(p.dropCm, LEVEL2_DEFAULTS.dropCm),
    led: typeof p.led === "boolean" ? p.led : LEVEL2_DEFAULTS.led,
    radiusCm: num(p.radiusCm, LEVEL2_DEFAULTS.radiusCm),
    closed: typeof p.closed === "boolean" ? p.closed : true,
    lowSide: p.lowSide === "right" ? "right" : "left",
    ...(bulges && bulges.some((b) => b !== 0) ? { bulges } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
  };
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
}

export type Level2Shape = {
  /** Вершины борта в см (с поворотом элемента), без дублей и без замыкающей точки-дубля. */
  points: Pt[];
  /** Стрелка дуги по сегментам (сегмент i = points[i]→points[i+1]); у замкнутого n штук, у открытого n−1. */
  bulges: number[];
  closed: boolean;
};

/**
 * Борт элемента: точки с поворотом (как у свободных линий дизайнера), дубли соседних
 * точек и коллинеарные вершины (между прямыми сегментами) убраны, у замкнутого снята
 * замыкающая точка-дубль. null — не годится (меньше 3 точек у контура, 2 у линии).
 */
export function level2Shape(el: Pick<RoomElement, "points" | "rotation" | "level2">): Level2Shape | null {
  const params = level2Params(el);
  const closed = params.closed !== false;
  const raw = Array.isArray(el.points) ? el.points : [];
  const rawBulges = params.bulges ?? [];
  let pts: Pt[] = [];
  let bulges: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < DUP_TOL_CM) {
      // Дубль: сегмент нулевой длины выпадает, его стрелка (если была) — тоже.
      if (bulges.length > 0 && bulges.length === pts.length) bulges[bulges.length - 1] = bulges[bulges.length - 1] || (rawBulges[i - 1] ?? 0);
      continue;
    }
    if (prev) bulges.push(rawBulges[i - 1] ?? 0);
    pts.push({ x: p.x, y: p.y });
  }
  if (closed && pts.length >= 2) {
    const a = pts[0], z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.y - z.y) < DUP_TOL_CM) { pts = pts.slice(0, -1); bulges = bulges.slice(0, -1); }
    else bulges.push(rawBulges[raw.length - 1] ?? 0); // замыкающий сегмент
    bulges = bulges.slice(0, pts.length);
    while (bulges.length < pts.length) bulges.push(0);
  } else {
    bulges = bulges.slice(0, Math.max(0, pts.length - 1));
    while (bulges.length < pts.length - 1) bulges.push(0);
  }
  // Коллинеарная вершина между двумя ПРЯМЫМИ сегментами — не угол, убираем.
  for (let guard = 0; guard < 2; guard++) {
    const n = pts.length;
    const keep: boolean[] = pts.map(() => true);
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const bPrev = bulges[(i - 1 + n) % n] || 0, bNext = bulges[i] || 0;
      if (bPrev !== 0 || bNext !== 0) continue;
      const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
      const cross = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x);
      const dot = (c.x - p.x) * (q.x - c.x) + (c.y - p.y) * (q.y - c.y);
      if (Math.abs(cross) < 1e-6 * Math.max(1, Math.hypot(c.x - p.x, c.y - p.y) * Math.hypot(q.x - c.x, q.y - c.y)) && dot > 0) keep[i] = false;
    }
    if (keep.every(Boolean)) break;
    const nextPts: Pt[] = [], nextBulges: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!keep[i]) continue;
      nextPts.push(pts[i]);
      if (closed || i < n - 1) nextBulges.push(bulges[i] || 0);
    }
    pts = nextPts; bulges = nextBulges;
  }
  if (pts.length < (closed ? 3 : 2)) return null;
  const rot = el.rotation || 0;
  if (rot) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const rad = (rot * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    pts = pts.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
  }
  return { points: pts, bulges, closed };
}

/** Вершины борта без дуг (совместимость): null — не годится. */
export function level2Contour(el: Pick<RoomElement, "points" | "rotation" | "level2">): Pt[] | null {
  return level2Shape(el)?.points ?? null;
}

// ============================================
// Базовые операции
// ============================================

export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Длина замкнутого контура или открытой ломаной. */
export function pathLength(pts: Pt[], closed: boolean): number {
  let l = 0;
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
}

/** Периметр замкнутого контура (совместимость со старыми скриптами). */
export function perimeter(pts: Pt[]): number {
  return pathLength(pts, true);
}

/** Угол поворота в вершине i со знаком (> 0 — выпуклый при обходе с положительной площадью). */
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
 * Точки дуги сегмента a→b со стрелкой h, в сторону нормали `side` (+1 — слева по
 * ходу при y вниз, −1 — справа), без концов. Та же геометрия, что у дуг стен
 * (arcGeometry/arcPointAt в room-geometry), включая дугу больше полукруга.
 */
function arcPoints(a: Pt, b: Pt, h: number, side: 1 | -1): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const H = Math.abs(h);
  if (chord < 1e-9 || H < 1e-9) return [];
  const r = (chord * chord / 4 + H * H) / (2 * H);
  const half = Math.asin(Math.min(chord / (2 * r), 1));
  const large = H > chord / 2 + 1e-9;
  const theta = large ? 2 * Math.PI - 2 * half : 2 * half;
  const arcLen = r * theta;
  const k = Math.max(ARC_MIN_POINTS, Math.min(ARC_MAX_POINTS, Math.ceil(arcLen / ARC_STEP_CM)));
  // Центр дуги: на перпендикуляре к середине хорды, со стороны дуги (большая) или с противоположной (малая).
  const nx = (dy / chord) * side, ny = (-dx / chord) * side; // нормаль в сторону выгиба
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const toCenter = large ? (H - r) : -(r - H);
  const cx = mx + nx * toCenter, cy = my + ny * toCenter;
  const angA = Math.atan2(a.y - cy, a.x - cx);
  const angB = Math.atan2(b.y - cy, b.x - cx);
  // Идём от a к b по дуге длиной theta в ту сторону, где лежит вершина дуги.
  const apex = { x: mx + nx * H, y: my + ny * H };
  const angApex = Math.atan2(apex.y - cy, apex.x - cx);
  const norm = (v: number) => { let t = v; while (t <= -Math.PI) t += 2 * Math.PI; while (t > Math.PI) t -= 2 * Math.PI; return t; };
  const ccw = norm(angB - angA) > 0 ? 1 : -1; // направление a→b через короткую сторону
  // Если вершина дуги не лежит на коротком пути a→b, идём длинным.
  const dirApex = norm(angApex - angA);
  const dir: 1 | -1 = (ccw > 0) === (dirApex > 0) && Math.abs(dirApex) <= theta + 1e-6 ? (ccw as 1 | -1) : (-ccw as 1 | -1);
  const out: Pt[] = [];
  for (let s = 1; s < k; s++) {
    const ang = angA + dir * theta * (s / k);
    out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  return out;
}

export type DenseShape = {
  /** Плотная ломаная борта (вершины + точки дуг), см. */
  pts: Pt[];
  /** true — настоящая вершина борта (угол), false — точка дуги. */
  isCorner: boolean[];
  /** Для каждой точки — индекс исходного сегмента, которому принадлежит ребро pts[i]→pts[i+1]. */
  segOf: number[];
  closed: boolean;
};

/**
 * Разложить борт с дугами в плотную ломаную. Знак стрелки: у острова «+» — наружу
 * (к нижнему уровню), «−» — внутрь; у открытой линии «+» — СПРАВА по ходу хорды
 * (y вниз), «−» — слева. Полукруг у верхней стены, нарисованный слева направо: +R.
 */
export function densify(shape: Level2Shape, _lowSide: "left" | "right"): DenseShape {
  const { points, bulges, closed } = shape;
  const n = points.length;
  const segs = closed ? n : n - 1;
  // Остров: при обходе по часовой на экране (area > 0, y вниз) интерьер справа, наружу — слева (+1).
  const outward: 1 | -1 = closed ? (signedArea(points) > 0 ? 1 : -1) : -1;
  const pts: Pt[] = [], isCorner: boolean[] = [], segOf: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = points[i], b = points[(i + 1) % n];
    pts.push(a); isCorner.push(true); segOf.push(i);
    const h = bulges[i] || 0;
    if (h !== 0) {
      for (const p of arcPoints(a, b, h, (h > 0 ? outward : -outward) as 1 | -1)) { pts.push(p); isCorner.push(false); segOf.push(i); }
    }
  }
  if (!closed) { pts.push(points[n - 1]); isCorner.push(true); segOf.push(segs - 1); }
  return { pts, isCorner, segOf, closed };
}

/**
 * Радиусы по вершинам замкнутого контура для рисования: r у выпуклых углов, 0 у
 * вогнутых, 0 если смежная сторона на стене (onWall по рёбрам), не длиннее половины
 * соседней стороны. corners — какие вершины считать углами (по умолчанию все).
 */
export function level2CornerRadii(pts: Pt[], r: number, onWall?: boolean[], corners?: boolean[]): number[] {
  return cornerRadiiFor(pts, r, true, false, onWall, corners);
}

/** Радиусы для открытой линии борта: внутренние вершины (в обе стороны), концы — 0. */
export function openLineRadii(pts: Pt[], r: number, corners?: boolean[]): number[] {
  return cornerRadiiFor(pts, r, false, true, undefined, corners);
}

function cornerRadiiFor(pts: Pt[], r: number, closed: boolean, concaveToo: boolean, onWall?: boolean[], corners?: boolean[]): number[] {
  const n = pts.length;
  if (r <= 0 || n < 3) return pts.map(() => 0);
  const orient: 1 | -1 = closed && signedArea(pts) < 0 ? -1 : 1;
  return pts.map((_, i) => {
    if (!closed && (i === 0 || i === n - 1)) return 0;
    if (corners && !corners[i]) return 0;
    if (onWall && (onWall[i] || onWall[(i - 1 + n) % n])) return 0;
    const phi = turnAt(pts, i, orient);
    if (Math.abs(phi) <= 1e-9) return 0;
    if (!concaveToo && phi <= 0) return 0;
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(q.x - c.x, q.y - c.y);
    const tan = Math.tan(Math.abs(phi) / 2);
    return Math.max(0, Math.min(r, l1 / 2 / tan, l2 / 2 / tan));
  });
}

/**
 * Поправки замкнутого контура на скругление по заданным радиусам вершин:
 * длина −r·(2·tan(φ/2) − φ), площадь −r²·(tan(φ/2) − φ/2) у выпуклых углов.
 */
export function roundingByRadii(pts: Pt[], radii: number[]): { dP: number; dA: number } {
  const orient: 1 | -1 = signedArea(pts) >= 0 ? 1 : -1;
  let dP = 0, dA = 0;
  for (let i = 0; i < pts.length; i++) {
    const rr = radii[i];
    if (!rr || rr <= 0) continue;
    const phi = Math.abs(turnAt(pts, i, orient));
    const tan = Math.tan(phi / 2);
    dP -= rr * (2 * tan - phi);
    dA -= rr * rr * (tan - phi / 2);
  }
  return { dP, dA };
}

/** Поправки замкнутого контура радиусом r у всех выпуклых углов (совместимость). */
export function roundingCorrections(pts: Pt[], r: number): { dP: number; dA: number } {
  if (r <= 0 || pts.length < 3) return { dP: 0, dA: 0 };
  return roundingByRadii(pts, level2CornerRadii(pts, r));
}

/**
 * Открытая линия: длина короче на r·(2·tan(φ/2) − φ) в каждой скруглённой вершине, площадь
 * r²·(tan(φ/2) − φ/2) переезжает с выпуклой стороны угла на вогнутую. Возвращает сдвиг
 * площади В ЛЕВУЮ по ходу сторону (y вниз): поворот направо (turn > 0) — левая сторона
 * огибает угол снаружи (вогнутая), выпуклый угол у правой → левая получает.
 */
function openRoundingShift(line: Pt[], radii: number[]): { dP: number; areaToLeft: number } {
  let dP = 0, areaToLeft = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const rr = radii[i];
    if (!rr || rr <= 0) continue;
    const phi = turnAt(line, i, 1);
    const a = Math.abs(phi), tan = Math.tan(a / 2);
    dP -= rr * (2 * tan - a);
    const moved = rr * rr * (tan - a / 2);
    areaToLeft += phi > 0 ? moved : -moved;
  }
  return { dP, areaToLeft };
}

/**
 * Многоугольник со сдвинутыми внутрь рёбрами: offsets[i] — на сколько см сдвинуть
 * ребро i→i+1 (0 — не трогать). Новая вершина — пересечение соседних сдвинутых рёбер
 * (miter). Общий случай «стороны борта сдвигаем, стены стоят».
 */
export function offsetEdgesInward(pts: Pt[], offsets: number[]): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ ...p }));
  const orient: 1 | -1 = signedArea(pts) >= 0 ? 1 : -1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = (-orient * dy) / l, ny = (orient * dx) / l; // нормаль внутрь
    const d = offsets[i] || 0;
    return { ax: a.x + nx * d, ay: a.y + ny * d, dx, dy };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const den = L1.dx * L2.dy - L1.dy * L2.dx;
    if (Math.abs(den) < 1e-9) {
      out.push({ x: L2.ax, y: L2.ay });
      continue;
    }
    const t = ((L2.ax - L1.ax) * L2.dy - (L2.ay - L1.ay) * L2.dx) / den;
    out.push({ x: L1.ax + L1.dx * t, y: L1.ay + L1.dy * t });
  }
  return out;
}

/** Замкнутый контур, сдвинутый внутрь на d см (все стороны). */
export function offsetInward(pts: Pt[], d: number): Pt[] {
  if (d <= 0) return pts.map((p) => ({ ...p }));
  return offsetEdgesInward(pts, pts.map(() => d));
}

/**
 * Сдвиг не вывернулся: ориентация та же и каждое сдвинутое ребро смотрит туда же,
 * куда исходное (ревью 08.11.2026: ромб 60° со стороной 22 и треугольник 30-30-42
 * при полке 10 проходили проверку «сторона ≥ 2w», а офсет выворачивался).
 */
export function offsetIsValid(src: Pt[], dst: Pt[], closed: boolean, edgeMask?: boolean[], minEdge = 0): boolean {
  if (src.length !== dst.length) return false;
  if (closed && Math.sign(signedArea(src)) !== Math.sign(signedArea(dst))) return false;
  const segs = closed ? src.length : src.length - 1;
  for (let i = 0; i < segs; i++) {
    if (edgeMask && !edgeMask[i]) continue;
    const j = (i + 1) % src.length;
    const sx = src[j].x - src[i].x, sy = src[j].y - src[i].y;
    // Короткие рёбра плотной ломаной у стыка дуги с прямой стороной при miter-сдвиге
    // локально выворачиваются (петелька в десятки см²) — это не схлопнувшаяся сторона.
    if (minEdge > 0 && Math.hypot(sx, sy) < minEdge) continue;
    const dot = sx * (dst[j].x - dst[i].x) + sy * (dst[j].y - dst[i].y);
    if (dot <= 0) return false;
  }
  return true;
}

function distToLine(pt: Pt, a: Pt, b: Pt): number {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs((b.x - a.x) * (a.y - pt.y) - (a.x - pt.x) * (b.y - a.y)) / l;
}

/** Ближайшая точка контура комнаты: ребро j и точка на нём. */
function nearestOnBoundary(p: Pt, room: Pt[]): { j: number; q: Pt; dist: number; t: number } {
  let best = { j: 0, q: room[0], dist: Infinity, t: 0 };
  for (let j = 0; j < room.length; j++) {
    const a = room[j], b = room[(j + 1) % room.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (dist < best.dist) best = { j, q, dist, t };
  }
  return best;
}

/**
 * По рёбрам ломаной: true — ребро лежит на стене комнаты: параллельно, оба конца
 * ближе tol и проекции на стену ПЕРЕКРЫВАЮТСЯ (ревью 08.11.2026: в Г-комнате сторона
 * на продолжении внутренней стены считалась «на стене»).
 */
export function sidesOnWallMask(pts: Pt[], room: Pt[] | null, tol = ON_WALL_TOL_CM, closed = true): boolean[] {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  return pts.map((a, i) => {
    if (i >= segs) return false;
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!room || room.length < 3 || len < 1e-9) return false;
    for (let j = 0; j < room.length; j++) {
      const p = room[j], q = room[(j + 1) % room.length];
      const wx = q.x - p.x, wy = q.y - p.y;
      const wl = Math.hypot(wx, wy) || 1;
      const parallel = Math.abs((b.x - a.x) * wy - (b.y - a.y) * wx) / (wl * len) < 0.02;
      if (!parallel || distToLine(a, p, q) >= tol || distToLine(b, p, q) >= tol) continue;
      const ta = ((a.x - p.x) * wx + (a.y - p.y) * wy) / wl;
      const tb = ((b.x - p.x) * wx + (b.y - p.y) * wy) / wl;
      if (Math.max(Math.min(ta, tb), 0) < Math.min(Math.max(ta, tb), wl)) return true;
    }
    return false;
  });
}

/** Длины сторон замкнутого контура, НЕ лежащих на стене комнаты (там нужен борт). */
export function openSideLengths(contour: Pt[], room: Pt[] | null, tol = ON_WALL_TOL_CM): number[] {
  const n = contour.length;
  const mask = sidesOnWallMask(contour, room, tol);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask[i]) continue;
    const a = contour[i], b = contour[(i + 1) % n];
    out.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
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
  return nearestOnBoundary(p, poly).dist;
}

function onBoundary(p: Pt, poly: Pt[], tol = 0.5): boolean {
  return poly.length >= 2 && nearestOnBoundary(p, poly).dist < tol;
}

/** Расстояние от точки до ломаной (открытой или замкнутой), см — для раскладки подписей на чертеже. */
export function distToPath(p: Pt, pts: Pt[], closed: boolean): number {
  let best = Infinity;
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * SVG-путь борта: замкнутый контур или открытая ломаная, углы со скруглением radii
 * (по вершинам, в единицах точек). Дуги уже разложены в точки (densify).
 */
export function level2Path(pts: Pt[], radii: number[], closed: boolean): string {
  const n = pts.length;
  if (n < 2) return "";
  const at = (i: number) => pts[((i % n) + n) % n];
  const along = (from: Pt, to: Pt, dist: number) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / len) * dist, y: from.y + ((to.y - from.y) / len) * dist };
  };
  const rAt = (i: number) => (closed || (i > 0 && i < n - 1) ? radii[((i % n) + n) % n] || 0 : 0);
  const f = (v: number) => v.toFixed(1);
  const startR = rAt(0);
  const start = startR > 0 ? along(at(0), at(1), startR) : at(0);
  let d = `M ${f(start.x)} ${f(start.y)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const next = at(i + 1);
    const rNext = rAt(i + 1);
    const hasAfter = closed || i + 2 <= n - 1;
    const endPoint = rNext > 0 && hasAfter ? along(next, at(i), rNext) : next;
    d += ` L ${f(endPoint.x)} ${f(endPoint.y)}`;
    if (rNext > 0 && hasAfter) {
      const after = along(next, at(i + 2), rNext);
      d += ` Q ${f(next.x)} ${f(next.y)} ${f(after.x)} ${f(after.y)}`;
    }
  }
  return closed ? `${d} Z` : d;
}

// ============================================
// Расчёт
// ============================================

export type Level2Warning =
  | "shelf_too_wide"
  | "inside_other_contour"
  | "contours_overlap"
  | "outside_room"
  | "canvas_negative"
  /** Открытая линия: конец дальше 15 см от стены — притянули к ближайшей. */
  | "ends_not_on_wall"
  /** Открытая линия без комнаты или не делит её — посчитать нельзя. */
  | "open_no_room";

/** Сторона борта (исходный сегмент) — для подписей на чертеже и таблицы в цех. */
export type Level2Side = {
  from: Pt;
  to: Pt;
  /** Длина по прямой (хорда), см. */
  chordCm: number;
  /** Длина борта по этой стороне (дуга — по дуге), см. */
  lengthCm: number;
  /** Стрелка дуги, см («+» к нижнему уровню), 0 — прямая. */
  bulge: number;
  onWall: boolean;
  /** Вершина дуги (самая далёкая от хорды точка), см — для подписи длины; у прямой нет. */
  apex?: Pt;
};

export type Level2Calc = {
  /** Верхнее полотно, м². */
  upperM2: number;
  /** Площадь нижнего уровня (внутри борта у острова / со стороны lowSide у линии), м² — на столько уменьшается обычное полотно. */
  cutM2: number;
  /** Борт без сторон на стене, м. */
  bortM: number;
  /** Подсветка, м (0, если led выключен). */
  ledM: number;
  /** Полка между бортом и верхним полотном, м² (не полотно). */
  shelfM2: number;
  /** Вся длина борта со скруглением, м (у острова — и стороны у стен тоже) — для чертежа. */
  contourM: number;
  /** Сторон борта на стене. */
  sidesOnWall: number;
  /** Борт плотной ломаной (концы открытой линии притянуты к стенам), см. */
  contour: Pt[];
  /** Радиусы скругления по точкам contour (для чертежа). */
  contourRadii: number[];
  /** Кромка верхнего полотна (граница полки), см: замкнутая у острова, открытая у линии. null — полка не поместилась. */
  upper: Pt[] | null;
  upperRadii: number[];
  /** Многоугольник верхнего полотна целиком (у открытой линии — с участком стен), см; для цеха. */
  upperPolygon: Pt[] | null;
  /** Многоугольник нижнего уровня, см (остров — сам контур; линия — область со стороны lowSide). */
  lowPolygon: Pt[];
  /** Открытая линия: индексы стен комнаты, вдоль которых лежит нижний уровень (для сводки «низ у стены AB»). У острова пусто. */
  lowWalls: number[];
  /** Исходные стороны борта с длинами и признаком «на стене». */
  sides: Level2Side[];
  closed: boolean;
  warnings: Level2Warning[];
  params: Level2Params;
};

/**
 * Расчёт одного борта по вершинам (дуги — params.bulges). Точки проходят ту же чистку,
 * что у элемента (дубли, коллинеарные) — ревью 08.11.2026, №10: дубль вершины от
 * двойного тапа давал нулевую сторону и ложный shelf_too_wide.
 */
export function calcLevel2(points: Pt[], room: Pt[] | null, params: Level2Params): Level2Calc {
  const shape = level2Shape({ points, level2: params });
  if (!shape) {
    const closed = params.closed !== false;
    return calcLevel2Shape({ points, bulges: points.map(() => 0).slice(0, closed ? points.length : Math.max(0, points.length - 1)), closed }, room, params);
  }
  return calcLevel2Shape(shape, room, params);
}

/** Расчёт одного борта. room — вершины комнаты в см (null — остров без проверки стен; линии без комнаты не считаются). */
export function calcLevel2Shape(shape: Level2Shape, room: Pt[] | null, params: Level2Params): Level2Calc {
  return shape.closed ? calcClosed(shape, room, params) : calcOpen(shape, room, params);
}

function sidesOf(shape: Level2Shape, dense: DenseShape, onWallEdges: boolean[]): Level2Side[] {
  const n = shape.points.length;
  const segs = shape.closed ? n : n - 1;
  const out: Level2Side[] = [];
  for (let i = 0; i < segs; i++) {
    const from = shape.points[i], to = shape.points[(i + 1) % n];
    let lengthCm = 0;
    let onWall = true, any = false;
    let apex: Pt | undefined, apexDist = 0;
    for (let k = 0; k < dense.pts.length; k++) {
      if (dense.segOf[k] !== i) continue;
      if (!dense.closed && k === dense.pts.length - 1) continue;
      const a = dense.pts[k], b = dense.pts[(k + 1) % dense.pts.length];
      lengthCm += Math.hypot(b.x - a.x, b.y - a.y);
      any = true;
      if (!onWallEdges[k]) onWall = false;
      if (!dense.isCorner[k]) {
        const d = distToLine(a, from, to);
        if (d > apexDist) { apexDist = d; apex = a; }
      }
    }
    out.push({ from, to, chordCm: Math.hypot(to.x - from.x, to.y - from.y), lengthCm, bulge: shape.bulges[i] || 0, onWall: any && onWall, ...(apex ? { apex } : {}) });
  }
  return out;
}

function calcClosed(shape: Level2Shape, room: Pt[] | null, params: Level2Params): Level2Calc {
  const warnings: Level2Warning[] = [];
  const r = Math.max(0, params.radiusCm), w = Math.max(0, params.shelfCm);
  const dense = densify(shape, params.lowSide ?? "left");
  const D = dense.pts;
  const onWall = sidesOnWallMask(D, room, ON_WALL_TOL_CM, true);
  // Скругление: только настоящие выпуклые углы, не у стены.
  const radii = level2CornerRadii(D, r, onWall, dense.isCorner);
  const cR = roundingByRadii(D, radii);
  const cutCm2 = Math.abs(signedArea(D)) + cR.dA;
  const fullP = pathLength(D, true);
  const openP = D.reduce((s, p, i) => (onWall[i] ? s : s + Math.hypot(D[(i + 1) % D.length].x - p.x, D[(i + 1) % D.length].y - p.y)), 0);
  const contourP = fullP + cR.dP;
  const bortCm = openP + cR.dP; // скруглённые углы лежат только на открытых сторонах

  // Полка: сдвигаем внутрь только стороны с бортом; у стены ступеньки нет — верх до стены.
  let upper: Pt[] | null = null;
  let upperRadii: number[] = [];
  let upperCm2 = cutCm2;
  if (w > 0) {
    const U = offsetEdgesInward(D, onWall.map((ow) => (ow ? 0 : w)));
    if (offsetIsValid(D, U, true, undefined, 2 * w)) {
      upper = U;
      upperRadii = level2CornerRadii(U, Math.max(0, r - w), onWall, dense.isCorner);
      upperCm2 = Math.abs(signedArea(U)) + roundingByRadii(U, upperRadii).dA;
    } else {
      warnings.push("shelf_too_wide");
    }
  } else {
    upper = D.map((p) => ({ ...p }));
    upperRadii = radii.slice();
  }

  if (room && room.length >= 3 && D.some((p) => !pointInPolygon(p, room) && distToPolygon(p, room) > ON_WALL_TOL_CM)) warnings.push("outside_room");

  const sides = sidesOf(shape, dense, onWall);
  return {
    upperM2: r2(upperCm2 / 10000),
    cutM2: r2(cutCm2 / 10000),
    bortM: r2(bortCm / 100),
    ledM: params.led ? r2(bortCm / 100) : 0,
    shelfM2: r2(Math.max(0, cutCm2 - upperCm2) / 10000),
    contourM: r2(contourP / 100),
    sidesOnWall: sides.filter((s) => s.onWall).length,
    contour: D,
    contourRadii: radii,
    upper,
    upperRadii,
    upperPolygon: upper,
    lowPolygon: D.map((p) => ({ ...p })),
    lowWalls: [],
    sides,
    closed: true,
    warnings,
    params,
  };
}

/**
 * Открытая линия борта от стены до стены. Комната делится линией на две области:
 * нижний уровень — со стороны lowSide («left» — слева по ходу точек, если смотреть
 * на чертёж, y вниз), верх — с другой. Полка идёт по верхней стороне линии.
 */
function calcOpen(shape: Level2Shape, room: Pt[] | null, params: Level2Params): Level2Calc {
  const warnings: Level2Warning[] = [];
  const r = Math.max(0, params.radiusCm), w = Math.max(0, params.shelfCm);
  const lowSide = params.lowSide ?? "left";
  const dense = densify(shape, lowSide);
  const line = dense.pts.map((p) => ({ ...p }));
  const n = line.length;
  const noWall = dense.pts.map(() => false);
  const empty = (): Level2Calc => {
    const len = pathLength(line, false);
    return {
      upperM2: 0, cutM2: 0, bortM: r2(len / 100), ledM: params.led ? r2(len / 100) : 0, shelfM2: 0, contourM: r2(len / 100), sidesOnWall: 0,
      contour: line, contourRadii: openLineRadii(line, r, dense.isCorner), upper: null, upperRadii: [], upperPolygon: null, lowPolygon: [], lowWalls: [],
      sides: sidesOf(shape, dense, noWall), closed: false, warnings: [...warnings, "open_no_room"], params,
    };
  };
  if (!room || room.length < 3 || n < 2) return empty();

  // Концы — на стены (притягиваем к ближайшей точке контура комнаты).
  const ends = [nearestOnBoundary(line[0], room), nearestOnBoundary(line[n - 1], room)];
  if (ends.some((e) => e.dist > END_TOL_CM)) warnings.push("ends_not_on_wall");
  line[0] = ends[0].q;
  line[n - 1] = ends[1].q;
  if (line.slice(1, -1).some((p) => !pointInPolygon(p, room) && distToPolygon(p, room) > ON_WALL_TOL_CM)) warnings.push("outside_room");

  // Две области: линия + обход контура комнаты от конца к началу вперёд / назад.
  const m = room.length;
  const walk = (dir: 1 | -1, along: Pt[]): Pt[] => {
    const out: Pt[] = [...along];
    const jEnd = ends[1].j, jStart = ends[0].j;
    let j = jEnd;
    for (let k = 0; k < m + 1; k++) {
      if (dir === 1) {
        if (j === jStart && (k > 0 || ends[1].t <= ends[0].t)) break;
        out.push(room[(j + 1) % m]);
        j = (j + 1) % m;
      } else {
        if (j === jStart && (k > 0 || ends[1].t >= ends[0].t)) break;
        out.push(room[j]);
        j = (j - 1 + m) % m;
      }
    }
    return out;
  };
  const P1 = walk(1, line), P2 = walk(-1, line);
  // Сторона — по обходу: многоугольник «борт + стены», обходимый по часовой на экране
  // (area > 0, y вниз), лежит СПРАВА по ходу борта, против часовой — слева. У полукруга
  // область под дугой обходится против часовой → это «left», хотя от хорды она справа:
  // сторона считается вдоль самой линии борта, не вдоль хорды (дизайнер покажет штриховкой).
  const rightIsP1 = signedArea(P1) > 0;
  const rightPoly = rightIsP1 ? P1 : P2;
  const leftPoly = rightIsP1 ? P2 : P1;
  const lowPoly = lowSide === "right" ? rightPoly : leftPoly;
  const upPoly = lowSide === "right" ? leftPoly : rightPoly;
  const roomCm2 = Math.abs(signedArea(room));
  if (Math.abs(signedArea(lowPoly)) + Math.abs(signedArea(upPoly)) > roomCm2 * 1.02 + 1) return empty();

  // Скругление углов борта (настоящие вершины): длина короче, площадь переезжает с выпуклой стороны.
  const radii = openLineRadii(line, r, dense.isCorner);
  const sh = openRoundingShift(line, radii);
  const lowIsLeft = lowPoly === leftPoly;
  let lowCm2 = Math.abs(signedArea(lowPoly)) + (lowIsLeft ? sh.areaToLeft : -sh.areaToLeft);
  const bortCm = pathLength(line, false) + sh.dP;

  // Полка: в верхней области сдвигаем только рёбра линии (стены стоят).
  let upper: Pt[] | null = null;
  let upperRadii: number[] = [];
  let upperPolygon: Pt[] | null = null;
  let upperCm2 = roomCm2 - lowCm2;
  if (w > 0 && upPoly.length >= 3) {
    const lineEdges = upPoly.map((_, i) => i < n - 1);
    const U = offsetEdgesInward(upPoly, lineEdges.map((isLine) => (isLine ? w : 0)));
    if (offsetIsValid(upPoly, U, true, lineEdges, 2 * w)) {
      upperPolygon = U;
      upper = U.slice(0, n);
      upperRadii = openLineRadii(upper, Math.max(0, r - w), dense.isCorner);
      const uSh = openRoundingShift(upper, upperRadii);
      // Кромка верха повторяет повороты борта; площадь верха — не lowSide-сторона.
      upperCm2 = Math.abs(signedArea(U)) + (lowIsLeft ? -uSh.areaToLeft : uSh.areaToLeft);
    } else {
      warnings.push("shelf_too_wide");
    }
  } else if (w <= 0) {
    upperPolygon = upPoly.map((p) => ({ ...p }));
    upper = line.map((p) => ({ ...p }));
    upperRadii = radii.slice();
  }
  lowCm2 = Math.max(0, lowCm2);
  upperCm2 = Math.max(0, Math.min(upperCm2, roomCm2 - lowCm2));

  // Стены, вдоль которых лежит низ: те, что низ закрывает хотя бы наполовину (полоса вдоль
  // стены BC задевает и соседние AB/CD краями — их не называем); если таких нет — любые задетые.
  const coverage = room.map((p, j) => {
    const q = room[(j + 1) % m];
    let hit = 0;
    for (let k = 1; k <= 9; k++) {
      const t = k / 10;
      if (onBoundary({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, lowPoly)) hit++;
    }
    return hit / 9;
  });
  let lowWalls = coverage.map((c, j) => (c >= 0.5 ? j : -1)).filter((j) => j >= 0);
  if (lowWalls.length === 0) lowWalls = coverage.map((c, j) => (c > 0 ? j : -1)).filter((j) => j >= 0);

  return {
    upperM2: r2(upperCm2 / 10000),
    cutM2: r2(lowCm2 / 10000),
    bortM: r2(bortCm / 100),
    ledM: params.led ? r2(bortCm / 100) : 0,
    shelfM2: r2(Math.max(0, roomCm2 - lowCm2 - upperCm2) / 10000),
    contourM: r2(bortCm / 100),
    sidesOnWall: 0,
    contour: line,
    contourRadii: radii,
    upper,
    upperRadii,
    upperPolygon,
    lowPolygon: lowPoly,
    lowWalls,
    sides: sidesOf({ ...shape, points: [ends[0].q, ...shape.points.slice(1, -1), ends[1].q] }, dense, noWall),
    closed: false,
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

/** Все борта «2 уровня» комнаты одной сводкой; остров внутри другого / перекрытие — предупреждение. */
export function calcRoomLevel2(elements: RoomElement[] | null | undefined, room: Pt[] | null): RoomLevel2 | null {
  const items: RoomLevel2["items"] = [];
  for (const el of elements ?? []) {
    if (!el || el.type !== "level2") continue;
    const shape = level2Shape(el);
    if (!shape) continue;
    const params = level2Params(el);
    const calc = calcLevel2Shape(shape, room, params);
    items.push({ el, contour: calc.contour, calc });
  }
  if (items.length === 0) return null;
  const warnings = new Set<Level2Warning>();
  for (const it of items) for (const wn of it.calc.warnings) warnings.add(wn);
  for (let i = 0; i < items.length; i++) {
    if (!items[i].calc.closed) continue;
    for (let j = 0; j < items.length; j++) {
      if (i === j || !items[j].calc.closed) continue;
      const inside = items[i].contour.map((p) => pointInPolygon(p, items[j].contour));
      if (inside.every(Boolean)) warnings.add("inside_other_contour");
      else if (inside.some(Boolean)) warnings.add("contours_overlap");
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
 * Площадь обычного полотна после вычета нижних областей: не ниже нуля. Если они
 * больше комнаты (нарисованы за стеной / друг в друге) — предупреждение canvas_negative.
 */
export function canvasAfterLevel2(canvasM2: number, lvl: RoomLevel2 | null): { m2: number; warning: Level2Warning | null } {
  if (!lvl) return { m2: canvasM2, warning: null };
  const rest = canvasM2 - lvl.cutM2;
  if (rest < -0.005) return { m2: 0, warning: "canvas_negative" };
  return { m2: r2(Math.max(0, rest)), warning: null };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
