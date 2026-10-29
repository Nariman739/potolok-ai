/**
 * План комнаты для наряда монтажнику (16.10.2026).
 *
 * Просьба мастера: технолог на замере расставил свет и гардины — монтажник
 * должен видеть на чертеже, ГДЕ что стоит, и сам пересчитать софиты, трек,
 * гардины по объекту. Раньше наряд рисовал только контур с длинами стен, а
 * свет перечислял текстом.
 *
 * Координаты элементов — те же сантиметры, что и вершины комнаты (дизайнер в
 * приложении строит вершины от (0,0) по walls + angles — как getVertices здесь),
 * поэтому точки переносятся один в один. Формулы для элементов на стене
 * (отступ, длина, позиция) повторяют app/room-designer.tsx мобилки.
 *
 * План строится как список фигур (`buildRoomPlan`), а рисуется двумя
 * рендерерами: `RoomPlanSvg` — HTML для страницы /n/[token], и work-order-pdf —
 * те же фигуры примитивами @react-pdf для PDF монтажнику.
 */
import React from "react";
import { getVertices, roomOutlinePath, roomPolygonDense } from "@/lib/room-geometry";
import type { RoomElement } from "@/lib/room-types";
import type { Lang } from "@/lib/i18n";
import { tFor } from "@/lib/i18n";

export type PlanRoom = {
  walls: number[];
  angles?: number[] | null;
  normalCorners?: boolean[] | null;
  bulges?: number[] | null;
  cornerRadii?: number[] | null;
  elements?: unknown;
  wallProfiles?: unknown;
  /** Имена своих профилей из прайса по id (wallProfiles хранит id PriceItem) — иначе на чертеже «Профиль свой» (29.10.2026). */
  profileNames?: Record<string, string>;
  /** Вставка в комнате (30.10.2026): true/false — решено; null/undefined — вывести из старых типов стен, иначе да. */
  withInsert?: boolean | null;
  /** Свои профили из прайса, на которые ставится вставка (id → true). */
  profileInsert?: Record<string, boolean>;
};

/** Стены, на которые ставится вставка (пластиковый/алюминиевый багет, евробрус). */
export const INSERT_PROFILE_TYPES = new Set(["pvc", "aluminum", "eurobrus"]);

/**
 * Старые замеры (до 30.10.2026) хранили «со вставкой / без» в типе стены:
 * pvc_insert/galtel/aluminum_insert — со вставкой, pvc/no_insert — без.
 * Возвращает решение комнаты, если такие метки есть; null — меток нет (новые данные).
 * Без вставки — только когда ВСЕ пластиковые стены помечены «без»: смешанную
 * комнату (часть стен явно «без», остальные по умолчанию) считаем со вставкой.
 */
export function legacyInsertFlag(wallProfiles: unknown): boolean | null {
  const raw = wallProfiles && typeof wallProfiles === "object" ? Object.values(wallProfiles as Record<string, unknown>) : [];
  let sawInsert = false, sawNoInsert = false;
  for (const v of raw) {
    if (v === "pvc_insert" || v === "galtel" || v === "aluminum_insert") sawInsert = true;
    else if (v === "pvc" || v === "no_insert") sawNoInsert = true;
  }
  if (sawInsert) return true;
  if (sawNoInsert) return false;
  return null;
}

export type Pt = { x: number; y: number };

/** Подпись типа стены: каталожный → словарь, свой из прайса → его имя, иначе «свой». */
function profileLabel(p: string, t: (k: string) => string, names?: Record<string, string>): string {
  if (PROFILE_TYPES.includes(p)) return `${t("wo.profile")} ${t(`wo.prof.${p}`)}`;
  const name = names?.[p];
  if (!name) return `${t("wo.profile")} ${t("wo.prof.custom")}`;
  // «Профиль на керамогранит» — не дублировать слово «Профиль»
  return /^профил/i.test(name) ? name : `${t("wo.profile")} ${name}`;
}

/**
 * `tag` — что это за фигура (wall, profile, spot, chandelier, curtain, track,
 * dim-wall, …): карандашный рендер КП перерисовывает фигуры по смыслу
 * (волнистая гардина, кружок с лучиками у люстры), а не по геометрии.
 */
export type Shape = (
  | { k: "path"; d: string; fill: string; stroke: string; sw: number }
  | { k: "polygon"; points: Pt[]; fill: string; stroke: string; sw: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: string; round?: boolean }
  | { k: "polyline"; points: Pt[]; stroke: string; sw: number; dash?: string }
  | { k: "circle"; cx: number; cy: number; r: number; fill: string; stroke: string; sw: number }
  | { k: "text"; x: number; y: number; text: string; size: number; weight: 400 | 600 | 700; fill: string; halo: boolean; haloColor?: string }
) & { tag?: string };

/**
 * Легенда: `kind` — форма значка; в карандашном стиле типы различаются не
 * цветом, а рисунком линии: `dash` — пунктир, `double` — двойная линия.
 */
export type Legend = {
  key: string;
  color: string;
  kind: "dot" | "ring" | "pair" | "vent" | "chand" | "line" | "dash";
  dash?: string;
  double?: boolean;
  mul?: number;
};

export type RoomPlan = {
  size: number;
  shapes: Shape[];
  legend: Legend[];
  /** Перевод см → единицы плана: x·scale + ox. Нужен, чтобы продолжить клетку за пределы плана. */
  frame: { ox: number; oy: number; scale: number };
  /**
   * Габариты комнаты с элементами в единицах плана, с полем под подписи.
   * Квадрат `size` для вытянутой комнаты наполовину пустой — КП обрезает
   * по этому прямоугольнику, чтобы подпись комнаты стояла сразу под планом.
   */
  bbox: { x: number; y: number; w: number; h: number };
};

