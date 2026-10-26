import { getVertices } from "@/lib/room-geometry";
import type { RoomElement } from "@/lib/room-types";
import type { PlanRoom } from "@/lib/work-order-plan";

/**
 * «Уборка» софитов для плана в КП (Нариман 26.10.2026: «на замере софиты
 * просто тыкаю, не выравниваю — не всегда удобно»).
 *
 * За 60 дней из 383 комнат с ≥3 софитами ровно стояли 149, почти ровно 107,
 * хаотично 127. Клиенту важно «сколько и примерно где», а не точные
 * координаты, поэтому ДЛЯ КП (и только для него — чертёж монтажнику берёт
 * замер как есть):
 *  - почти ровные ряды подтягиваем в линию и уравниваем шаг;
 *  - если рядов не видно вообще — раскладываем те же N софитов ровной
 *    сеткой по комнате, как сделал бы дизайнер.
 * Данные замера не меняются: функция возвращает копию комнаты.
 *
 * Пара/тройка софитов (groupId) двигается как одно целое — её взаимное
 * расположение сохраняется.
 */

type Pt = { x: number; y: number };
type Unit = { members: RoomElement[]; cx: number; cy: number };

export function tidyPlanForClient(room: PlanRoom): PlanRoom {
  const els = Array.isArray(room.elements) ? (room.elements as RoomElement[]) : [];
  const units = spotUnits(els);
  if (units.length < 2) return room;

  const verts = verticesOf(room);
  if (!verts) return room;
  const xs = verts.map((p) => p.x), ys = verts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = Math.max(maxX - minX, 1), H = Math.max(maxY - minY, 1);
  // Допуск «почти ровно»: 5% комнаты, но не меньше 15 и не больше 40 см —
  // в большом зале 5% это 120 см, и в одну линию слипались разные ряды
  const tol = Math.min(40, Math.max(15, Math.max(W, H) * 0.05));

  // Замер в другой системе координат (софит за стенами) — не трогаем вообще
  if (units.some((u) => !inside({ x: u.cx, y: u.cy }, verts))) return room;

  const n = units.length;
  const gx = clusters(units.map((u) => u.cx), tol);
  const gy = clusters(units.map((u) => u.cy), tol);
  // Хаос — когда у заметной части софитов нет соседа ни по строке, ни по
  // колонке. Ряд вдоль стен с неровным шагом (подсветка по периметру) — это
  // линии, а не хаос: его только подравниваем.
  const lonely = units.filter((_, i) => gx.find((g) => g.includes(i))!.length === 1 && gy.find((g) => g.includes(i))!.length === 1).length;
  const chaos = n >= 3 && lonely >= Math.ceil(n * 0.4);

  let target: Pt[];
  if (!chaos) {
    target = snapToRows(units, gx, gy);
  } else {
    const grid = gridLayout(n, minX, minY, W, H, verts);
    // Сетка не вписалась (Г-образная комната, точка за стеной) — хотя бы подровнять
    target = grid ?? snapToRows(units, gx, gy);
  }

  // Страховки: после уборки все точки внутри стен и никакие два софита не
  // слиплись (ближе 40 см или ближе, чем были) — иначе оставляем как замерили
  if (target.some((p) => !inside(p, verts))) return room;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const was = Math.hypot(units[i].cx - units[j].cx, units[i].cy - units[j].cy);
      const now = Math.hypot(target[i].x - target[j].x, target[i].y - target[j].y);
      if (now < Math.min(40, was * 0.6)) return room;
    }
  }

  // Переносим: каждый юнит — на новый центр, члены со своими смещениями
  const moved = new Map<RoomElement, Pt>();
  units.forEach((u, i) => {
    const dx = target[i].x - u.cx, dy = target[i].y - u.cy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    for (const m of u.members) moved.set(m, { x: (m.x as number) + dx, y: (m.y as number) + dy });
  });
  if (moved.size === 0) return room;
  return {
    ...room,
    elements: els.map((e) => {
      const p = moved.get(e);
      return p ? { ...e, x: round1(p.x), y: round1(p.y) } : e;
    }),
  };
}

