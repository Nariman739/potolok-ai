// Стартовая точка камеры в 3D (10.10.2026).
//
// Раньше камера вставала в угол ОПИСАННОГО прямоугольника комнаты. В Г- и
// Т-образных комнатах этот угол лежит снаружи контура — камера оказывалась в
// стене или в коридоре лицом к стене, потолка в первом кадре не было вовсе
// (аудит 10.10: «Коридор кухня», 3 из 5 реальных комнат с рекламы).
//
// Теперь: сетка точек-кандидатов внутри контура с отступом от стен, из них
// берётся та, откуда цель (светильники/мебель, иначе центр комнаты) видна
// без стен на пути и дальше всего — так в кадр попадает максимум комнаты.
// Взгляд поднят к потолку: полотно с софитами/профилем — это и есть продукт.

export interface Pt {
  x: number;
  z: number;
}

/** Точка внутри многоугольника (чётность пересечений луча). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.z > p.z !== b.z > p.z;
    if (!crosses) continue;
    const x = ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
    if (p.x < x) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** Расстояние до ближайшей стены. */
export function clearance(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distToSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (d < best) best = d;
  }
  return best;
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const o = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = o(q1, q2, p1);
  const d2 = o(q1, q2, p2);
  const d3 = o(p1, p2, q1);
  const d4 = o(p1, p2, q2);
  // Конец отрезка на самой стене (дверь, окно, профиль) — не пересечение:
  // раньше цель на стене считалась «за стеной», и дверь не получала ракурса.
  const EPS = 1e-6;
  if (Math.abs(d1) < EPS || Math.abs(d2) < EPS) return false;
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Отрезок между двумя точками не пересекает ни одну стену. */
export function visible(a: Pt, b: Pt, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (segmentsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return false;
  }
  return true;
}

export function polygonCentroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.z - q.x * p.z;
    a += f;
    cx += (p.x + q.x) * f;
    cz += (p.z + q.z) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, z: poly.reduce((s, p) => s + p.z, 0) / n };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export interface StartCamera {
  pos: [number, number, number];
  lookAt: [number, number, number];
}

/** Мебель как круг в плане: камера не встаёт внутри, высокая — заслоняет вид. */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  tall: boolean;
}

interface Opts {
  /** Контур комнаты в метрах (без замыкающей дублирующей точки — допустимо и с ней). */
  poly: Pt[];
  /** Куда смотреть в первую очередь (светильники, профиль, мебель) — XZ. */
  anchors: Pt[];
  eyeY: number;
  ceilingM: number;
  obstacles?: Obstacle[];
}

const STAND_CLEAR = 0.35; // отступ камеры от мебели

function segmentHitsCircle(a: Pt, b: Pt, c: Pt, r: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(c.x - (a.x + dx * t), c.z - (a.z + dz * t)) < r;
}

const MIN_CLEARANCE = 0.3; // 0,4 → 0,3 (10.10, Нариман: «чтобы больше влезало»)
const GRID = 14;

interface Ranked {
  poly: Pt[];
  target: Pt;
  ranked: Array<{ p: Pt; score: number }>;
  fallback: Pt;
}

