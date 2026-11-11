// Двухуровневый потолок — геометрия для 3D (09.11.2026).
//
// Данные элемента type="level2" (борт как ломаная в см, bulges, closed/lowSide,
// shelfCm/dropCm/led/radiusCm) считает общий модуль src/lib/shared/level2-geometry
// (тот же, что КП и чертёж): он даёт плотный контур борта (дуги — ломаная ≤ 5 см),
// кромку верхнего полотна (контур, сдвинутый на полку в сторону верха), полигоны
// верха и низа и признак «ребро лежит на стене». Здесь это переводится в метры
// сцены (минус centerOffset) и в формы three.js:
//   • lowerShape  — нижний уровень (y = H − drop): у острова — комната с дырой по
//                   борту, у линии — область со стороны lowSide;
//   • upperShape  — верхнее полотно (y = H): у острова — кромка внутри борта, у
//                   линии — полигон верха вместе с участком стен;
//   • bort        — вертикальная ступенька по борту (рёбра на стене пропущены);
//   • shelf       — при LED полка между бортом и кромкой верха на y = H − lift,
//                   с лентой по внешнему краю; без LED полки нет (effectiveShelf 0);
//   • ledSegs     — отрезки ленты (для карты засвета полотна).
// Скругления углов (radiusCm) — фаска-дуга между соседними рёбрами (как на чертеже).

import * as THREE from "three";
import { calcLevel2Shape, filletPolygon, level2Params, level2Shape, pointInPolygon, type Level2ElementLike, type Pt } from "../../lib/shared/level2-geometry";
import type { Vertex2D } from "./types";

export interface Level2Build {
  led: boolean;
  dropM: number;
  shelfM: number;
  /** Нижний уровень: полигон(ы) в метрах сцены (XZ). У острова — комната + дыра. */
  lowerShape: THREE.Shape;
  /** Верхнее полотно, м. */
  upperShape: THREE.Shape;
  /** Полка между бортом и кромкой верха (только при LED). */
  shelfShape: THREE.Shape | null;
  /** Борт — вертикальная лента по контуру: пары точек (м) для рёбер, лежащих не на стене. */
  bortRuns: Array<Array<[number, number]>>;
  /** Кромка верхнего полотна (где лежит лента), м — плотная ломаная. */
  upperEdge: Array<[number, number]>;
  upperClosed: boolean;
  /** Полигон верха, м (для «точка внутри» — софиты и засвет). */
  upperPolygon: Array<[number, number]>;
  /** Полигон низа, м (у острова — вся комната без контура: проверять как «не внутри контура»). */
  lowPolygon: Array<[number, number]>;
  lowIsOutsideOf: boolean;
}

type P = [number, number];

/** Нулевые рёбра (совпадающие точки подряд, ≤ 1e-3 см = 1e-5 м) выкидываем до построения
 *  нормалей и митеров: иначе у вершины нулевая нормаль — тёмная точка/вспышка на ленте и
 *  схлопнутая LED-полоса (shared 5bc4fff даёт такие точки в calc.upper у конца дуги волны). */
const MIN_EDGE_M = 1e-5;
export function dedupePolyline(pts: P[], closed: boolean): P[] {
  const out: P[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < MIN_EDGE_M) continue;
    out.push(p);
  }
  if (closed) {
    while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < MIN_EDGE_M) out.pop();
  }
  return out;
}

function toShape(poly: P[], holes: P[][] = []): THREE.Shape {
  const s = new THREE.Shape();
  if (poly.length === 0) return s;
  s.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) s.lineTo(poly[i][0], poly[i][1]);
  s.closePath();
  for (const h of holes) {
    if (h.length < 3) continue;
    const p = new THREE.Path();
    p.moveTo(h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1]);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

/** Вершины комнаты (см, с замыкающим дублем или без) → полигон в метрах сцены. */
function roomToM(vertices: Vertex2D[], cx: number, cz: number): P[] {
  const v = vertices.slice();
  if (v.length > 1 && v[0].x === v[v.length - 1].x && v[0].y === v[v.length - 1].y) v.pop();
  return v.map((p) => [p.x / 100 - cx, p.y / 100 - cz] as P);
}

