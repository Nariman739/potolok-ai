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

import type { Level2Params } from "./room-types";

export type Pt = { x: number; y: number };

/**
 * Элемент чертежа глазами этого модуля: только нужные поля. Структурный тип, а не
 * RoomElement — у мобилки свой RoomElement в RoomsContext (с shape "circle"),
 * у сайта свой в room-types; оба подходят.
 */
export type Level2ElementLike = {
  id?: string;
  type?: string;
  points?: { x: number; y: number }[];
  rotation?: number;
  level2?: Level2Params;
};

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

export function level2Params(el: Pick<Level2ElementLike, "level2">): Level2Params {
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
export function level2Shape(el: Level2ElementLike): Level2Shape | null {
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
export function level2Contour(el: Level2ElementLike): Pt[] | null {
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
 * Поворот в вершине i по ближайшим НЕСОВПАДАЮЩИМ соседям (после обрезки офсета у конца
 * дуги несколько точек стоят в одном месте — ребро нулевой длины не даёт направления).
 */
function turnAtD(pts: Pt[], i: number, orient: 1 | -1, closed = true): number {
  const n = pts.length;
  const c = pts[i];
  let p: Pt | null = null, q: Pt | null = null;
  for (let k = 1; k < n; k++) {
    const j = i - k;
    if (!closed && j < 0) break;
    const cand = pts[((j % n) + n) % n];
    if (Math.hypot(cand.x - c.x, cand.y - c.y) > 1e-6) { p = cand; break; }
  }
  for (let k = 1; k < n; k++) {
    const j = i + k;
    if (!closed && j > n - 1) break;
    const cand = pts[j % n];
    if (Math.hypot(cand.x - c.x, cand.y - c.y) > 1e-6) { q = cand; break; }
  }
  if (!p || !q) return 0;
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
 * Скругление угла i радиусом r — настоящая окружность, касательная к обеим сторонам
 * (ревью 09.11.2026: у дуги формулы двух прямых занижали борт на 0,1–0,5 м). Центр —
 * пересечение сдвигов сторон на r в сторону поворота, точки касания — перпендикуляры из
 * центра; стороной может быть и плотная дуга. maxBack/maxFwd — сколько см ломаной можно
 * просматривать в каждую сторону. null — окружность не помещается.
 */
export type Level2Fillet = {
  /** Точки касания и центр. */
  ta: Pt; tb: Pt; o: Pt; r: number;
  /** Ребро (kb → kb+1), на котором лежит ta; ребро (kf−1 → kf) с tb (индексы без % n). */
  kb: number; kf: number;
  /** Путь по ломаной от вершины до точек касания, см. */
  dBack: number; dFwd: number;
  /** Точки дуги скругления от ta к tb включительно. */
  arc: Pt[];
};

export function filletAt(pts: Pt[], i: number, r: number, closed: boolean, maxBack = Infinity, maxFwd = Infinity): Level2Fillet | null {
  const n = pts.length;
  if (r <= 0 || n < 3) return null;
  const t = turnAtD(pts, i, 1, closed);
  if (Math.abs(t) < 1e-6) return null;
  const sgn = t > 0 ? 1 : -1;
  const at = (k: number) => pts[((k % n) + n) % n];
  // Сдвинутая на r ломаная стороны: сдвиги рёбер + перемычки у вершин (при сдвиге в сторону
  // выпуклости дуги рёбра не смыкаются — без перемычек окружность «проваливалась» в зазор).
  // Каждый отрезок помнит, чего касается окружность: ребра (foot на ребре) или вершины.
  type S = { p: Pt; q: Pt; ea?: Pt; eb?: Pt; v?: Pt; k: number; d0: number; len: number; first: boolean };
  const build = (dir: 1 | -1, maxD: number): S[] => {
    const out: S[] = [];
    let d = 0, prevOff: Pt | null = null, prevV: Pt | null = null, prevK = i;
    for (let k = i; k !== i + dir * n; k += dir) {
      const kk = k + dir;
      if (!closed && (kk < 0 || kk > n - 1)) break;
      const a0 = at(k), b0 = at(kk);
      const l = Math.hypot(b0.x - a0.x, b0.y - a0.y);
      if (l <= 1e-9) continue;
      // Ребро всегда в прямом порядке точек (a → b), нормаль — в сторону поворота.
      const ea = dir > 0 ? a0 : b0, eb = dir > 0 ? b0 : a0;
      const nx = (-(eb.y - ea.y) / l) * sgn * r, ny = ((eb.x - ea.x) / l) * sgn * r;
      const oNear = { x: a0.x + nx, y: a0.y + ny }, oFar = { x: b0.x + nx, y: b0.y + ny };
      if (prevOff && prevV && Math.hypot(oNear.x - prevOff.x, oNear.y - prevOff.y) > 1e-9) {
        out.push({ p: prevOff, q: oNear, v: prevV, k: prevK, d0: d, len: 0, first: false });
      }
      out.push({ p: oNear, q: oFar, ea, eb, k: dir > 0 ? kk : k + dir, d0: d, len: l, first: out.length === 0 });
      d += l; prevOff = oFar; prevV = b0; prevK = dir > 0 ? kk : kk;
      if (d > maxD) break;
    }
    return out;
  };
  // Дальше 25·r касание не уходит даже у острого угла (≈ 7°) — дальше не ищем (скорость).
  const reachMax = 25 * r + 50;
  const back = build(-1, Math.min(maxBack, reachMax)), fwd = build(1, Math.min(maxFwd, reachMax));
  let best: { o: Pt; be: S; fe: S; score: number } | null = null;
  for (let bi = 0; bi < back.length; bi++) {
    for (let fi = 0; fi < fwd.length; fi++) {
      if (best && bi + fi >= best.score) break;
      const B = back[bi], F = fwd[fi];
      // Рамки отрезков далеко — пересечения нет (первые рёбра продлеваются — их не отсекаем).
      if (!B.first && !F.first && (Math.max(B.p.x, B.q.x) < Math.min(F.p.x, F.q.x) - 1e-6 || Math.max(F.p.x, F.q.x) < Math.min(B.p.x, B.q.x) - 1e-6 || Math.max(B.p.y, B.q.y) < Math.min(F.p.y, F.q.y) - 1e-6 || Math.max(F.p.y, F.q.y) < Math.min(B.p.y, B.q.y) - 1e-6)) continue;
      const rx = B.q.x - B.p.x, ry = B.q.y - B.p.y, sx = F.q.x - F.p.x, sy = F.q.y - F.p.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const u = ((F.p.x - B.p.x) * sy - (F.p.y - B.p.y) * sx) / den;
      const v = ((F.p.x - B.p.x) * ry - (F.p.y - B.p.y) * rx) / den;
      const eps = 1e-9;
      // Первые рёбра от вершины продлеваем назад (у двух прямых центр лежит на продолжении).
      if (u > 1 + eps || v > 1 + eps) continue;
      if (u < -eps && !B.first) continue;
      if (v < -eps && !F.first) continue;
      best = { o: { x: B.p.x + rx * u, y: B.p.y + ry * u }, be: B, fe: F, score: bi + fi };
    }
  }
  if (!best) return null;
  const o = best.o;
  // Окружность должна помещаться: остальные рёбра контура — не ближе 1,001·r к центру (иначе
  // скругление вылезает за другую сторону или сливается с соседним — треугольник R50 >
  // вписанной окружности, ревью 10.11.2026). Рёбра у самих точек касания не в счёт.
  {
    const segs = closed ? n : n - 1;
    const tb0 = best.be.v ?? null, tf0 = best.fe.v ?? null;
    const pb = tb0 ?? (() => { const e = best!.be; const dx = e.eb!.x - e.ea!.x, dy = e.eb!.y - e.ea!.y, l2 = dx * dx + dy * dy; const tt = Math.max(0, Math.min(1, ((o.x - e.ea!.x) * dx + (o.y - e.ea!.y) * dy) / l2)); return { x: e.ea!.x + dx * tt, y: e.ea!.y + dy * tt }; })();
    const pf = tf0 ?? (() => { const e = best!.fe; const dx = e.eb!.x - e.ea!.x, dy = e.eb!.y - e.ea!.y, l2 = dx * dx + dy * dy; const tt = Math.max(0, Math.min(1, ((o.x - e.ea!.x) * dx + (o.y - e.ea!.y) * dy) / l2)); return { x: e.ea!.x + dx * tt, y: e.ea!.y + dy * tt }; })();
    for (let k = 0; k < segs; k++) {
      const a2 = pts[k], b2 = pts[(k + 1) % n];
      const dx = b2.x - a2.x, dy = b2.y - a2.y, l2 = dx * dx + dy * dy;
      const tt = l2 > 0 ? Math.max(0, Math.min(1, ((o.x - a2.x) * dx + (o.y - a2.y) * dy) / l2)) : 0;
      const q = { x: a2.x + dx * tt, y: a2.y + dy * tt };
      const d = Math.hypot(o.x - q.x, o.y - q.y);
      // Рядом с касанием хорды плотной дуги лежат чуть внутри настоящей дуги — там допуск по касанию.
      const nearTouch = Math.hypot(q.x - pb.x, q.y - pb.y) < Math.max(0.5, 0.4 * r) || Math.hypot(q.x - pf.x, q.y - pf.y) < Math.max(0.5, 0.4 * r);
      if (d < (nearTouch ? r * (1 - 1e-2) - 0.05 : r * 1.001)) return null;
    }
  }
  // Точка касания и путь от вершины до неё.
  const touch = (sg: S, dir: 1 | -1) => {
    if (sg.v) return { p: { ...sg.v }, dist: sg.d0 };
    const ea = sg.ea!, eb = sg.eb!;
    const dx = eb.x - ea.x, dy = eb.y - ea.y, l2 = dx * dx + dy * dy;
    const tt = Math.max(0, Math.min(1, ((o.x - ea.x) * dx + (o.y - ea.y) * dy) / l2));
    const p = { x: ea.x + dx * tt, y: ea.y + dy * tt };
    return { p, dist: sg.d0 + (dir > 0 ? tt : 1 - tt) * sg.len };
  };
  const tbk = touch(best.be, -1), tfw = touch(best.fe, 1);
  // Индексы рёбер касания: назад — ребро (kb → kb+1), вперёд — (kf−1 → kf).
  const kb = best.be.v ? best.be.k - 1 : best.be.k, kf = best.fe.v ? best.fe.k + 1 : best.fe.k;
  const a0 = Math.atan2(tbk.p.y - o.y, tbk.p.x - o.x), a1 = Math.atan2(tfw.p.y - o.y, tfw.p.x - o.x);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
  const arc: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const ang = a0 + (sweep * k) / steps;
    arc.push(k === 0 ? tbk.p : k === steps ? tfw.p : { x: o.x + r * Math.cos(ang), y: o.y + r * Math.sin(ang) });
  }
  return { ta: tbk.p, tb: tfw.p, o, r, kb, kf, dBack: tbk.dist, dFwd: tfw.dist, arc };
}

/**
 * Ломаная со скруглёнными углами (radii по вершинам): участок у вершины между точками
 * касания заменён дугой окружности. По ней считаются длина/площадь и рисуется путь —
 * КП и чертёж совпадают.
 */
export function filletPolygon(pts: Pt[], radii: number[], closed: boolean): Pt[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ ...p }));
  // Кэш: расчёт (длина/площадь) и чертёж (путь) просят одно и то же для тех же массивов.
  const hit = FILLET_CACHE.get(pts);
  if (hit && hit.closed === closed && hit.radii.length === radii.length && hit.radii.every((r, i) => r === radii[i])) return hit.out;
  // Окно поиска касания — до соседней скругляемой вершины (дальше окружность не уйдёт).
  const active = radii.map((r, i) => (r || 0) > 0 && (closed || (i > 0 && i < n - 1)));
  const windowTo = (i: number, dir: 1 | -1) => {
    let len = 0;
    for (let k = 1; k < n; k++) {
      const a = i + dir * (k - 1), b = i + dir * k;
      if (!closed && (b < 0 || b > n - 1)) break;
      const pa = pts[((a % n) + n) % n], pb = pts[((b % n) + n) % n];
      len += Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (active[((b % n) + n) % n]) break;
    }
    return len;
  };
  const fil: (Level2Fillet | null)[] = pts.map((_, i) => (active[i] ? filletMemo(pts, i, radii[i], closed, windowTo(i, -1), windowTo(i, 1)) : null));
  let out: Pt[];
  if (!fil.some(Boolean)) out = pts.map((p) => ({ ...p }));
  else {
    const drop = pts.map(() => false);
    const at = new Map<number, Level2Fillet[]>();
    for (let i = 0; i < n; i++) {
      const f = fil[i];
      if (!f) continue;
      for (let k = f.kb + 1; k <= f.kf - 1; k++) drop[((k % n) + n) % n] = true;
      const key = ((f.kb % n) + n) % n;
      const list = at.get(key);
      if (list) list.push(f); else at.set(key, [f]);
    }
    out = [];
    let s0 = 0;
    if (closed) { s0 = drop.findIndex((v) => !v); if (s0 < 0) s0 = 0; }
    for (let k = 0; k < n; k++) {
      const i = (s0 + k) % n;
      if (!drop[i]) out.push({ ...pts[i] });
      const list = at.get(i);
      if (list) for (const f of list) for (const p of f.arc) out.push({ ...p });
    }
  }
  FILLET_CACHE.set(pts, { radii: radii.slice(), closed, out });
  return out;
}
const FILLET_CACHE = new WeakMap<Pt[], { radii: number[]; closed: boolean; out: Pt[] }>();

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