export type PlanOptions = {
  /**
   * Размерные цепочки для монтажника (23.10.2026, Нариман: «чертёж для
   * монтажника — где софиты и на каком расстоянии»): ряды светильников —
   * от стены до первого, шаг между соседними, до стены; отступ ряда от стены
   * или от соседнего ряда; одиночные — до двух ближайших стен. Все размеры в
   * см до ЦЕНТРА светильника, у пары — до центра пары.
   */
  dims?: boolean;
  /**
   * «Тетрадь в клеточку, карандашом» (Нариман 23.10.2026): бумага, клетка
   * 10/50 см, всё одним графитом; типы элементов — рисунком линии (двойная,
   * пунктир, штрих-пунктир, точки), а не цветом. Для страницы чертежа в PDF.
   */
  pencil?: boolean;
  /** Рисовать клетку внутри плана (по умолчанию да в карандашном стиле). */
  grid?: boolean;
  /**
   * План для КЛИЕНТА (26.10.2026): всё в фирменном цвете мастера, без букв
   * углов, без длин элементов, без легенды профилей — не чертёж, а картинка
   * «вот ваша комната, вот где свет». Длины стен — только если `labels`.
   */
  client?: { accent: string; ink: string; fill: string; paper: string };
  /** Подписи длин стен для клиента: в метрах («4,84»). Без поля — без подписей. */
  labels?: "walls-m";
  /**
   * Множитель толщин линий, кружков и подписей. План в КП рисуется в 84pt —
   * при пропорциональном уменьшении софиты становились точками, а цифры
   * нечитаемыми; на мелком плане линии нужны относительно толще.
   */
  boost?: number;
};

type Palette = Record<keyof typeof COLORS, string>;
const PAPER = "#fbfaf3";
const INK = "#2f2f35";
const GRID = "#dde5ee";
const GRID_MAJOR = "#c3d0de";
const PENCIL_COLORS: Palette = {
  spot: INK, pendant: INK, chandelier: INK, vent: INK, track: INK, lightline: INK, curtain: INK,
  subcurtain: INK, floating: INK, wall: INK, roomFill: "none", label: INK,
};
/** Рисунок линий элементов в карандашном стиле (паттерны в единицах u). */
const LINE_PENCIL: Record<string, { dash?: string; double?: boolean; mul?: number }> = {
  track: { double: true },
  lightline: { dash: "7 3 1.5 3" },
  curtain: { dash: "9 4" },
  subcurtain: { dash: "1.5 3", mul: 1.5 },
};
/** Профили стен карандашом: толщина и рисунок вместо цвета. */
const PROFILE_PENCIL: Record<string, { dash?: string; double?: boolean; mul: number }> = {
  pvc: { mul: 1 },
  aluminum: { mul: 1.4 },
  shadow: { mul: 2.4 },
  gapless: { mul: 2.4 },
  floating: { double: true, mul: 2.4 },
  subcurtain: { dash: "1.5 3", mul: 1.8 },
  subcurtain_light: { dash: "1.5 3", mul: 1.8 },
  ldsp: { dash: "7 3 1.5 3", mul: 1.6 },
  eurobrus: { dash: "7 3 1.5 3", mul: 1.6 },
};
const scaleDash = (d: string, u: number) => d.split(" ").map((n) => (Number(n) * u).toFixed(2)).join(" ");

const DIM = "#64748b";
const DIM_TEXT = "#1e293b";
/** Светильники в одном ряду, если их центры расходятся не больше чем на столько см. */
const ROW_TOL_CM = 3;

const COLORS = {
  spot: "#F59E0B",
  pendant: "#3B82F6",
  chandelier: "#8B5CF6",
  vent: "#475569",
  track: "#EF4444",
  lightline: "#CA8A04",
  curtain: "#10B981",
  subcurtain: "#0F172A",
  floating: "#F97316",
  wall: "#1e3a5f",
  roomFill: "#eff6ff",
  label: "#334155",
} as const;

/** Профили стен: цвет и пунктир как в дизайнере (src/lib/wall-profiles.ts мобилки). */
// «Со вставкой / без» — больше не тип стены (30.10.2026), вставка — строка в «что ставить».
const PROFILE_STYLE: Record<string, { color: string; dashed: boolean; mul: number }> = {
  pvc: { color: "#64748b", dashed: false, mul: 1 },
  aluminum: { color: "#94a3b8", dashed: false, mul: 1.2 },
  shadow: { color: "#1a1a1a", dashed: false, mul: 1.8 },
  gapless: { color: "#0f766e", dashed: false, mul: 1.8 },
  floating: { color: "#F97316", dashed: false, mul: 1.8 },
  subcurtain: { color: "#0F172A", dashed: false, mul: 1.5 },
  subcurtain_light: { color: "#0F172A", dashed: false, mul: 1.5 },
  ldsp: { color: "#A16207", dashed: false, mul: 1.4 },
  eurobrus: { color: "#78350F", dashed: false, mul: 1.4 },
};
const PROFILE_TYPES = Object.keys(PROFILE_STYLE);

export function normalizeProfile(p: unknown): string {
  // Дефолт — пластиковый багет; старые «со вставкой / без» сводятся к типу багета,
  // вставка решается флагом комнаты (legacyInsertFlag / PlanRoom.withInsert).
  if (p === undefined || p === null || p === "" || p === "galtel" || p === "pvc_insert" || p === "no_insert") return "pvc";
  if (p === "aluminum_insert") return "aluminum";
  return String(p);
}

/** Буква угла: A, B, … Z, AA, AB — как на чертеже в цех. */
export function cornerLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function elementsOf(room: PlanRoom): RoomElement[] {
  return Array.isArray(room.elements) ? (room.elements as RoomElement[]) : [];
}