function rankCandidates({ poly: rawPoly, anchors, obstacles = [] }: Pick<Opts, "poly" | "anchors" | "obstacles">): Ranked | null {
  const poly = rawPoly.length > 1 && rawPoly[0].x === rawPoly[rawPoly.length - 1].x && rawPoly[0].z === rawPoly[rawPoly.length - 1].z
    ? rawPoly.slice(0, -1)
    : rawPoly;
  if (poly.length < 3) return null;
  const centroid = polygonCentroid(poly);
  // Видимость с учётом высокой мебели (шкаф, кухня): луч не должен её задевать.
  // Саму цель препятствие не прячет (штора — цель ракурса «окно/гардина»).
  const sees = (a: Pt, b: Pt) =>
    visible(a, b, poly) && !obstacles.some((o) => o.tall && Math.hypot(o.x - b.x, o.z - b.z) > o.r && segmentHitsCircle(a, b, o, o.r));

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  // Кандидаты: сетка по описанному прямоугольнику, внутри контура, не ближе
  // MIN_CLEARANCE к стенам (в узком коридоре порог ослабляется до 0,25).
  const candidates: Array<{ p: Pt; c: number }> = [];
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const p = { x: minX + ((maxX - minX) * i) / GRID, z: minZ + ((maxZ - minZ) * j) / GRID };
      if (!pointInPolygon(p, poly)) continue;
      // Не стоять в мебели и вплотную к ней (dev-комната 10.10: камера за шкафом).
      if (obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + STAND_CLEAR)) continue;
      candidates.push({ p, c: clearance(p, poly) });
    }
  }
  if (candidates.length === 0) return { poly, target: centroid, ranked: [], fallback: centroid };
  const maxClear = Math.max(...candidates.map((c) => c.c));
  const clearNeed = Math.min(MIN_CLEARANCE, Math.max(0.25, maxClear * 0.8));
  const ok = candidates.filter((c) => c.c >= clearNeed);
  const pool = ok.length > 0 ? ok : candidates;
  const roomiest = pool.reduce((b, c) => (c.c > b.c ? c : b), pool[0]).p;

  // Цель: центр якорей, если он внутри контура; иначе ближайший к нему
  // кандидат; без якорей — центр комнаты (или самая «просторная» точка).
  let target: Pt | null = null;
  if (anchors.length > 0) {
    const ac = { x: anchors.reduce((s, a) => s + a.x, 0) / anchors.length, z: anchors.reduce((s, a) => s + a.z, 0) / anchors.length };
    if (pointInPolygon(ac, poly)) target = ac;
    else {
      let best = Infinity;
      for (const c of candidates) {
        const d = Math.hypot(c.p.x - ac.x, c.p.z - ac.z);
        if (d < best) { best = d; target = c.p; }
      }
    }
  }
  if (!target) target = pointInPolygon(centroid, poly) ? centroid : roomiest;
  const tgt = target;

  // Оценка: видит цель, дальше от неё, подальше от стен, видит больше якорей.
  const ranked: Array<{ p: Pt; score: number }> = [];
  for (const c of pool) {
    const d = Math.hypot(c.p.x - tgt.x, c.p.z - tgt.z);
    if (d < 0.8) continue;
    if (!sees(c.p, tgt)) continue;
    let seen = 0;
    for (const a of anchors) if (sees(c.p, a)) seen += 1;
    const seenFrac = anchors.length > 0 ? seen / anchors.length : 1;
    ranked.push({ p: c.p, score: d + Math.min(c.c, 1.0) * 1.2 + seenFrac * 2.0 });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { poly, target: tgt, ranked, fallback: roomiest };
}

function lookFrom(pos: Pt, tgt: Pt, eyeY: number, ceilingM: number): StartCamera {
  // Взгляд: на цель у потолка. Угол вверх ограничен 12–24°, чтобы в кадре
  // остались и стены с полом (контекст), и потолок (~половина экрана).
  const dist = Math.max(0.5, Math.hypot(tgt.x - pos.x, tgt.z - pos.z));
  // При угле обзора 96° (витрина) потолок и так занимает полкадра — взгляд
  // ровнее (6–16°), чтобы в маленьких комнатах был виден и пол, а не только углы.
  const wantY = ceilingM - 0.45;
  let pitch = Math.atan2(wantY - eyeY, dist);
  const minP = (6 * Math.PI) / 180;
  const maxP = (16 * Math.PI) / 180;
  pitch = Math.max(minP, Math.min(maxP, pitch));
  const lookY = eyeY + Math.tan(pitch) * dist;
  return { pos: [pos.x, eyeY, pos.z], lookAt: [tgt.x, lookY, tgt.z] };
}

/**
 * Подбирает стартовую позицию: внутри контура, с отступом от стен, с
 * видимостью цели и максимальной дистанцией до неё. Взгляд — на цель у
 * потолка, чтобы полотно занимало около половины кадра.
 */