/** Память окружностей скругления на массив точек (подбор R и скруглённая ломаная строят одни и те же). */
const FILLET_MEMO = new WeakMap<Pt[], Map<string, Level2Fillet | null>>();
function filletMemo(pts: Pt[], i: number, r: number, closed: boolean, maxBack: number, maxFwd: number): Level2Fillet | null {
  let m = FILLET_MEMO.get(pts);
  if (!m) { m = new Map(); FILLET_MEMO.set(pts, m); }
  const key = `${i}:${r}:${closed ? 1 : 0}`;
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const f = filletAt(pts, i, r, closed, maxBack, maxFwd);
  m.set(key, f);
  return f;
}

function cornerRadiiFor(pts: Pt[], r: number, closed: boolean, concaveToo: boolean, onWall?: boolean[], corners?: boolean[]): number[] {
  const n = pts.length;
  if (r <= 0 || n < 3) return pts.map(() => 0);
  const orient: 1 | -1 = closed && signedArea(pts) < 0 ? -1 : 1;
  const isCorner = (i: number) => !corners || corners[i] || (!closed && (i === 0 || i === n - 1));
  const roundable = pts.map((_, i) => {
    if (!closed && (i === 0 || i === n - 1)) return false;
    if (corners && !corners[i]) return false;
    if (onWall && (onWall[i] || onWall[(i - 1 + n) % n])) return false;
    const phi = turnAtD(pts, i, orient, closed);
    if (Math.abs(phi) <= 1e-9) return false;
    if (!concaveToo && phi <= 0) return false;
    return true;
  });
  // Сосед-угол назад/вперёд (по маске углов) и путь до него.
  const neighbour = (i: number, dir: 1 | -1): { j: number; len: number } | null => {
    let len = 0;
    for (let k = 1; k < n; k++) {
      const a = i + dir * (k - 1), b = i + dir * k;
      if (!closed && (b < 0 || b > n - 1)) return { j: -1, len };
      const pa = pts[((a % n) + n) % n], pb = pts[((b % n) + n) % n];
      len += Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const jj = ((b % n) + n) % n;
      if (isCorner(jj)) return { j: jj, len };
    }
    return null;
  };
  const nb = pts.map((_, i) => (roundable[i] ? { back: neighbour(i, -1), fwd: neighbour(i, 1) } : null));
  // Одна и та же окружность нужна в трёх проходах и потом в скруглённой ломаной — считаем один раз.
  const filletAt = (p: Pt[], i: number, rr: number, cl: boolean, mb: number, mf: number) => filletMemo(p, i, rr, cl, mb, mf);
  // Проход 1: сколько стороны нужно каждому углу при полном R (настоящая касательная окружность);
  // не влезла — вся сторона (не «половина», иначе сосед считал долю против всей длины, ревью 10.11.2026).
  const need = pts.map((_, i) => {
    const q = nb[i];
    if (!q || !q.back || !q.fwd) return null;
    const f = filletAt(pts, i, r, closed, q.back.len, q.fwd.len);
    return f ? { b: f.dBack, f: f.dFwd } : { b: q.back.len, f: q.fwd.len };
  });
  /** Наибольший R ≤ hi, при котором касания влезают в доли hb/hf (делением пополам — без ступеней ×0,9). */
  const fit = (i: number, hi: number, hb: number, hf: number, q: { back: { len: number }; fwd: { len: number } }) => {
    const ok = (rr: number) => { const f = filletAt(pts, i, rr, closed, q.back.len, q.fwd.len); return !!f && f.dBack <= hb + 1e-6 && f.dFwd <= hf + 1e-6; };
    if (ok(hi)) return hi;
    let lo = 0, top = hi;
    for (let k = 0; k < 14; k++) { const mid = (lo + top) / 2; if (ok(mid)) lo = mid; else top = mid; }
    return lo < 0.5 ? 0 : Math.floor(lo * 100) / 100;
  };
  // Проход 2: сторону между соседними углами делим пропорционально их потребности.
  const out = pts.map((_, i) => {
    const q = nb[i], nd = need[i];
    if (!q || !nd || !q.back || !q.fwd) return 0;
    const allow = (side: { j: number; len: number }, mine: number, theirsKey: "b" | "f") => {
      const other = side.j >= 0 && roundable[side.j] ? need[side.j] : null;
      const theirs = other ? Math.min(other[theirsKey], side.len) : 0;
      return mine + theirs <= side.len ? side.len : (side.len * mine) / (mine + theirs);
    };
    return fit(i, r, allow(q.back, nd.b, "f"), allow(q.fwd, nd.f, "b"), q as { back: { len: number }; fwd: { len: number } });
  });
  // Проход 3: по каждой стороне касания соседей не перекрываются (dFwd_i + dBack_j ≤ длины), иначе
  // общий множитель обоих радиусов — делением пополам (треугольник R50 давал петлю, ревью 10.11.2026).
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const q = nb[i];
      if (!q || !q.fwd || out[i] <= 0 || q.fwd.j < 0 || out[q.fwd.j] <= 0) continue;
      const j = q.fwd.j, qj = nb[j];
      if (!qj || !qj.back || !qj.fwd) continue;
      const len = q.fwd.len;
      const sum = (si: number) => {
        const fi = filletAt(pts, i, out[i] * si, closed, q.back!.len, q.fwd!.len), fj = filletAt(pts, j, out[j] * si, closed, qj.back!.len, qj.fwd!.len);
        return (fi ? fi.dFwd : Infinity) + (fj ? fj.dBack : Infinity);
      };
      if (sum(1) <= len + 1e-6) continue;
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (sum(mid) <= len + 1e-6) lo = mid; else hi = mid; }
      out[i] = out[i] * lo < 0.5 ? 0 : Math.floor(out[i] * lo * 100) / 100;
      out[j] = out[j] * lo < 0.5 ? 0 : Math.floor(out[j] * lo * 100) / 100;
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Поправки замкнутого контура на скругление по радиусам вершин — по настоящей скруглённой
 * ломаной (filletPolygon), а не формулами двух прямых (у дуги они врали, ревью 09.11.2026).
 */