function profilesOf(room: PlanRoom): Record<number, string> {
  const raw = room.wallProfiles && typeof room.wallProfiles === "object" ? (room.wallProfiles as Record<string, unknown>) : {};
  const out: Record<number, string> = {};
  room.walls.forEach((_, i) => {
    out[i] = normalizeProfile(raw[String(i)]);
  });
  // Парящий профиль с чертежа (элемент floating с wallIndex) — тот же тип стены.
  for (const e of elementsOf(room)) {
    if (e.type === "floating" && typeof e.wallIndex === "number") out[e.wallIndex] = "floating";
  }
  return out;
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

/** Точки ломаной свободного элемента с учётом поворота вокруг центра (как в дизайнере). */
function freeformPoints(el: RoomElement): Pt[] {
  const raw = el.points ?? [];
  if (raw.length < 2) return raw;
  const rot = el.rotation || 0;
  if (!rot) return raw;
  const cx = raw.reduce((s, p) => s + p.x, 0) / raw.length;
  const cy = raw.reduce((s, p) => s + p.y, 0) / raw.length;
  const rad = (rot * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  return raw.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

function polyLen(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/** Длина элемента в см: своя, иначе по точкам. */
function elementLength(el: RoomElement): number {
  if (typeof el.length === "number" && el.length > 0) return el.length;
  if (el.shape === "freeform" && el.points) return polyLen(freeformPoints(el));
  return 0;
}

const CURTAIN_TYPES = new Set(["curtain", "builtin_gardina", "shower_curtain"]);
const LINE_TYPES = new Set(["track", "lightline", "curtain", "subcurtain", "builtin_gardina", "shower_curtain"]);

function lineColor(type: string, C: Palette = COLORS): string {
  if (type === "track") return C.track;
  if (type === "lightline") return C.lightline;
  if (type === "subcurtain") return C.subcurtain;
  return C.curtain;
}

function legendKey(type: string): string {
  return type === "subcurtain" ? "subcurtain" : CURTAIN_TYPES.has(type) ? "curtain" : type;
}

// ============================================
// Сводка по комнате и объекту
// ============================================

export type RoomSummary = {
  spots: number;
  /** Сколько из софитов — двойные (пары с общим groupId). В spots они уже посчитаны по 2. */
  spotPairs: number;
  pendants: number;
  chandeliers: number;
  vents: number;
  trackCm: number;
  trackCount: number;
  lightlineCm: number;
  lightlineCount: number;
  curtainCount: number;
  curtainCm: number;
  subcurtainCount: number;
  subcurtainCm: number;
  /** Метры профиля по типу стены, см. */
  profileCm: Record<string, number>;
  /** Стены по типу профиля — буквами, например «AB, CD». */
  profileWalls: Record<string, string[]>;
  /** Имена своих профилей по id — для подписи в «Итого по объекту». */
  profileNames: Record<string, string>;
  /** Вставка, см — по стенам с пластиком/алюминием/евробрусом (и своими багетами «со вставкой»), если в комнате она не снята. */
  insertCm: number;
};

function emptySummary(): RoomSummary {
  return {
    spots: 0, spotPairs: 0, pendants: 0, chandeliers: 0, vents: 0, trackCm: 0, trackCount: 0, lightlineCm: 0, lightlineCount: 0,
    curtainCount: 0, curtainCm: 0, subcurtainCount: 0, subcurtainCm: 0, profileCm: {}, profileWalls: {}, profileNames: {}, insertCm: 0,
  };
}

/** Точечный светильник или пара софитов (общий groupId) — одна «единица» с центром. */
type PointUnit = { key: string; type: string; members: RoomElement[]; cx: number; cy: number };

function pointUnits(els: RoomElement[]): PointUnit[] {
  const byGroup = new Map<string, PointUnit>();
  const units: PointUnit[] = [];
  for (const e of els) {
    const type = String(e.type);
    if (typeof e.x !== "number" || typeof e.y !== "number") continue;
    if (type !== "spot" && type !== "pendant" && type !== "chandelier" && type !== "vent") continue;
    if (type === "spot" && e.groupId) {
      let u = byGroup.get(e.groupId);
      if (!u) { u = { key: e.groupId, type, members: [], cx: 0, cy: 0 }; byGroup.set(e.groupId, u); units.push(u); }
      u.members.push(e);
    } else {
      units.push({ key: e.id, type, members: [e], cx: e.x, cy: e.y });
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

export function summarizeRoom(room: PlanRoom): RoomSummary {
  const els = elementsOf(room);
  const s = emptySummary();
  s.spotPairs = pointUnits(els).filter((u) => u.type === "spot" && u.members.length === 2).length;
  for (const e of els) {
    const t = String(e.type);
    if (t === "spot") s.spots++;
    else if (t === "pendant") s.pendants++;
    else if (t === "chandelier") s.chandeliers++;
    else if (t === "vent") s.vents++;
    else if (t === "track") { s.trackCount++; s.trackCm += elementLength(e); }
    else if (t === "lightline") { s.lightlineCount++; s.lightlineCm += elementLength(e); }
    else if (CURTAIN_TYPES.has(t)) { s.curtainCount++; s.curtainCm += elementLength(e); }
    else if (t === "subcurtain") { s.subcurtainCount++; s.subcurtainCm += elementLength(e); }
  }
  const prof = profilesOf(room);
  const n = room.walls.length;
  const insertOn = typeof room.withInsert === "boolean" ? room.withInsert : (legacyInsertFlag(room.wallProfiles) ?? true);
  room.walls.forEach((len, i) => {
    const p = prof[i];
    s.profileCm[p] = (s.profileCm[p] ?? 0) + len;
    (s.profileWalls[p] ??= []).push(`${cornerLetter(i)}${cornerLetter((i + 1) % n)}`);
    if (insertOn && (INSERT_PROFILE_TYPES.has(p) || room.profileInsert?.[p] === true)) s.insertCm += len;
  });
  if (room.profileNames) s.profileNames = { ...room.profileNames };
  return s;
}

export function mergeSummaries(list: RoomSummary[]): RoomSummary {
  const out = emptySummary();
  for (const s of list) {
    out.spots += s.spots; out.spotPairs += s.spotPairs; out.pendants += s.pendants; out.chandeliers += s.chandeliers; out.vents += s.vents;
    out.trackCm += s.trackCm; out.trackCount += s.trackCount;
    out.lightlineCm += s.lightlineCm; out.lightlineCount += s.lightlineCount;
    out.curtainCount += s.curtainCount; out.curtainCm += s.curtainCm;
    out.subcurtainCount += s.subcurtainCount; out.subcurtainCm += s.subcurtainCm;
    for (const [k, v] of Object.entries(s.profileCm)) out.profileCm[k] = (out.profileCm[k] ?? 0) + v;
    Object.assign(out.profileNames, s.profileNames);
    out.insertCm += s.insertCm;
  }
  return out;
}

const m = (cm: number) => `${(Math.round(cm / 10) / 10).toLocaleString("ru-RU")} м`;

/** Строки «что ставить» — для комнаты и для итога по объекту. */
export function summaryLines(s: RoomSummary, lang: Lang, opts: { withWalls: boolean }): string[] {
  const t = tFor(lang);
  const pcs = t("wo.pcs");
  const out: string[] = [];
  if (s.spots) out.push(`${t("wo.el.spot")}: ${s.spots} ${pcs}${s.spotPairs ? ` · ${t("wo.pairsN", { n: s.spotPairs })}` : ""}`);
  if (s.pendants) out.push(`${t("wo.el.pendant")}: ${s.pendants} ${pcs}`);
  if (s.chandeliers) out.push(`${t("wo.el.chandelier")}: ${s.chandeliers} ${pcs}`);
  if (s.vents) out.push(`${t("wo.el.vent")}: ${s.vents} ${pcs}`);
  if (s.trackCount) out.push(`${t("wo.el.track")}: ${s.trackCount} ${pcs}${s.trackCm ? ` · ${m(s.trackCm)}` : ""}`);
  if (s.lightlineCount) out.push(`${t("wo.el.lightline")}: ${s.lightlineCount} ${pcs}${s.lightlineCm ? ` · ${m(s.lightlineCm)}` : ""}`);
  if (s.curtainCount) out.push(`${t("wo.el.curtainOnly")}: ${s.curtainCount} ${pcs}${s.curtainCm ? ` · ${m(s.curtainCm)}` : ""}`);
  if (s.subcurtainCount) out.push(`${t("wo.el.subcurtainEl")}: ${s.subcurtainCount} ${pcs}${s.subcurtainCm ? ` · ${m(s.subcurtainCm)}` : ""}`);
  // Профили стен: сначала особые (теневой, парящий, подшторник…), обычный пластик — последним.
  const types = Object.keys(s.profileCm).sort((a, b) => (a === "pvc" ? 1 : 0) - (b === "pvc" ? 1 : 0));
  for (const p of types) {
    const name = profileLabel(p, t, s.profileNames);
    const walls = opts.withWalls && s.profileWalls[p]?.length ? ` (${s.profileWalls[p].join(", ")})` : "";
    out.push(`${name}: ${m(s.profileCm[p])}${walls}`);
  }
  // Вставка — отдельной строкой, как и в КП (30.10.2026: «багет — одна позиция, вставка — другая»).
  if (s.insertCm > 0) out.push(`${t("wo.insert")}: ${m(s.insertCm)}`);
  return out;
}

// ============================================
// Размерные цепочки для монтажника
// ============================================

/** Длина луча из p по dir до контура (см) — ближайшее пересечение со стеной. */
function rayToWall(p: Pt, dir: Pt, v: Pt[]): number | null {
  const n = v.length;
  let best: number | null = null;
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const s = ((a.x - p.x) * dir.y - (a.y - p.y) * dir.x) / den;
    if (t > 0.5 && s >= -1e-6 && s <= 1 + 1e-6 && (best === null || t < best)) best = t;
  }
  return best;
}

/** Сгруппировать единицы в ряды по координате `key` (допуск ROW_TOL_CM), внутри ряда — по другой оси. */
function groupRows(units: PointUnit[], key: "cx" | "cy"): PointUnit[][] {
  const other = key === "cx" ? "cy" : "cx";
  const sorted = [...units].sort((a, b) => a[key] - b[key]);
  const rows: PointUnit[][] = [];
  for (const u of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(u[key] - last[0][key]) <= ROW_TOL_CM) last.push(u);
    else rows.push([u]);
  }
  for (const r of rows) r.sort((a, b) => a[other] - b[other]);
  return rows;
}

function addDimensions(units: PointUnit[], v: Pt[], S: (p: Pt) => Pt, u: number, shapes: Shape[]) {
  const fs = 7.5 * u;
  const tick = 2.2 * u;
  const n = v.length;
  const cx0 = v.reduce((s, p) => s + p.x, 0) / n, cy0 = v.reduce((s, p) => s + p.y, 0) / n;
  /**
   * Размер между двумя точками (см) с засечками. Подпись — с той стороны
   * линии, что дальше от центра комнаты (у стены свободнее, соседние ряды не
   * перекрываются).
   */
  const dim = (p1: Pt, p2: Pt) => {
    const cm = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));
    if (cm < 1) return;
    const A = S(p1), B = S(p2);
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const horizontal = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
    const midCm = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const side = horizontal ? { x: 0, y: midCm.y > cy0 ? 1 : -1 } : { x: midCm.x > cx0 ? 1 : -1, y: 0 };
    shapes.push({ k: "line", x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: DIM, sw: 0.7 * u });
    for (const P of [A, B]) {
      shapes.push({ k: "line", x1: P.x - nx * tick, y1: P.y - ny * tick, x2: P.x + nx * tick, y2: P.y + ny * tick, stroke: DIM, sw: 0.9 * u });
    }
    // Короткий отрезок — подпись не влезет между засечками, но она и так сбоку от линии
    shapes.push({
      k: "text", x: (A.x + B.x) / 2 + side.x * 5.5 * u, y: (A.y + B.y) / 2 + side.y * 5.5 * u,
      text: String(cm), size: fs, weight: 600, fill: DIM_TEXT, halo: true,
    });
  };
  /** Привязка точки к ближайшей стене вдоль оси: луч в обе стороны, берём короче. */
  const tieToWall = (p: Pt, axis: "x" | "y") => {
    const dirs = axis === "x" ? [{ x: -1, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: -1 }, { x: 0, y: 1 }];
    let best: { t: number; d: Pt } | null = null;
    for (const d of dirs) {
      const t = rayToWall(p, d, v);
      if (t !== null && (!best || t < best.t)) best = { t, d };
    }
    if (!best) return;
    const q = { x: p.x + best.d.x * best.t, y: p.y + best.d.y * best.t };
    dim(p, q);
  };

  const covered = new Set<string>();

  /**
   * Цепочки вдоль оси `along` (ряды при "x": единицы с одинаковым y).
   * Для каждого ряда из ≥2: стена → первый → … → последний → стена, плюс
   * отступ ряда: первый ряд — до ближней стены поперёк, следующие — до
   * предыдущего ряда, последний (если рядов ≥ 2) — ещё и до стены.
   */
  const chains = (along: "x" | "y", pool: PointUnit[]) => {
    const rowKey = along === "x" ? "cy" : "cx";
    const rows = groupRows(pool, rowKey).filter((r) => r.length >= 2);
    rows.forEach((row, ri) => {
      const first = row[0], last = row[row.length - 1];
      for (const un of row) covered.add(un.key);
      // Вдоль ряда: от стены до первого
      const dirBack = along === "x" ? { x: -1, y: 0 } : { x: 0, y: -1 };
      const dirFwd = along === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const t0 = rayToWall({ x: first.cx, y: first.cy }, dirBack, v);
      if (t0 !== null) dim({ x: first.cx + dirBack.x * t0, y: first.cy + dirBack.y * t0 }, { x: first.cx, y: first.cy });
      for (let i = 1; i < row.length; i++) dim({ x: row[i - 1].cx, y: row[i - 1].cy }, { x: row[i].cx, y: row[i].cy });
      const t1 = rayToWall({ x: last.cx, y: last.cy }, dirFwd, v);
      if (t1 !== null) dim({ x: last.cx, y: last.cy }, { x: last.cx + dirFwd.x * t1, y: last.cy + dirFwd.y * t1 });
      // Поперёк ряда: отступ
      const across: "x" | "y" = along === "x" ? "y" : "x";
      if (ri === 0) tieToWall({ x: first.cx, y: first.cy }, across);
      else {
        const prev = rows[ri - 1][0];
        const p = { x: first.cx, y: first.cy };
        const q = along === "x" ? { x: first.cx, y: prev.cy } : { x: prev.cx, y: first.cy };
        dim(q, p);
      }
      if (ri === rows.length - 1 && rows.length >= 2) tieToWall({ x: last.cx, y: last.cy }, across);
    });
  };

  // 1. Горизонтальные ряды; 2. вертикальные колонки из тех, кто не попал в ряд;
  // 3. оставшиеся одиночки — до двух ближайших стен.
  chains("x", units);
  chains("y", units.filter((un) => !covered.has(un.key)));
  for (const un of units) {
    if (covered.has(un.key)) continue;
    tieToWall({ x: un.cx, y: un.cy }, "x");
    tieToWall({ x: un.cx, y: un.cy }, "y");
  }
}

// ============================================
// Построение плана (фигуры)
// ============================================

export function buildRoomPlan(room: PlanRoom, lang: Lang, size = 320, opts: PlanOptions = {}): RoomPlan | null {
  const v = verticesOf(room);
  if (!v) return null;
  const t = tFor(lang);
  const n = v.length;
  const walls = room.walls;
  const els = elementsOf(room);
  const prof = profilesOf(room);

  // Габариты — с точками элементов, чтобы трек за стеной не обрезался.
  const all: Pt[] = [...v];
  for (const e of els) {
    if (typeof e.x === "number" && typeof e.y === "number") all.push({ x: e.x, y: e.y });
    if (e.shape === "freeform" && e.points) all.push(...freeformPoints(e).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  // Дуги стен (эркер) выходят за прямые вершины — габарит считаем по плотному контуру
  if (room.bulges?.some((b) => b) || room.cornerRadii?.some((r) => r)) {
    all.push(...roomPolygonDense(v, { bulges: room.bulges, cornerRadii: room.cornerRadii }));
  }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Кривая точка в замере (трек без y, угол без числа) — весь план стал бы NaN
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const roomSize = Math.max(w, h);
  const pad = size * 0.095;
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = pad + ((size - pad * 2) - w * scale) / 2 - minX * scale;
  const oy = pad + ((size - pad * 2) - h * scale) / 2 - minY * scale;
  const sx = (x: number) => x * scale + ox;
  const sy = (y: number) => y * scale + oy;
  const S = (p: Pt): Pt => ({ x: sx(p.x), y: sy(p.y) });
  const sv = v.map(S);
  // Масштаб толщин и шрифтов от размера плана (320 — страница, 220 — PDF)
  const u = (size / 320) * (opts.boost ?? 1);
  const strokeW = 2 * u;
  const fs = 10 * u;

  const pencil = !!opts.pencil;
  const client = opts.client;
  const C: Palette = client
    ? {
        spot: client.ink, pendant: client.ink, chandelier: client.accent, vent: client.ink, track: client.accent,
        lightline: client.accent, curtain: client.ink, subcurtain: client.ink, floating: client.accent,
        wall: client.accent, roomFill: client.fill, label: client.ink,
      }
    : pencil ? PENCIL_COLORS : COLORS;
  const shapes: Shape[] = [];

  // Клетка тетради: 10 см тонко, 50 см жирнее, по всему листу, в масштабе комнаты
  // (PDF рисует клетку сам на всю страницу по frame — тогда grid: false)
  if (pencil && opts.grid !== false) {
    const k0x = Math.floor(-ox / scale / 10), k1x = Math.ceil((size - ox) / scale / 10);
    const k0y = Math.floor(-oy / scale / 10), k1y = Math.ceil((size - oy) / scale / 10);
    for (let k = k0x; k <= k1x; k++) {
      const X = sx(k * 10);
      if (X < 0 || X > size) continue;
      const major = k % 5 === 0;
      shapes.push({ k: "line", x1: X, y1: 0, x2: X, y2: size, stroke: major ? GRID_MAJOR : GRID, sw: (major ? 0.8 : 0.45) * u, tag: "grid" });
    }
    for (let k = k0y; k <= k1y; k++) {
      const Y = sy(k * 10);
      if (Y < 0 || Y > size) continue;
      const major = k % 5 === 0;
      shapes.push({ k: "line", x1: 0, y1: Y, x2: size, y2: Y, stroke: major ? GRID_MAJOR : GRID, sw: (major ? 0.8 : 0.45) * u, tag: "grid" });
    }
  }

  /** Линия элемента: в карандашном стиле — двойная / пунктир / точки по типу. */
  const pushStyled = (base: Extract<Shape, { k: "line" } | { k: "polyline" }>, type: string) => {
    if (!pencil) { shapes.push(base); return; }
    const ps = LINE_PENCIL[legendKey(type)] ?? {};
    if (ps.double) {
      shapes.push({ ...base, sw: strokeW * 1.9 });
      shapes.push({ ...base, stroke: PAPER, sw: strokeW * 0.7 });
      return;
    }
    shapes.push({ ...base, sw: strokeW * (ps.mul ?? 1), dash: ps.dash ? scaleDash(ps.dash, u) : undefined });
  };

  const outline = roomOutlinePath(sv, {
    bulges: room.bulges?.map((b) => (b || 0) * scale),
    cornerRadii: room.cornerRadii?.map((r) => (r || 0) * scale),
  });
  if (outline) shapes.push({ k: "path", d: outline, fill: C.roomFill, stroke: C.wall, sw: strokeW, tag: "wall" });
  else shapes.push({ k: "polygon", points: sv, fill: C.roomFill, stroke: C.wall, sw: strokeW, tag: "wall" });

  // Внутренняя сторона стены: центроид комнаты подсказывает знак перпендикуляра.
  const cx0 = sv.reduce((s, p) => s + p.x, 0) / n, cy0 = sv.reduce((s, p) => s + p.y, 0) / n;
  const wallFrame = (i: number) => {
    const a = sv[i], b = sv[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len, ny = dy / len;
    let px = -ny, py = nx;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((cx0 - mx) * px + (cy0 - my) * py < 0) { px = -px; py = -py; }
    return { a, b, nx, ny, px, py, len };
  };

  const used = new Set<string>();

  // 1. Стены с профилем (цвет/пунктир по типу), поверх контура
  walls.forEach((_, i) => {
    const p = prof[i];
    if (p === "pvc") return; // обычный пластик — просто контур
    const { a, b } = wallFrame(i);
    used.add(`prof:${p}`);
    // Клиенту — одна толщина стен: разная толщина читалась как ошибка рендера,
    // а профиль и так назван в позициях (ревью 26.10.2026)
    if (client) return;
    if (pencil) {
      const ps = PROFILE_PENCIL[p] ?? { dash: "4 3", mul: 1.4 };
      const base = { k: "line" as const, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: INK, sw: strokeW * ps.mul, tag: `profile:${p}` };
      if (ps.double) {
        shapes.push(base);
        shapes.push({ ...base, stroke: PAPER, sw: strokeW * 0.8 });
      } else {
        shapes.push({ ...base, dash: ps.dash ? scaleDash(ps.dash, u) : undefined });
      }
      return;
    }
    const st = PROFILE_STYLE[p] ?? { color: "#7c3aed", dashed: true, mul: 1.2 };
    shapes.push({ k: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: st.color, sw: strokeW * st.mul + u, dash: st.dashed ? `${6 * u} ${4 * u}` : undefined, tag: `profile:${p}` });
  });

  // 2. Элементы на стене (прямые гардины, подшторники, треки, свет.линии по стене)
  for (const el of els) {
    const type = String(el.type);
    if (typeof el.wallIndex !== "number" || !LINE_TYPES.has(type)) continue;
    // «circle» есть только в типах мобилки — сравниваем как строку
    const shape = String(el.shape ?? "straight");
    if (shape === "freeform" || shape === "circle") continue;
    const wi = el.wallIndex;
    if (wi < 0 || wi >= n) continue;
    const { a, nx, ny, px, py, len } = wallFrame(wi);
    const wallCm = walls[wi] || 1;
    const elLen = Math.min((el.length ?? wallCm) * scale, len);
    const pos = el.wallPosition ?? 0.5;
    const ratio = elLen / len;
    const startT = Math.max(0, Math.min(1 - ratio, pos - ratio / 2)) * len;
    const depthCm = type === "subcurtain" ? (el.depth ?? 20) : CURTAIN_TYPES.has(type) ? (el.depth ?? 25) : roomSize * 0.05;
    const off = depthCm * scale;
    const x1 = a.x + nx * startT + px * off, y1 = a.y + ny * startT + py * off;
    const x2 = a.x + nx * (startT + elLen) + px * off, y2 = a.y + ny * (startT + elLen) + py * off;
    const color = lineColor(type, C);
    used.add(`el:${legendKey(type)}`);
    const sw = type === "subcurtain" ? strokeW * 1.3 : strokeW;
    pushStyled({ k: "line", x1, y1, x2, y2, stroke: color, sw, round: true, tag: type }, type);
    // П-ниша / Г-загиб подшторника: возвраты к стене
    if (type === "subcurtain" && (shape === "u-niche" || shape === "l-bend")) {
      if (shape === "u-niche" || el.side !== "left") pushStyled({ k: "line", x1, y1, x2: x1 - px * off, y2: y1 - py * off, stroke: color, sw, tag: type }, type);
      if (shape === "u-niche" || el.side === "left") pushStyled({ k: "line", x1: x2, y1: y2, x2: x2 - px * off, y2: y2 - py * off, stroke: color, sw, tag: type }, type);
    }
    if (client) continue;
    const cm = Math.round(el.length ?? wallCm);
    shapes.push({ k: "text", x: (x1 + x2) / 2 + px * (fs + 2 * u), y: (y1 + y2) / 2 + py * (fs + 2 * u), text: String(cm), size: fs, weight: 600, fill: color, halo: true, tag: "dim-el" });
  }

  // 3. Свободные ломаные (трек, свет.линия, гардина по точкам) и круги
  for (const el of els) {
    const type = String(el.type);
    if (String(el.shape) === "circle" && typeof (el as { cx?: number }).cx === "number") {
      const c = el as unknown as { cx: number; cy: number; radius: number };
      used.add(`el:${legendKey(type)}`);
      shapes.push({ k: "circle", cx: sx(c.cx), cy: sy(c.cy), r: Math.max(2 * u, c.radius * scale), fill: "none", stroke: lineColor(type, C), sw: strokeW, tag: `${type}-circle` });
      continue;
    }
    if (el.shape !== "freeform" || !el.points || el.points.length < 2) continue;
    const p = freeformPoints(el).map(S);
    const color = lineColor(type, C);
    used.add(`el:${legendKey(type)}`);
    pushStyled({ k: "polyline", points: p, stroke: color, sw: strokeW, tag: type }, type);
    const cm = Math.round(elementLength(el));
    if (cm > 0 && !client) {
      const mid = p[Math.floor(p.length / 2)];
      shapes.push({ k: "text", x: mid.x, y: mid.y - fs, text: String(cm), size: fs, weight: 600, fill: color, halo: true, tag: "dim-el" });
    }
  }

  const units = pointUnits(els);

  // 3b. Размерные цепочки — ДО светильников: кружки с белой заливкой закрывают
  // линию, и цепочка читается как осевая «от центра до центра».
  if (opts.dims && units.length > 0) addDimensions(units, v, S, u, shapes);

  // 4. Точечные: софиты (одиночные и пары), подвесы, люстры
  for (const un of units) {
    const type = un.type;
    used.add(`el:${type}`);
    const spotRad = 3.6 * u;
    if (type === "spot" && un.members.length === 2) {
      // Пара — два кружка того же диаметра, что одиночный, с небольшим зазором;
      // центр пары — между ними (размеры на чертеже идут к нему). Кружки по
      // реальным точкам, но не ближе зазора, чтобы на мелком масштабе не слипались.
      used.add("el:spotPair");
      const [m1, m2] = un.members;
      const dx = (m2.x as number) - (m1.x as number), dy = (m2.y as number) - (m1.y as number);
      const dCm = Math.hypot(dx, dy);
      const ax = dCm > 0.01 ? dx / dCm : 1, ay = dCm > 0.01 ? dy / dCm : 0;
      const half = Math.max(spotRad + 2.2 * u, (dCm / 2) * scale);
      const c = S({ x: un.cx, y: un.cy });
      for (const t of [-half, half]) {
        shapes.push({ k: "circle", cx: c.x + ax * t, cy: c.y + ay * t, r: spotRad, fill: "#fff", stroke: C.spot, sw: 1.8 * u, tag: "spot" });
      }
      continue;
    }
    const el = un.members[0];
    const x = sx(el.x as number), y = sy(el.y as number);
    if (type === "spot") {
      shapes.push({ k: "circle", cx: x, cy: y, r: spotRad, fill: "#fff", stroke: C.spot, sw: 1.8 * u, tag: "spot" });
    } else if (type === "pendant") {
      shapes.push({ k: "circle", cx: x, cy: y, r: 6.5 * u, fill: "#fff", stroke: C.pendant, sw: 2 * u, tag: "pendant" });
      shapes.push({ k: "circle", cx: x, cy: y, r: 2.2 * u, fill: C.pendant, stroke: "none", sw: 0, tag: "pendant-dot" });
    } else if (type === "vent") {
      // Теневая вытяжка — круг в круге, чуть меньше люстры (8.5u)
      const rv = 7.5 * u;
      shapes.push({ k: "circle", cx: x, cy: y, r: rv, fill: "#fff", stroke: C.vent, sw: 1.8 * u, tag: "vent" });
      shapes.push({ k: "circle", cx: x, cy: y, r: rv * 0.55, fill: "#fff", stroke: C.vent, sw: 1.4 * u, tag: "vent-inner" });
    } else {
      shapes.push({ k: "circle", cx: x, cy: y, r: 8.5 * u, fill: "#fff", stroke: C.chandelier, sw: 2 * u, tag: "chandelier" });
      shapes.push({ k: "circle", cx: x, cy: y, r: 2.6 * u, fill: C.chandelier, stroke: "none", sw: 0, tag: "chandelier-dot" });
    }
  }

  // Подписи длин стен (см) снаружи, с запасом под толстую линию профиля.
  // Клиенту — в метрах и только по запросу (в «Кратко» размеров нет).
  if (!client || opts.labels === "walls-m") {
    walls.forEach((len, i) => {
      const { a, b, px, py } = wallFrame(i);
      const text = client ? (len / 100).toFixed(2).replace(".", ",").replace(/,?0+$/, "") : String(len);
      shapes.push({ k: "text", x: (a.x + b.x) / 2 - px * 14 * u, y: (a.y + b.y) / 2 - py * 14 * u, text, size: (client ? 12 : 11) * u, weight: client ? 600 : 400, fill: C.label, halo: true, tag: "dim-wall" });
    });
  }
  // Буквы углов — наружу, против биссектрисы к соседям (клиенту не нужны)
  if (!client) sv.forEach((p, i) => {
    const prev = sv[(i - 1 + n) % n], next = sv[(i + 1) % n];
    let dx = (prev.x - p.x) + (next.x - p.x), dy = (prev.y - p.y) + (next.y - p.y);
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    shapes.push({ k: "text", x: p.x - dx * 11 * u, y: p.y - dy * 11 * u, text: cornerLetter(i), size: 10 * u, weight: 700, fill: C.wall, halo: false, tag: "corner" });
  });

  const legend: Legend[] = [];
  for (const key of used) {
    const [kind, name] = key.split(":");
    if (kind === "el") {
      const ln = (type: string): Pick<Legend, "dash" | "double" | "mul"> => {
        if (!pencil) return {};
        const ps = LINE_PENCIL[type] ?? {};
        return { dash: ps.dash, double: ps.double, mul: ps.mul };
      };
      if (name === "spot") legend.push({ key: t("wo.el.spot"), color: C.spot, kind: "ring" });
      else if (name === "spotPair") legend.push({ key: t("wo.el.spotPair"), color: C.spot, kind: "pair" });
      else if (name === "pendant") legend.push({ key: t("wo.el.pendant"), color: C.pendant, kind: "dot" });
      else if (name === "chandelier") legend.push({ key: t("wo.el.chandelier"), color: C.chandelier, kind: "chand" });
      else if (name === "vent") legend.push({ key: t("wo.el.vent"), color: C.vent, kind: "vent" });
      else if (name === "track") legend.push({ key: t("wo.el.track"), color: C.track, kind: "line", ...ln("track") });
      else if (name === "lightline") legend.push({ key: t("wo.el.lightline"), color: C.lightline, kind: "line", ...ln("lightline") });
      else if (name === "curtain") legend.push({ key: t("wo.el.curtainOnly"), color: C.curtain, kind: "line", ...ln("curtain") });
      else if (name === "subcurtain") legend.push({ key: t("wo.el.subcurtainEl"), color: C.subcurtain, kind: "line", ...ln("subcurtain") });
    } else {
      const label = profileLabel(name, t, room.profileNames);
      if (pencil) {
        const ps = PROFILE_PENCIL[name] ?? { dash: "4 3", mul: 1.4 };
        legend.push({ key: label, color: INK, kind: "line", dash: ps.dash, double: ps.double, mul: ps.mul });
      } else {
        const st = PROFILE_STYLE[name];
        legend.push({ key: label, color: st?.color ?? "#7c3aed", kind: st?.dashed === false ? "line" : "dash" });
      }
    }
  }

  // Карандаш/клиент: подложка подписей — цвет бумаги, заливки кружков — бумага
  const paper = pencil ? PAPER : client?.paper;
  if (paper) {
    for (const s of shapes) {
      if (s.k === "text") s.haloColor = paper;
      else if (s.k === "circle" && s.fill === "#fff") s.fill = paper;
    }
  }

  // Без подписей стен (план на обложке, «Кратко») поле вокруг комнаты уже —
  // иначе подпись комнаты отрывалась от плана.
  // С подписями длин поле шире: подпись стоит в 14u от стены и сама ~24u в ширину
  const bpad = client ? (opts.labels === "walls-m" ? Math.max(pad, 42 * u) : pad * 0.35) : pad;
  const bbox = { x: sx(minX) - bpad, y: sy(minY) - bpad, w: w * scale + bpad * 2, h: h * scale + bpad * 2 };
  return { size, shapes, legend, frame: { ox, oy, scale }, bbox };
}

// ============================================
// HTML-рендер для страницы наряда
// ============================================

export function RoomPlanSvg({ room, lang }: { room: PlanRoom; lang: Lang }): React.ReactElement | null {
  const plan = buildRoomPlan(room, lang, 320);
  if (!plan) return null;
  const { size, shapes, legend } = plan;
  return (
    <div className="w-full sm:w-[320px] shrink-0">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="bg-white rounded-lg border border-slate-200 block">
        {shapes.map((s, i) => {
          switch (s.k) {
            case "path": return <path key={i} d={s.d} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} />;
            case "polygon": return <polygon key={i} points={s.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} />;
            case "line": return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.sw} strokeDasharray={s.dash} strokeLinecap={s.round ? "round" : "butt"} />;
            case "polyline": return <polyline key={i} points={s.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={s.stroke} strokeWidth={s.sw} strokeDasharray={s.dash} strokeLinecap="round" strokeLinejoin="round" />;
            case "circle": return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} />;
            case "text": return (
              <text key={i} x={s.x} y={s.y} fontSize={s.size} fontWeight={s.weight} textAnchor="middle" dominantBaseline="middle" fill={s.fill}
                stroke={s.halo ? (s.haloColor ?? "#ffffff") : undefined} strokeWidth={s.halo ? 3 : undefined} paintOrder={s.halo ? "stroke" : undefined}>{s.text}</text>
            );
          }
        })}
      </svg>
      {legend.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {legend.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              {l.kind === "line" || l.kind === "dash" ? (
                <span className="inline-block w-4 border-t-2" style={{ borderColor: l.color, borderStyle: l.kind === "dash" ? "dashed" : "solid" }} />
              ) : l.kind === "vent" || l.kind === "chand" ? (
                <span className="inline-flex items-center justify-center w-3 h-3 rounded-full" style={{ border: `2px solid ${l.color}` }}>
                  <span className="inline-block w-1 h-1 rounded-full" style={l.kind === "vent" ? { border: `1px solid ${l.color}` } : { backgroundColor: l.color }} />
                </span>
              ) : l.kind === "pair" ? (
                <span className="inline-flex items-center gap-[2px]">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ border: `2px solid ${l.color}` }} />
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ border: `2px solid ${l.color}` }} />
                </span>
              ) : (
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={l.kind === "ring" ? { border: `2px solid ${l.color}` } : { backgroundColor: l.color }} />
              )}
              {l.key}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
