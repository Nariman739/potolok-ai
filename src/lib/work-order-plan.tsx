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
 */
import React from "react";
import { getVertices, roomOutlinePath } from "@/lib/room-geometry";
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
};

type Pt = { x: number; y: number };

const COLORS = {
  spot: "#F59E0B",
  pendant: "#3B82F6",
  chandelier: "#8B5CF6",
  track: "#EF4444",
  lightline: "#CA8A04",
  curtain: "#10B981",
  subcurtain: "#0F172A",
  floating: "#F97316",
  wall: "#1e3a5f",
} as const;

/** Профили стен: цвет и пунктир как в дизайнере (src/lib/wall-profiles.ts мобилки). */
const PROFILE_STYLE: Record<string, { color: string; dashed: boolean; mul: number }> = {
  pvc_insert: { color: "#64748b", dashed: false, mul: 1 },
  pvc: { color: "#64748b", dashed: true, mul: 1 },
  aluminum_insert: { color: "#94a3b8", dashed: false, mul: 1.2 },
  aluminum: { color: "#94a3b8", dashed: true, mul: 1.2 },
  shadow: { color: "#1a1a1a", dashed: false, mul: 1.8 },
  floating: { color: "#F97316", dashed: false, mul: 1.8 },
  subcurtain: { color: "#0F172A", dashed: false, mul: 1.5 },
  subcurtain_light: { color: "#0F172A", dashed: false, mul: 1.5 },
  ldsp: { color: "#A16207", dashed: false, mul: 1.4 },
  eurobrus: { color: "#78350F", dashed: false, mul: 1.4 },
};
const PROFILE_TYPES = Object.keys(PROFILE_STYLE);