export function pickStartCamera(opts: Opts): StartCamera {
  return pickViews(opts, 1)[0];
}

/**
 * Ракурсы по «фишкам» (Нариман с iPhone 10.10: «кадров не хватает, гардину,
 * дверь, окно не видно»): первая группа — общий вид (все якоря), дальше —
 * по группе на окно/гардину, дверь, линии/трек. Для каждой группы берётся
 * лучшая точка, с которой её видно и которая заметно отличается от уже
 * выбранных (направление ≥ 30° или ≥ 1,5 м). Пустые группы пропускаются.
 */
export function pickViewsByGroups(
  { poly, eyeY, ceilingM, obstacles }: Omit<Opts, "anchors">,
  groups: Pt[][],
  maxViews: number,
): StartCamera[] {
  const chosen: Array<{ p: Pt; yaw: number }> = [];
  const out: StartCamera[] = [];
  const MIN_YAW = (30 * Math.PI) / 180;
  const MIN_DIST = 1.5;
  for (const g of groups) {
    if (out.length >= maxViews) break;
    const r = rankCandidates({ poly, anchors: g, obstacles });
    if (!r) continue;
    const yawTo = (p: Pt) => Math.atan2(r.target.z - p.z, r.target.x - p.x);
    const distinct = (p: Pt) =>
      chosen.every((c) => {
        let d = Math.abs(c.yaw - yawTo(p));
        if (d > Math.PI) d = 2 * Math.PI - d;
        return d >= MIN_YAW || Math.hypot(c.p.x - p.x, c.p.z - p.z) >= MIN_DIST;
      });
    const pick = r.ranked.find((c) => distinct(c.p)) ?? (out.length === 0 ? r.ranked[0] : undefined);
    if (!pick) {
      if (out.length === 0) {
        out.push(lookFrom(r.fallback, r.target, eyeY, ceilingM));
        chosen.push({ p: r.fallback, yaw: yawTo(r.fallback) });
      }
      continue;
    }
    out.push(lookFrom(pick.p, r.target, eyeY, ceilingM));
    chosen.push({ p: pick.p, yaw: yawTo(pick.p) });
  }
  if (out.length === 0) return [{ pos: [0, eyeY, 2], lookAt: [0, ceilingM - 0.2, 0] }];
  return out;
}

/**
 * Несколько ракурсов (10.10.2026, Нариман: «не крутить, а показать с
 * нескольких ракурсов сразу»): лучшие точки по оценке, но заметно разные —
 * не ближе 1 м друг к другу и с разницей направления взгляда ≥ 50°.
 */
export function pickViews({ poly, anchors, eyeY, ceilingM, obstacles }: Opts, count: number): StartCamera[] {
  const r = rankCandidates({ poly, anchors, obstacles });
  if (!r) return [{ pos: [0, eyeY, 2], lookAt: [0, ceilingM - 0.2, 0] }];
  if (r.ranked.length === 0) return [lookFrom(r.fallback, r.target, eyeY, ceilingM)];
  const chosen: Pt[] = [];
  const MIN_DIST = 1.0;
  const MIN_YAW = (50 * Math.PI) / 180;
  const yawOf = (p: Pt) => Math.atan2(r.target.z - p.z, r.target.x - p.x);
  for (const c of r.ranked) {
    if (chosen.length >= count) break;
    const farEnough = chosen.every((q) => Math.hypot(q.x - c.p.x, q.z - c.p.z) >= MIN_DIST);
    const yawDiff = chosen.every((q) => {
      let d = Math.abs(yawOf(q) - yawOf(c.p));
      if (d > Math.PI) d = 2 * Math.PI - d;
      return d >= MIN_YAW;
    });
    if (farEnough && yawDiff) chosen.push(c.p);
  }
  if (chosen.length === 0) chosen.push(r.ranked[0].p);
  return chosen.map((p) => lookFrom(p, r.target, eyeY, ceilingM));
}