export function buildLevel2(el: Level2ElementLike, vertices: Vertex2D[], centerOffset: { x: number; z: number }, ceilingM: number): Level2Build | null {
  const shape = level2Shape(el);
  if (!shape) return null;
  const roomCm: Pt[] = vertices.map((p) => ({ x: p.x, y: p.y }));
  if (roomCm.length > 1 && roomCm[0].x === roomCm[roomCm.length - 1].x && roomCm[0].y === roomCm[roomCm.length - 1].y) roomCm.pop();
  const params = level2Params(el);
  const calc = calcLevel2Shape(shape, roomCm, params);
  if (!calc.upper || !calc.upperPolygon || calc.contour.length < 2) return null;
  const toM = (p: Pt): P => [p.x / 100 - centerOffset.x, p.y / 100 - centerOffset.z];
  const closed = calc.closed;
  const led = params.led !== false;
  const dropM = Math.max(0.03, params.dropCm / 100);
  const shelfM = led ? params.shelfCm / 100 : 0;

  // Борт: плотный контур со скруглениями (радиусы — в см по точкам contour).
  // Скругление — общим filletPolygon (тот же контур, что КП и чертёж; ревью геометрии 09.11:
  // свой filletPolyline резал касательную до половины соседнего ребра — на вогнутой дуге −40 с R20
  // борт выходил на 47 см длиннее КП, на «шипе» на 140 см). Скругляем в см, затем в метры сцены;
  // нулевые рёбра — после (у вершин дуги их даёт и сам контур).
  const contourM = dedupePolyline(filletPolygon(calc.contour, calc.contourRadii, closed).map(toM), closed);
  const upperEdgeM = dedupePolyline(filletPolygon(calc.upper, calc.upperRadii, closed).map(toM), closed);
  const room = roomToM(vertices, centerOffset.x, centerOffset.z);

  // Рёбра борта не на стене → отрезки (по исходному контуру, скругления внутри ребра).
  const bortRuns: P[][] = [];
  {
    // edgeOnWall — по рёбрам исходного contour; после скругления сопоставляем по
    // ближайшей исходной вершине: ребро на стене прямое, его точки совпадают.
    const src = calc.contour.map(toM);
    const nSrc = src.length;
    const edgeCount = closed ? nSrc : nSrc - 1;
    let run: P[] = [];
    const onWallAt = (p: P): boolean => {
      for (let e = 0; e < edgeCount; e++) {
        if (!calc.edgeOnWall[e]) continue;
        const a = src[e], b = src[(e + 1) % nSrc];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1;
        let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
        t = Math.max(0, Math.min(1, t));
        const qx = a[0] + dx * t - p[0], qz = a[1] + dz * t - p[1];
        if (Math.hypot(qx, qz) < 0.02) return true;
      }
      return false;
    };
    const pts = closed ? [...contourM, contourM[0]] : contourM;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (onWallAt(mid)) { if (run.length > 1) bortRuns.push(run); run = []; continue; }
      if (run.length === 0) run.push(a);
      run.push(b);
    }
    if (run.length > 1) bortRuns.push(run);
  }

  let lowerShape: THREE.Shape;
  let upperShape: THREE.Shape;
  let shelfShape: THREE.Shape | null = null;
  let upperPolygon: P[];
  let lowPolygon: P[];
  if (closed) {
    // Остров: низ — комната с дырой по борту; верх — внутри кромки; полка — кольцо.
    lowerShape = toShape(room, [contourM]);
    upperShape = toShape(upperEdgeM);
    if (led && shelfM > 0) shelfShape = toShape(contourM, [upperEdgeM]);
    upperPolygon = upperEdgeM;
    lowPolygon = contourM;
  } else {
    // Линия: полигоны верха и низа из расчёта (с участками стен); скругления
    // только на кромке борта — заменяем в полигонах исходные отрезки борта.
    const upperPoly = calc.upperPolygon.map(toM);
    const lowPoly = calc.lowPolygon.map(toM);
    lowerShape = toShape(replaceRun(lowPoly, calc.contour.map(toM), contourM));
    upperShape = toShape(replaceRun(upperPoly, calc.upper.map(toM), upperEdgeM));
    if (led && shelfM > 0) shelfShape = toShape([...contourM, ...upperEdgeM.slice().reverse()]);
    upperPolygon = upperPoly;
    lowPolygon = lowPoly;
  }
  return {
    led, dropM, shelfM, lowerShape, upperShape, shelfShape, bortRuns,
    upperEdge: upperEdgeM, upperClosed: closed, upperPolygon, lowPolygon, lowIsOutsideOf: closed,
  };
}