export function roundingByRadii(pts: Pt[], radii: number[]): { dP: number; dA: number } {
  if (!radii.some((r) => r > 0)) return { dP: 0, dA: 0 };
  const R = filletPolygon(pts, radii, true);
  return { dP: pathLength(R, true) - pathLength(pts, true), dA: Math.abs(signedArea(R)) - Math.abs(signedArea(pts)) };
}

/** Поправки замкнутого контура радиусом r у всех выпуклых углов (совместимость). */
export function roundingCorrections(pts: Pt[], r: number): { dP: number; dA: number } {
  if (r <= 0 || pts.length < 3) return { dP: 0, dA: 0 };
  return roundingByRadii(pts, level2CornerRadii(pts, r));
}

/**
 * Открытая линия: скругление вершины (настоящая касательная окружность) укорачивает борт, а
 * площадь между углом и дугой переезжает с выпуклой стороны на вогнутую. Возвращает сдвиг
 * площади В ЛЕВУЮ по ходу сторону (y вниз): поворот направо (turn > 0) — левая получает.
 */
function openRoundingShift(line: Pt[], radii: number[]): { dP: number; areaToLeft: number } {
  let dP = 0, areaToLeft = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const rr = radii[i];
    if (!rr || rr <= 0) continue;
    const f = filletAt(line, i, rr, false);
    if (!f) continue;
    const arcLen = pathLength(f.arc, false);
    dP += arcLen - (f.dBack + f.dFwd);
    // Область между ломаной ta → … → вершина → … → tb и дугой tb → ta.
    const poly: Pt[] = [f.ta];
    for (let k = f.kb + 1; k <= f.kf - 1; k++) poly.push(line[k]);
    poly.push(f.tb, ...f.arc.slice(1, -1).reverse());
    const moved = Math.abs(signedArea(poly));
    const phi = turnAtD(line, i, 1, false);
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
 * Обрезка «усов» офсета у конца дуги (ревью 09.11.2026): точки дуги рядом с выпуклым углом
 * при сдвиге уходят за линию полки соседней стороны — кромка полки шла по диагонали к углу,
 * ореол LED вылезал за борт. Для каждого выпуклого угла c: точки дуги перед ним, лежащие
 * снаружи сдвинутой линии ребра c→c+1, сводятся в точку пересечения с этой линией (и
 * симметрично после угла). Индексы сохраняются (точки совпадают) — маски рёбер не едут.
 * corners — настоящие вершины (по ним идём только через точки дуг).
 */
export function clipOffsetOvershoot(src: Pt[], dst: Pt[], corners: boolean[]): Pt[] {
  const n = src.length;
  if (n < 3 || dst.length !== n) return dst;
  const out = dst.map((p) => ({ ...p }));
  const orient: 1 | -1 = signedArea(src) >= 0 ? 1 : -1;
  const at = (k: number) => ((k % n) + n) % n;
  const inN = (a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: (-orient * dy) / l, y: (orient * dx) / l };
  };
  const side = (pt: Pt, o: Pt, nrm: Pt) => (pt.x - o.x) * nrm.x + (pt.y - o.y) * nrm.y;
  const cutLine = (a: Pt, b: Pt, o: Pt, nrm: Pt): Pt | null => {
    const sa = side(a, o, nrm), sb = side(b, o, nrm);
    if (sa === sb) return null;
    const t = sa / (sa - sb);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const segX = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null => {
    const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = p4.x - p3.x, sy = p4.y - p3.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const u = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / den, v = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / den;
    return u > 1e-9 && u < 1 - 1e-9 && v > 1e-9 && v < 1 - 1e-9 ? { x: p1.x + rx * u, y: p1.y + ry * u } : null;
  };
  for (let c = 0; c < n; c++) {
    if (!corners[c] || turnAtD(src, c, orient) <= 1e-6) continue;
    const prevStraight = corners[at(c - 1)], nextStraight = corners[at(c + 1)];
    if (prevStraight && nextStraight) continue;
    if (nextStraight) {
      // Перед углом дуга, после — настоящая прямая сторона: режем по линии полки этой стороны.
      const nrm = inN(src[c], src[at(c + 1)]);
      const o = dst[c];
      let j = at(c - 1), steps = 0;
      while (!corners[j] && side(out[j], o, nrm) < -1e-6 && steps < n) { j = at(j - 1); steps++; }
      if (steps > 0 && side(out[j], o, nrm) >= -1e-6) {
        const X = cutLine(out[j], out[at(j + 1)], o, nrm);
        if (X) for (let k = 1; k <= steps + 1; k++) out[at(j + k)] = { ...X };
      }
    } else if (prevStraight) {
      // Перед углом прямая сторона, после — дуга.
      const nrm = inN(src[at(c - 1)], src[c]);
      const o = dst[c];
      let j = at(c + 1), steps = 0;
      while (!corners[j] && side(out[j], o, nrm) < -1e-6 && steps < n) { j = at(j + 1); steps++; }
      if (steps > 0 && side(out[j], o, nrm) >= -1e-6) {
        const X = cutLine(out[at(j - 1)], out[j], o, nrm);
        if (X) for (let k = 0; k <= steps; k++) out[at(c + k)] = { ...X };
      }
    } else {
      // Дуги с обеих сторон (ревью 09.11.2026, #91): ищем пересечение самих сдвинутых ломаных
      // дуг — ближайшую к углу пару рёбер — и сводим петлю в точку пересечения.
      // Петля сдвига у угла — в пределах нескольких сдвигов от него: дальше не ищем (скорость, ревью 10.11.2026).
      const wloc = Math.max(1, Math.hypot(dst[c].x - src[c].x, dst[c].y - src[c].y));
      const reach = (j: number) => Math.hypot(src[j].x - src[c].x, src[j].y - src[c].y) <= 6 * wloc;
      const back: number[] = [], fwd: number[] = [];
      for (let k = 1; k < n && back.length < n; k++) { const j = at(c - k); back.push(j); if (corners[j] || !reach(j)) break; }
      for (let k = 0; k < n && fwd.length < n; k++) { const j = at(c + k); fwd.push(j); if (corners[at(j + 1)] || !reach(at(j + 1))) break; }
      // Петли бывают вложенными (сдвиг дуги у острого угла делает «ус» за «усом»): снимаем по одной, пока есть.
      for (let pass = 0; pass < 24; pass++) {
        let best: { X: Pt; jb: number; jf: number; score: number } | null = null;
        for (let bi = 0; bi < back.length; bi++) {
          for (let fi = 0; fi < fwd.length; fi++) {
            if (best && bi + fi >= best.score) break;
            const jb = back[bi], jf = fwd[fi];
            if (jb === jf || at(jb + 1) === jf || at(jf + 1) === jb) continue;
            const X = segX(out[jb], out[at(jb + 1)], out[jf], out[at(jf + 1)]);
            if (X) best = { X, jb, jf, score: bi + fi };
          }
        }
        if (!best) break;
        for (let k = at(best.jb + 1); ; k = at(k + 1)) { out[k] = { ...best.X }; if (k === best.jf) break; }
      }
    }
  }
  return out;
}

/** Ломаная пересекает сама себя (несоседние рёбра, нулевые рёбра не в счёт). */
export function selfIntersects(pts: Pt[], closed: boolean): boolean {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  if (segs < 4) return false;
  // Сетка ячеек вместо перебора всех пар (ревью 10.11.2026: 570 точек — 1,7 мс).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sum = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    minX = Math.min(minX, a.x, b.x); minY = Math.min(minY, a.y, b.y); maxX = Math.max(maxX, a.x, b.x); maxY = Math.max(maxY, a.y, b.y);
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const cell = Math.max(1, (sum / segs) * 3);
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const grid = new Map<number, number[]>();
  const cross = (i: number, j: number) => {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    if (Math.hypot(rx, ry) < 1e-6 || Math.hypot(sx, sy) < 1e-6) return false;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return false;
    const u = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, v = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    return u > 1e-6 && u < 1 - 1e-6 && v > 1e-6 && v < 1 - 1e-6;
  };
  const adjacent = (i: number, j: number) => Math.abs(i - j) <= 1 || (closed && ((i === 0 && j === segs - 1) || (j === 0 && i === segs - 1)));
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const x0 = Math.floor((Math.min(a.x, b.x) - minX) / cell), x1 = Math.floor((Math.max(a.x, b.x) - minX) / cell);
    const y0 = Math.floor((Math.min(a.y, b.y) - minY) / cell), y1 = Math.floor((Math.max(a.y, b.y) - minY) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const key = gy * cols + gx;
      const list = grid.get(key);
      if (list) {
        for (const j of list) if (!adjacent(i, j) && cross(i, j)) return true;
        list.push(i);
      } else grid.set(key, [i]);
    }
  }
  return false;
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
    // Ребро, схлопнутое обрезкой у конца дуги (clipOffsetOvershoot), — не вывернутое.
    if (Math.hypot(dst[j].x - dst[i].x, dst[j].y - dst[i].y) < 1e-6) continue;
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

/**
 * «На стене» — только настоящие прямые стороны или участки дуги заметной длины (≥ 20 см):
 * дуга, касающаяся стены, давала одно короткое ребро «на стене» → сдвиг 0 на нём, кромка
 * ломалась (ревью 10.11.2026: верх 3,15 вместо 2,53).
 */
export function keepWallRuns(pts: Pt[], mask: boolean[], corners: boolean[], closed: boolean, minRun = 20): boolean[] {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const out = mask.slice();
  const straight = (i: number) => corners[i] && corners[(i + 1) % n];
  const seen = new Array(n).fill(false);
  for (let i = 0; i < segs; i++) {
    if (!mask[i] || seen[i] || straight(i)) continue;
    // Прогон подряд идущих рёбер дуги «на стене».
    const run: number[] = [];
    let j = i;
    while (j < segs && mask[j] && !straight(j) && !seen[j]) { run.push(j); seen[j] = true; j = closed ? (j + 1) % n : j + 1; if (j === i) break; }
    const len = run.reduce((s2, k) => s2 + Math.hypot(pts[(k + 1) % n].x - pts[k].x, pts[(k + 1) % n].y - pts[k].y), 0);
    if (len < minRun) for (const k of run) out[k] = false;
  }
  return out;
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
 * SVG-путь борта: ломаная со скруглёнными углами — та же filletPolygon, по которой считаются
 * длина и площадь (КП = чертёж). Скругление — точками дуги (шаг 5°).
 */
export function level2Path(pts: Pt[], radii: number[], closed: boolean): string {
  if (pts.length < 2) return "";
  const R = filletPolygon(pts, radii, closed);
  const f = (v: number) => v.toFixed(1);
  let d = "";
  let last: Pt | null = null;
  for (const p of R) {
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.05) continue;
    d += `${d ? " L" : "M"} ${f(p.x)} ${f(p.y)}`;
    last = p;
  }
  return closed ? `${d} Z` : d;
}

/**
 * Путь борта БЕЗ сторон, лежащих на стене (там борта нет): непрерывные участки
 * открытых рёбер рисуются отдельными ломаными со скруглением. Если ни одно ребро
 * не на стене — обычный замкнутый/открытый путь.
 */
export function level2RunsPath(pts: Pt[], radii: number[], edgeOnWall: boolean[], closed: boolean): string {
  const n = pts.length;
  if (n < 2) return "";
  const segs = closed ? n : n - 1;
  if (!edgeOnWall.some((v, i) => v && i < segs)) return level2Path(pts, radii, closed);
  // Начинаем обход с ребра после стены, чтобы участок не рвался на индексе 0.
  let start = 0;
  if (closed) {
    for (let i = 0; i < n; i++) if (edgeOnWall[i] && !edgeOnWall[(i + 1) % n]) { start = (i + 1) % n; break; }
  }
  const parts: string[] = [];
  let run: Pt[] = [], runR: number[] = [];
  const flush = () => {
    if (run.length >= 2) parts.push(level2Path(run, runR, false));
    run = []; runR = [];
  };
  for (let k = 0; k < segs; k++) {
    const i = closed ? (start + k) % n : k;
    if (edgeOnWall[i]) { flush(); continue; }
    if (run.length === 0) { run.push(pts[i]); runR.push(0); }
    const j = (i + 1) % n;
    run.push(pts[j]);
    // Радиус в вершине j — только если следующее ребро тоже открыто (иначе угол у стены — прямой).
    const nextOpen = (closed || j < n - 1) && !edgeOnWall[j];
    runR.push(nextOpen ? radii[j] || 0 : 0);
  }
  flush();
  return parts.join(" ");
}

/** Простой путь по вершинам (для контура комнаты под заливку). */
export function polygonPath(pts: Pt[]): string {
  if (pts.length < 3) return "";
  return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
}

/**
 * Заливка нижнего уровня: у острова — КОЛЬЦО между стенами и бортом (комната минус
 * остров, fill-rule evenodd), у открытой линии — область со стороны lowSide.
 * Дизайн-ревью 09.11.2026: заливка внутри острова читалась как «опущен остров».
 */
export function level2LowFillPath(calc: Pick<Level2Calc, "closed" | "contour" | "contourRadii" | "lowPolygon">, roomPts: Pt[]): { d: string; evenOdd: boolean } {
  if (calc.closed) {
    const room = polygonPath(roomPts);
    const hole = level2Path(calc.contour, calc.contourRadii, true);
    return { d: room && hole ? `${room} ${hole}` : "", evenOdd: true };
  }
  return { d: polygonPath(calc.lowPolygon), evenOdd: false };
}

// ============================================
// Расчёт
// ============================================

export type Level2Warning =
  | "shelf_too_wide"
  /** Кромка полки упирается сама в себя (короткий скос, узкое место) — верх посчитан по площади кромки, проверить. */
  | "shelf_tight"
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
  /** По точкам contour: true — настоящая вершина борта, false — точка дуги (для подписей и таблиц в цех). */
  contourCorners: boolean[];
  /** По рёбрам contour (ребро i → i+1): true — ребро лежит на стене, борта и полки там нет; рисовать не надо. */
  edgeOnWall: boolean[];
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
  const r = Math.max(0, params.radiusCm);
  // Полка — ниша под ленту: без подсветки её нет (дизайн-ревью 09.11.2026), верх идёт до борта.
  const w = params.led ? Math.max(0, params.shelfCm) : 0;
  const dense = densify(shape, params.lowSide ?? "left");
  const D = dense.pts;
  const onWall = keepWallRuns(D, sidesOnWallMask(D, room, ON_WALL_TOL_CM, true), dense.isCorner, true);
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
    const U = clipOffsetOvershoot(D, offsetEdgesInward(D, onWall.map((ow) => (ow ? 0 : w))), dense.isCorner);
    if (offsetIsValid(D, U, true, undefined, 2 * w)) {
      // Петля кромки (скос короче 2w, узкое место) — не «полка шире контура»: верх = |площадь|
      // кромки (петля вычитается сама), мягкое предупреждение (ревью 10.11.2026, трапеция 0,63).
      if (selfIntersects(U, true)) warnings.push("shelf_tight");
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
    contourCorners: dense.isCorner,
    edgeOnWall: onWall,
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
  const r = Math.max(0, params.radiusCm);
  // Полка — ниша под ленту: без подсветки её нет (дизайн-ревью 09.11.2026), верх идёт до борта.
  const w = params.led ? Math.max(0, params.shelfCm) : 0;
  const lowSide = params.lowSide ?? "left";
  const dense = densify(shape, lowSide);
  const line = dense.pts.map((p) => ({ ...p }));
  const n = line.length;
  const noWall = dense.pts.map(() => false);
  const empty = (): Level2Calc => {
    const len = pathLength(line, false);
    return {
      upperM2: 0, cutM2: 0, bortM: r2(len / 100), ledM: params.led ? r2(len / 100) : 0, shelfM2: 0, contourM: r2(len / 100), sidesOnWall: 0,
      contour: line, contourRadii: openLineRadii(line, r, dense.isCorner), contourCorners: dense.isCorner, edgeOnWall: dense.pts.map(() => false), upper: null, upperRadii: [], upperPolygon: null, lowPolygon: [], lowWalls: [],
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
    const U = clipOffsetOvershoot(upPoly, offsetEdgesInward(upPoly, lineEdges.map((isLine) => (isLine ? w : 0))), upPoly.map((_, i) => (i < n ? dense.isCorner[i] : true)));
    if (offsetIsValid(upPoly, U, true, lineEdges, 2 * w)) {
      if (selfIntersects(U.slice(0, n), false)) warnings.push("shelf_tight");
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
    contourCorners: dense.isCorner,
    edgeOnWall: line.map(() => false),
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
  items: { el: Level2ElementLike; contour: Pt[]; calc: Level2Calc }[];
  warnings: Level2Warning[];
};

/** Все борта «2 уровня» комнаты одной сводкой; остров внутри другого / перекрытие — предупреждение. */
export function calcRoomLevel2(elements: ReadonlyArray<Level2ElementLike> | null | undefined, room: Pt[] | null): RoomLevel2 | null {
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