// ---------- helpers ----------

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function spotUnits(els: RoomElement[]): Unit[] {
  const byGroup = new Map<string, Unit>();
  const units: Unit[] = [];
  for (const e of els) {
    if (String(e.type) !== "spot" || typeof e.x !== "number" || typeof e.y !== "number") continue;
    if (e.groupId) {
      let u = byGroup.get(e.groupId);
      if (!u) {
        u = { members: [], cx: 0, cy: 0 };
        byGroup.set(e.groupId, u);
        units.push(u);
      }
      u.members.push(e);
    } else {
      units.push({ members: [e], cx: e.x, cy: e.y });
    }
  }
  for (const u of units) {
    if (u.members.length > 1) {
      u.cx = u.members.reduce((s, m) => s + (m.x as number), 0) / u.members.length;
      u.cy = u.members.reduce((s, m) => s + (m.y as number), 0) / u.members.length;
    }
  }
  return units;
}

function verticesOf(room: PlanRoom): Pt[] | null {
  const walls = room.walls;
  if (!Array.isArray(walls) || walls.length < 3) return null;
  const nc = Array.isArray(room.normalCorners) && room.normalCorners.length === walls.length ? room.normalCorners : walls.map(() => true);
  const ang = Array.isArray(room.angles) && room.angles.length === walls.length ? room.angles : undefined;
  try {
    return getVertices(walls, nc, ang).slice(0, walls.length);
  } catch {
    return null;
  }
}

/** Группы близких значений (индексы юнитов), отсортированные по значению. */
function clusters(vals: number[], tol: number): number[][] {
  const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
  const groups: number[][] = [];
  for (const i of order) {
    const g = groups[groups.length - 1];
    if (g && vals[i] - vals[g[g.length - 1]] <= tol) g.push(i);
    else groups.push([i]);
  }
  return groups;
}

/** Подтянуть юниты к средним своих рядов/колонок и уравнять шаг в ряду. */
function snapToRows(units: Unit[], gx: number[][], gy: number[][]): Pt[] {
  const out: Pt[] = units.map((u) => ({ x: u.cx, y: u.cy }));
  for (const g of gx) {
    const mean = g.reduce((s, i) => s + units[i].cx, 0) / g.length;
    for (const i of g) out[i].x = mean;
  }
  for (const g of gy) {
    const mean = g.reduce((s, i) => s + units[i].cy, 0) / g.length;
    for (const i of g) out[i].y = mean;
  }
  // Равный шаг: в ряду (одна y-группа) по x, в колонке (одна x-группа) по y —
  // только если шаг уже почти равный (разброс до 35%), иначе так и задумано
  for (const g of gy) equalize(g, out, "x");
  for (const g of gx) equalize(g, out, "y");
  return out;
}

function equalize(group: number[], pts: Pt[], axis: "x" | "y") {
  if (group.length < 3) return;
  const sorted = [...group].sort((a, b) => pts[a][axis] - pts[b][axis]);
  const gaps: number[] = [];
  for (let k = 1; k < sorted.length; k++) gaps.push(pts[sorted[k]][axis] - pts[sorted[k - 1]][axis]);
  const mn = Math.min(...gaps), mx = Math.max(...gaps);
  if (mn <= 0 || mx / mn > 1.35) return;
  const first = pts[sorted[0]][axis], last = pts[sorted[sorted.length - 1]][axis];
  const step = (last - first) / (sorted.length - 1);
  sorted.forEach((i, k) => {
    pts[i][axis] = first + step * k;
  });
}

/** Ровная сетка N точек по габариту комнаты; null, если точка выходит за стены. */
function gridLayout(n: number, minX: number, minY: number, W: number, H: number, poly: Pt[]): Pt[] | null {
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * W) / H))));
  const rows = Math.ceil(n / cols);
  const pts: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    const shift = (cols - inRow) / 2; // неполный последний ряд — по центру
    for (let c = 0; c < inRow; c++) {
      pts.push({ x: minX + (W * (c + shift + 0.5)) / cols, y: minY + (H * (r + 0.5)) / rows });
    }
  }
  return pts.every((p) => inside(p, poly)) ? pts : null;
}

function inside(p: Pt, poly: Pt[]): boolean {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ok = !ok;
  }
  return ok;
}