/** В полигоне poly найти подпоследовательность, совпадающую с run (по точкам), и заменить её на dense. */
function replaceRun(poly: P[], run: P[], dense: P[]): P[] {
  if (run.length < 2) return poly;
  const same = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.005;
  const n = poly.length;
  for (let s = 0; s < n; s++) {
    let ok = true;
    for (let k = 0; k < run.length; k++) if (!same(poly[(s + k) % n], run[k])) { ok = false; break; }
    if (ok) {
      const out: P[] = [];
      for (let k = 0; k < n - run.length; k++) out.push(poly[(s + run.length + k) % n]);
      return [...out, ...dense];
    }
    ok = true;
    for (let k = 0; k < run.length; k++) if (!same(poly[(s + k) % n], run[run.length - 1 - k])) { ok = false; break; }
    if (ok) {
      const out: P[] = [];
      for (let k = 0; k < n - run.length; k++) out.push(poly[(s + run.length + k) % n]);
      return [...out, ...dense.slice().reverse()];
    }
  }
  return poly;
}

/** Высота полотна над точкой (м): нижний уровень или верх. */
export function level2CeilingAt(b: Level2Build, x: number, z: number, ceilingM: number): number {
  const p = { x, y: z };
  const toPt = (poly: P[]): Pt[] => poly.map((q) => ({ x: q[0], y: q[1] }));
  if (b.lowIsOutsideOf) return pointInPolygon(p, toPt(b.lowPolygon)) ? ceilingM : ceilingM - b.dropM;
  return pointInPolygon(p, toPt(b.lowPolygon)) ? ceilingM - b.dropM : ceilingM;
}

export interface LevelSeg { ax: number; az: number; bx: number; bz: number; y: number }

/**
 * Отрезок на полотне (м, XZ сцены) → части по уровням двухуровневого потолка, каждая со
 * своей высотой полотна. Световая линия / трек лежат В полотне: в комнате с «2 уровня»
 * они должны идти по той плоскости, над которой нарисованы (ERSO, 10.11.2026: линии вокруг
 * острова рисовались на y = H и прятались за нижним уровнем H − drop — в 3D «только софиты»).
 * Граница уровней ищется выборкой с шагом 2 см и бисекцией до 1 мм; без «2 уровня» — один
 * отрезок на ceilingM.
 */
export function splitSegmentByLevel(b: Level2Build | null, ax: number, az: number, bx: number, bz: number, ceilingM: number): LevelSeg[] {
  if (!b) return [{ ax, az, bx, bz, y: ceilingM }];
  const len = Math.hypot(bx - ax, bz - az);
  const at = (t: number): [number, number] => [ax + (bx - ax) * t, az + (bz - az) * t];
  const yAt = (t: number): number => { const [x, z] = at(t); return level2CeilingAt(b, x, z, ceilingM); };
  const n = Math.max(1, Math.ceil(len / 0.02));
  const out: LevelSeg[] = [];
  let t0 = 0;
  let y0 = yAt(0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const y = yAt(t);
    if (Math.abs(y - y0) < 1e-6) continue;
    // Переход уровня между (i−1)/n и t — уточняем бисекцией.
    let lo = (i - 1) / n, hi = t;
    for (let k = 0; k < 12 && (hi - lo) * len > 0.001; k++) {
      const mid = (lo + hi) / 2;
      if (Math.abs(yAt(mid) - y0) < 1e-6) lo = mid; else hi = mid;
    }
    const [cx, cz] = at(hi);
    const [sx, sz] = at(t0);
    out.push({ ax: sx, az: sz, bx: cx, bz: cz, y: y0 });
    t0 = hi;
    y0 = y;
  }
  const [sx, sz] = at(t0);
  out.push({ ax: sx, az: sz, bx, bz, y: y0 });
  return out;
}