export function normalizeProfile(p: unknown): string {
  if (p === undefined || p === null || p === "" || p === "galtel") return "pvc_insert";
  if (p === "no_insert") return "pvc";
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

function lineColor(type: string): string {
  if (type === "track") return COLORS.track;
  if (type === "lightline") return COLORS.lightline;
  if (type === "subcurtain") return COLORS.subcurtain;
  return COLORS.curtain;
}

// ============================================
// Сводка по комнате и объекту
// ============================================

export type RoomSummary = {
  spots: number;
  pendants: number;
  chandeliers: number;
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
};

export function summarizeRoom(room: PlanRoom): RoomSummary {
  const els = elementsOf(room);
  const s: RoomSummary = {
    spots: 0, pendants: 0, chandeliers: 0, trackCm: 0, trackCount: 0, lightlineCm: 0, lightlineCount: 0,
    curtainCount: 0, curtainCm: 0, subcurtainCount: 0, subcurtainCm: 0, profileCm: {}, profileWalls: {},
  };
  for (const e of els) {
    const t = String(e.type);
    if (t === "spot") s.spots++;
    else if (t === "pendant") s.pendants++;
    else if (t === "chandelier") s.chandeliers++;
    else if (t === "track") { s.trackCount++; s.trackCm += elementLength(e); }
    else if (t === "lightline") { s.lightlineCount++; s.lightlineCm += elementLength(e); }
    else if (CURTAIN_TYPES.has(t)) { s.curtainCount++; s.curtainCm += elementLength(e); }
    else if (t === "subcurtain") { s.subcurtainCount++; s.subcurtainCm += elementLength(e); }
  }
  const prof = profilesOf(room);
  const n = room.walls.length;
  room.walls.forEach((len, i) => {
    const p = prof[i];
    s.profileCm[p] = (s.profileCm[p] ?? 0) + len;
    (s.profileWalls[p] ??= []).push(`${cornerLetter(i)}${cornerLetter((i + 1) % n)}`);
  });
  return s;
}

export function mergeSummaries(list: RoomSummary[]): RoomSummary {
  const out: RoomSummary = {
    spots: 0, pendants: 0, chandeliers: 0, trackCm: 0, trackCount: 0, lightlineCm: 0, lightlineCount: 0,
    curtainCount: 0, curtainCm: 0, subcurtainCount: 0, subcurtainCm: 0, profileCm: {}, profileWalls: {},
  };
  for (const s of list) {
    out.spots += s.spots; out.pendants += s.pendants; out.chandeliers += s.chandeliers;
    out.trackCm += s.trackCm; out.trackCount += s.trackCount;
    out.lightlineCm += s.lightlineCm; out.lightlineCount += s.lightlineCount;
    out.curtainCount += s.curtainCount; out.curtainCm += s.curtainCm;
    out.subcurtainCount += s.subcurtainCount; out.subcurtainCm += s.subcurtainCm;
    for (const [k, v] of Object.entries(s.profileCm)) out.profileCm[k] = (out.profileCm[k] ?? 0) + v;
  }
  return out;
}

const m = (cm: number) => `${(Math.round(cm / 10) / 10).toLocaleString("ru-RU")} м`;

/** Строки «что ставить» — для комнаты и для итога по объекту. */
export function summaryLines(s: RoomSummary, lang: Lang, opts: { withWalls: boolean }): string[] {
  const t = tFor(lang);
  const pcs = t("wo.pcs");
  const out: string[] = [];
  if (s.spots) out.push(`${t("wo.el.spot")}: ${s.spots} ${pcs}`);
  if (s.pendants) out.push(`${t("wo.el.pendant")}: ${s.pendants} ${pcs}`);
  if (s.chandeliers) out.push(`${t("wo.el.chandelier")}: ${s.chandeliers} ${pcs}`);
  if (s.trackCount) out.push(`${t("wo.el.track")}: ${s.trackCount} ${pcs}${s.trackCm ? ` · ${m(s.trackCm)}` : ""}`);
  if (s.lightlineCount) out.push(`${t("wo.el.lightline")}: ${s.lightlineCount} ${pcs}${s.lightlineCm ? ` · ${m(s.lightlineCm)}` : ""}`);
  if (s.curtainCount) out.push(`${t("wo.el.curtainOnly")}: ${s.curtainCount} ${pcs}${s.curtainCm ? ` · ${m(s.curtainCm)}` : ""}`);
  if (s.subcurtainCount) out.push(`${t("wo.el.subcurtainEl")}: ${s.subcurtainCount} ${pcs}${s.subcurtainCm ? ` · ${m(s.subcurtainCm)}` : ""}`);
  // Профили стен: сначала особые (теневой, парящий, подшторник…), обычный пластик — последним.
  const types = Object.keys(s.profileCm).sort((a, b) => (a === "pvc_insert" ? 1 : 0) - (b === "pvc_insert" ? 1 : 0));
  for (const p of types) {
    const name = PROFILE_TYPES.includes(p) ? t(`wo.prof.${p}`) : t("wo.prof.custom");
    const walls = opts.withWalls && s.profileWalls[p]?.length ? ` (${s.profileWalls[p].join(", ")})` : "";
    out.push(`${t("wo.profile")} ${name}: ${m(s.profileCm[p])}${walls}`);
  }
  return out;
}

// ============================================
// SVG-план
// ============================================

export type Legend = { key: string; color: string; kind: "dot" | "ring" | "line" | "dash" };

export function RoomPlanSvg({ room, lang }: { room: PlanRoom; lang: Lang }): React.ReactElement | null {
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
    if (e.shape === "freeform" && e.points) all.push(...freeformPoints(e));
  }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const roomSize = Math.max(w, h);
  const size = 320, pad = 30;
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = pad + ((size - pad * 2) - w * scale) / 2 - minX * scale;
  const oy = pad + ((size - pad * 2) - h * scale) / 2 - minY * scale;
  const sx = (x: number) => x * scale + ox;
  const sy = (y: number) => y * scale + oy;
  const S = (p: Pt): Pt => ({ x: sx(p.x), y: sy(p.y) });
  const sv = v.map(S);

  const outline = roomOutlinePath(sv, {
    bulges: room.bulges?.map((b) => (b || 0) * scale),
    cornerRadii: room.cornerRadii?.map((r) => (r || 0) * scale),
  });
  const pts = sv.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

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
  const nodes: React.ReactNode[] = [];
  const strokeW = 2;
  const fs = 10;

  // 1. Стены с профилем (цвет/пунктир по типу), поверх контура
  walls.forEach((_, i) => {
    const p = prof[i];
    const st = PROFILE_STYLE[p] ?? { color: "#7c3aed", dashed: true, mul: 1.2 };
    if (p === "pvc_insert") return; // обычный пластик — просто контур
    const { a, b } = wallFrame(i);
    used.add(`prof:${p}`);
    nodes.push(
      <line key={`w${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.color} strokeWidth={strokeW * st.mul + 1}
        strokeDasharray={st.dashed ? "6 4" : undefined} strokeLinecap="butt" />,
    );
  });

  // 2. Элементы на стене (прямые гардины, подшторники, треки, свет.линии по стене)
  els.forEach((el, idx) => {
    const type = String(el.type);
    if (typeof el.wallIndex !== "number" || !LINE_TYPES.has(type)) return;
    // «circle» есть только в типах мобилки — сравниваем как строку
    const shape = String(el.shape ?? "straight");
    if (shape === "freeform" || shape === "circle") return;
    const wi = el.wallIndex;
    if (wi < 0 || wi >= n) return;
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
    const color = lineColor(type);
    const key = type === "subcurtain" ? "subcurtain" : CURTAIN_TYPES.has(type) ? "curtain" : type;
    used.add(`el:${key}`);
    const parts: React.ReactNode[] = [
      <line key="l" x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={type === "subcurtain" ? strokeW * 1.3 : strokeW} strokeLinecap="round" />,
    ];
    // П-ниша / Г-загиб подшторника: возвраты к стене
    if (type === "subcurtain" && (el.shape === "u-niche" || el.shape === "l-bend")) {
      const back = (x: number, y: number, k: string) => (
        <line key={k} x1={x} y1={y} x2={x - px * off} y2={y - py * off} stroke={color} strokeWidth={strokeW * 1.3} />
      );
      if (el.shape === "u-niche" || el.side !== "left") parts.push(back(x1, y1, "b1"));
      if (el.shape === "u-niche" || el.side === "left") parts.push(back(x2, y2, "b2"));
    }
    const cm = Math.round(el.length ?? wallCm);
    parts.push(
      <text key="t" x={(x1 + x2) / 2 + px * (fs + 2)} y={(y1 + y2) / 2 + py * (fs + 2)} fontSize={fs} fontWeight={600}
        textAnchor="middle" dominantBaseline="middle" fill={color} stroke="#fff" strokeWidth={3} paintOrder="stroke">{cm}</text>,
    );
    nodes.push(<g key={`we${idx}`}>{parts}</g>);
  });

  // 3. Свободные ломаные (трек, свет.линия, гардина по точкам) и круги
  els.forEach((el, idx) => {
    const type = String(el.type);
    if (String(el.shape) === "circle" && typeof (el as { cx?: number }).cx === "number") {
      const c = el as unknown as { cx: number; cy: number; radius: number };
      const color = lineColor(type);
      used.add(`el:${type === "subcurtain" ? "subcurtain" : CURTAIN_TYPES.has(type) ? "curtain" : type}`);
      nodes.push(<circle key={`c${idx}`} cx={sx(c.cx)} cy={sy(c.cy)} r={Math.max(2, c.radius * scale)} fill="none" stroke={color} strokeWidth={strokeW} />);
      return;
    }
    if (el.shape !== "freeform" || !el.points || el.points.length < 2) return;
    const p = freeformPoints(el).map(S);
    const color = lineColor(type);
    const key = type === "subcurtain" ? "subcurtain" : CURTAIN_TYPES.has(type) ? "curtain" : type;
    used.add(`el:${key}`);
    const mid = p[Math.floor(p.length / 2)];
    const cm = Math.round(elementLength(el));
    nodes.push(
      <g key={`f${idx}`}>
        <polyline points={p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
        {cm > 0 && (
          <text x={mid.x} y={mid.y - fs} fontSize={fs} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill={color}
            stroke="#fff" strokeWidth={3} paintOrder="stroke">{cm}</text>
        )}
      </g>,
    );
  });

  // 4. Точечные: софиты, подвесы, люстры
  els.forEach((el, idx) => {
    const type = String(el.type);
    if (typeof el.x !== "number" || typeof el.y !== "number") return;
    if (type !== "spot" && type !== "pendant" && type !== "chandelier") return;
    const x = sx(el.x), y = sy(el.y);
    used.add(`el:${type}`);
    if (type === "spot") {
      nodes.push(<circle key={`s${idx}`} cx={x} cy={y} r={4.5} fill="#fff" stroke={COLORS.spot} strokeWidth={2} />);
    } else if (type === "pendant") {
      nodes.push(
        <g key={`p${idx}`}>
          <circle cx={x} cy={y} r={6.5} fill="#fff" stroke={COLORS.pendant} strokeWidth={2} />
          <circle cx={x} cy={y} r={2.2} fill={COLORS.pendant} />
        </g>,
      );
    } else {
      nodes.push(
        <g key={`ch${idx}`}>
          <circle cx={x} cy={y} r={8.5} fill="#fff" stroke={COLORS.chandelier} strokeWidth={2} />
          <circle cx={x} cy={y} r={2.6} fill={COLORS.chandelier} />
        </g>,
      );
    }
  });

  // Подписи длин стен (см) на серединах + буквы углов снаружи
  const labels = walls.map((len, i) => {
    const { a, b, px, py } = wallFrame(i);
    // Снаружи стены, с запасом под толстую линию профиля (теневой/парящий)
    return { x: (a.x + b.x) / 2 - px * 14, y: (a.y + b.y) / 2 - py * 14, len };
  });
  const letters = sv.map((p, i) => {
    const prev = sv[(i - 1 + n) % n], next = sv[(i + 1) % n];
    // Наружу — против биссектрисы к соседям
    let dx = (prev.x - p.x) + (next.x - p.x), dy = (prev.y - p.y) + (next.y - p.y);
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return { x: p.x - dx * 11, y: p.y - dy * 11, letter: cornerLetter(i) };
  });

  const legend: Legend[] = [];
  const addLegend = (key: string, color: string, kind: Legend["kind"]) => legend.push({ key, color, kind });
  for (const u of used) {
    const [kind, name] = u.split(":");
    if (kind === "el") {
      if (name === "spot") addLegend(t("wo.el.spot"), COLORS.spot, "ring");
      else if (name === "pendant") addLegend(t("wo.el.pendant"), COLORS.pendant, "dot");
      else if (name === "chandelier") addLegend(t("wo.el.chandelier"), COLORS.chandelier, "dot");
      else if (name === "track") addLegend(t("wo.el.track"), COLORS.track, "line");
      else if (name === "lightline") addLegend(t("wo.el.lightline"), COLORS.lightline, "line");
      else if (name === "curtain") addLegend(t("wo.el.curtainOnly"), COLORS.curtain, "line");
      else if (name === "subcurtain") addLegend(t("wo.el.subcurtainEl"), COLORS.subcurtain, "line");
    } else {
      const st = PROFILE_STYLE[name];
      addLegend(`${t("wo.profile")} ${PROFILE_TYPES.includes(name) ? t(`wo.prof.${name}`) : t("wo.prof.custom")}`, st?.color ?? "#7c3aed", st?.dashed === false ? "line" : "dash");
    }
  }

  return (
    <div className="w-full sm:w-[320px] shrink-0">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="bg-white rounded-lg border border-slate-200 block">
        {outline
          ? <path d={outline} fill="#eff6ff" stroke={COLORS.wall} strokeWidth={2} />
          : <polygon points={pts} fill="#eff6ff" stroke={COLORS.wall} strokeWidth={2} />}
        {nodes}
        {labels.map((l, i) => (
          <text key={`len${i}`} x={l.x} y={l.y} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill="#334155"
            stroke="#ffffff" strokeWidth={3} paintOrder="stroke">{l.len}</text>
        ))}
        {letters.map((l, i) => (
          <text key={`lt${i}`} x={l.x} y={l.y} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={COLORS.wall}>{l.letter}</text>
        ))}
      </svg>
      {legend.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {legend.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              {l.kind === "line" || l.kind === "dash" ? (
                <span className="inline-block w-4 border-t-2" style={{ borderColor: l.color, borderStyle: l.kind === "dash" ? "dashed" : "solid" }} />
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