/** Вертикальная лента по ломаной от y0 до y1 (DoubleSide в материале): общие вершины между
 *  сегментами и усреднённые нормали — дуга борта не ловит свет полосами по граням
 *  (замечание координатора по паре 22, 09.11). У замкнутого прогона первая и последняя
 *  точки совпадают — нормали на стыке усредняются через край. */
export function ribbonGeometry(runs: P[][], y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const rawRun of runs) {
    // Замкнутый прогон (первая = последняя точка) сохраняет замыкающую точку после чистки.
    const wasClosed = rawRun.length > 2 && Math.hypot(rawRun[0][0] - rawRun[rawRun.length - 1][0], rawRun[0][1] - rawRun[rawRun.length - 1][1]) < MIN_EDGE_M;
    const run = dedupePolyline(wasClosed ? rawRun.slice(0, -1) : rawRun, wasClosed);
    if (wasClosed && run.length > 2) run.push(run[0]);
    const n = run.length;
    if (n < 2) continue;
    const closedRun = Math.hypot(run[0][0] - run[n - 1][0], run[0][1] - run[n - 1][1]) < 1e-6;
    // Нормаль сегмента i (в плоскости XZ, налево от хода).
    const segN: Array<[number, number]> = [];
    for (let i = 0; i + 1 < n; i++) {
      const dx = run[i + 1][0] - run[i][0], dz = run[i + 1][1] - run[i][1];
      const l = Math.hypot(dx, dz) || 1;
      segN.push([-dz / l, dx / l]);
    }
    let u = 0;
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? segN[i - 1] : closedRun ? segN[n - 2] : segN[0];
      const next = i < n - 1 ? segN[i] : closedRun ? segN[0] : segN[n - 2];
      let nx = prev[0] + next[0], nz = prev[1] + next[1];
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      if (i > 0) u += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
      pos.push(run[i][0], y0, run[i][1], run[i][0], y1, run[i][1]);
      nrm.push(nx, 0, nz, nx, 0, nz);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i + 1 < n; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, d, a, d, b);
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Горизонтальная полоса шириной w вдоль ломаной (сдвиг в сторону side: +1 — налево от хода).
 *  Внешний край — по усреднённой нормали в вершине (митер): полоса непрерывная, без «зубцов»
 *  от перекрытия соседних четырёхугольников на дуге (пара 22, 09.11). */
export function stripGeometry(line: P[], closed: boolean, w: number, side: 1 | -1, y: number): THREE.BufferGeometry {
  const clean = dedupePolyline(line, closed);
  const pts = closed ? [...clean, clean[0]] : clean;
  const n = pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  if (n < 2) return new THREE.BufferGeometry();
  const segN: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dz) || 1;
    segN.push([(-dz / l) * side, (dx / l) * side]);
  }
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? segN[i - 1] : closed ? segN[n - 2] : segN[0];
    const next = i < n - 1 ? segN[i] : closed ? segN[0] : segN[n - 2];
    let nx = prev[0] + next[0], nz = prev[1] + next[1];
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    // Митер: ширина по биссектрисе = w / cos(θ/2), ограничим ×2 на острых углах.
    const cosHalf = Math.max(0.5, nx * next[0] + nz * next[1]);
    const m = w / cosHalf;
    pos.push(pts[i][0], y, pts[i][1], pts[i][0] + nx * m, y, pts[i][1] + nz * m);
    uv.push(0, i / (n - 1), 1, i / (n - 1));
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
