import React from "react";
import { Svg, Path, Line, Rect, Text as SvgText, View, Text } from "@react-pdf/renderer";
import { buildRoomPlan, type PlanRoom, type Pt, type Shape } from "@/lib/work-order-plan";
import type { FontPair } from "../types";
import type { PdfRoom } from "../pdf-data";
import { fmtArea } from "./shared";

/**
 * «Лист из тетради замерщика» (Нариман 26.10.2026: «чтобы было красивее,
 * как будто карандашом нарисованы, на бумаге в клеточку»).
 *
 * План комнаты по замеру рисуется карандашом: каждая линия двумя слегка
 * сбитыми штрихами разной плотности (как делает rough.js), стены чуть
 * изогнуты, кружки софитов неидеальные, гардина волнистая, у люстры лучики,
 * подписи рукописным Caveat. Сбивка детерминированная — от данных комнаты,
 * чтобы при каждом рендере лист выходил одинаковым.
 *
 * Геометрию (где стены, где элементы) по-прежнему считает buildRoomPlan из
 * наряда монтажнику — здесь фигуры только перерисовываются по `tag`.
 * Сам лист (кремовая бумага, клетка, тень, скотч) — компонент NotebookSheet.
 */

export const NOTEBOOK = {
  paper: "#FBF8EE",
  paperEdge: "#E6DFCC",
  grid: "#C9D6E4",
  ink: "#2E2F38",
  inkSoft: "#5A5B66",
  tape: "#E7D9B6",
  /** Клетка тетради — 5 мм */
  cell: 14.17,
};

// ---------- детерминированный «карандаш» ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(room: PlanRoom): number {
  let s = 17;
  for (let i = 0; i < room.walls.length; i++) s = (s * 31 + Math.round(room.walls[i]) * (i + 3)) >>> 0;
  const els = Array.isArray(room.elements) ? room.elements.length : 0;
  return (s * 7 + els) >>> 0;
}

type Pen = { rnd: () => number; j: number; ink: string };

/** Слегка изогнутый штрих между двумя точками: квадратичная кривая со сбитым контролем. */
function strokeD(a: Pt, b: Pt, pen: Pen, bow = 1): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const j = pen.j;
  const r = () => (pen.rnd() - 0.5) * 2;
  const ax = a.x + r() * j, ay = a.y + r() * j;
  const bx = b.x + r() * j, by = b.y + r() * j;
  const mx = (a.x + b.x) / 2 + nx * r() * j * 2.2 * bow, my = (a.y + b.y) / 2 + ny * r() * j * 2.2 * bow;
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} Q ${mx.toFixed(2)} ${my.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

/** Неидеальный круг: 4 кубические дуги со сбитым радиусом и случайным поворотом. */
function circleD(cx: number, cy: number, r: number, pen: Pen): string {
  const k = 0.5523;
  const rot = pen.rnd() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const rr = r * (1 + (pen.rnd() - 0.5) * 0.16);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < 4; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % 4];
    const a0 = rot + (i * Math.PI) / 2, a1 = a0 + Math.PI / 2;
    const c0 = { x: p0.x - Math.sin(a0) * r * k, y: p0.y + Math.cos(a0) * r * k };
    const c1 = { x: p1.x + Math.sin(a1) * r * k, y: p1.y - Math.cos(a1) * r * k };
    d += ` C ${c0.x.toFixed(2)} ${c0.y.toFixed(2)} ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  // Карандаш «заходит» чуть дальше начала — как при обводке от руки
  return d + ` Q ${(pts[0].x + 1.2).toFixed(2)} ${(pts[0].y + 0.4).toFixed(2)} ${(pts[0].x + 2).toFixed(2)} ${(pts[0].y + 1).toFixed(2)}`;
}

/** Волнистая линия вдоль отрезка (гардина): полуволны квадратичными дугами. */
function waveD(a: Pt, b: Pt, amp: number, period: number, pen: Pen): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const n = Math.max(2, Math.round(len / period));
  const step = len / n;
  let d = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const s = (i % 2 === 0 ? 1 : -1) * amp * (1 + (pen.rnd() - 0.5) * 0.3);
    const mx = a.x + ux * step * (i + 0.5) + nx * s, my = a.y + uy * step * (i + 0.5) + ny * s;
    const ex = a.x + ux * step * (i + 1), ey = a.y + uy * step * (i + 1);
    d += ` Q ${mx.toFixed(2)} ${my.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }
  return d;
}

/** Два прохода карандашом: плотный и лёгкий, со своей сбивкой каждый. */
function Pencil({ d, sw, ink, dash, keyBase }: { d: () => string; sw: number; ink: string; dash?: string; keyBase: string }) {
  return (
    <>
      <Path key={`${keyBase}-a`} d={d()} fill="none" stroke={ink} strokeWidth={sw} strokeOpacity={0.88} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <Path key={`${keyBase}-b`} d={d()} fill="none" stroke={ink} strokeWidth={sw * 0.75} strokeOpacity={0.42} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
    </>
  );
}

function polyPoints(sh: Shape): Pt[] | null {
  if (sh.k === "polygon" || sh.k === "polyline") return sh.points;
  if (sh.k === "line") return [{ x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }];
  return null;
}

// ---------- рендер одного плана ----------

export function SketchRoomPlan({
  room,
  side,
  dims = false,
  ink = NOTEBOOK.ink,
  paper = NOTEBOOK.paper,
}: {
  room: PlanRoom;
  side: number;
  /** Длины стен в метрах от руки (только «Подробно») */
  dims?: boolean;
  ink?: string;
  paper?: string;
}): React.ReactElement | null {
  const boost = Math.min(2.4, Math.max(1, (320 / side) * 0.5));
  const plan = buildRoomPlan(room, "ru", 320, {
    client: { accent: ink, ink, paper, fill: "none" },
    labels: dims ? "walls-m" : undefined,
    boost,
  });
  if (!plan) return null;
  const { bbox, shapes } = plan;
  const u = boost; // единицы плана: 320 на сторону, штрихи масштабированы boost'ом
  const pen: Pen = { rnd: mulberry32(seedOf(room)), j: 1.1 * u, ink };
  const ar = bbox.w / bbox.h;
  const w = ar >= 1 ? side : side * ar;
  const h = ar >= 1 ? side / ar : side;

  const nodes: React.ReactNode[] = [];
  let i = 0;
  for (const sh of shapes) {
    const key = `s${i++}`;
    const tag = sh.tag ?? "";
    // Стены: контур — по рёбрам, каждое ребро своим штрихом (дуги — путём как есть, двумя проходами)
    if (tag === "wall") {
      if (sh.k === "polygon") {
        const pts = sh.points;
        pts.forEach((p, k) => {
          const q = pts[(k + 1) % pts.length];
          nodes.push(<Pencil key={`${key}-${k}`} keyBase={`${key}-${k}`} d={() => strokeD(p, q, pen)} sw={sh.sw * 1.15} ink={ink} />);
        });
      } else if (sh.k === "path") {
        nodes.push(<Path key={`${key}-a`} d={sh.d} fill="none" stroke={ink} strokeWidth={sh.sw * 1.15} strokeOpacity={0.88} strokeLinejoin="round" />);
        nodes.push(<Path key={`${key}-b`} d={sh.d} fill="none" stroke={ink} strokeWidth={sh.sw * 0.8} strokeOpacity={0.4} strokeLinejoin="round" transform={`translate(${(pen.rnd() - 0.5) * 2 * pen.j} ${(pen.rnd() - 0.5) * 2 * pen.j})`} />);
      }
      continue;
    }
    // Профиль стены: теневой/парящий — вторая линия чуть внутрь, как штриховка края
    if (tag.startsWith("profile:") && sh.k === "line") {
      const a = { x: sh.x1, y: sh.y1 }, b = { x: sh.x2, y: sh.y2 };
      nodes.push(<Pencil key={key} keyBase={key} d={() => strokeD(a, b, pen, 0.6)} sw={sh.sw * 0.6} ink={ink} />);
      continue;
    }
    if (tag === "spot" && sh.k === "circle") {
      nodes.push(<Pencil key={key} keyBase={key} d={() => circleD(sh.cx, sh.cy, sh.r, pen)} sw={sh.sw * 0.9} ink={ink} />);
      continue;
    }
    if (tag === "chandelier" && sh.k === "circle") {
      nodes.push(<Pencil key={key} keyBase={key} d={() => circleD(sh.cx, sh.cy, sh.r * 0.75, pen)} sw={sh.sw * 0.9} ink={ink} />);
      // Лучики — 8 коротких штрихов вокруг
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.2;
        const r0 = sh.r * 0.95, r1 = sh.r * 1.45;
        const p = { x: sh.cx + Math.cos(a) * r0, y: sh.cy + Math.sin(a) * r0 };
        const q = { x: sh.cx + Math.cos(a) * r1, y: sh.cy + Math.sin(a) * r1 };
        nodes.push(<Path key={`${key}-r${k}`} d={strokeD(p, q, pen, 0.3)} fill="none" stroke={ink} strokeWidth={sh.sw * 0.6} strokeOpacity={0.8} strokeLinecap="round" />);
      }
      continue;
    }
    if (tag === "chandelier-dot" || tag === "pendant-dot") {
      if (sh.k === "circle") nodes.push(<Path key={key} d={circleD(sh.cx, sh.cy, sh.r * 0.8, pen)} fill={ink} fillOpacity={0.85} stroke="none" />);
      continue;
    }
    if ((tag === "pendant" || tag === "vent" || tag === "vent-inner") && sh.k === "circle") {
      nodes.push(<Pencil key={key} keyBase={key} d={() => circleD(sh.cx, sh.cy, sh.r, pen)} sw={sh.sw * 0.9} ink={ink} />);
      continue;
    }
    // Гардина / подшторник — волнистая линия у стены
    if ((tag === "curtain" || tag === "builtin_gardina" || tag === "shower_curtain" || tag === "subcurtain") && sh.k === "line") {
      const a = { x: sh.x1, y: sh.y1 }, b = { x: sh.x2, y: sh.y2 };
      const amp = (tag === "subcurtain" ? 1.2 : 1.8) * u;
      nodes.push(<Path key={key} d={waveD(a, b, amp, 5.5 * u, pen)} fill="none" stroke={ink} strokeWidth={sh.sw * 0.8} strokeOpacity={0.85} strokeLinecap="round" />);
      continue;
    }
    // Трек — двойная линия; световая линия — штрих-пунктир; прочие ломаные — карандашом
    const pts = polyPoints(sh);
    if (pts && pts.length >= 2 && sh.k !== "text") {
      const sw = sh.sw;
      const isTrack = tag === "track";
      const dash = tag === "lightline" ? `${5 * u} ${3 * u}` : undefined;
      for (let k = 0; k + 1 < pts.length; k++) {
        const p = pts[k], q = pts[k + 1];
        if (isTrack) {
          const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * 1.3 * u, ny = (dx / len) * 1.3 * u;
          nodes.push(<Pencil key={`${key}-${k}a`} keyBase={`${key}-${k}a`} d={() => strokeD({ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, pen, 0.5)} sw={sw * 0.8} ink={ink} />);
          nodes.push(<Pencil key={`${key}-${k}b`} keyBase={`${key}-${k}b`} d={() => strokeD({ x: p.x - nx, y: p.y - ny }, { x: q.x - nx, y: q.y - ny }, pen, 0.5)} sw={sw * 0.8} ink={ink} />);
        } else {
          nodes.push(<Pencil key={`${key}-${k}`} keyBase={`${key}-${k}`} d={() => strokeD(p, q, pen, 0.6)} sw={sw * 0.9} ink={ink} dash={dash} />);
        }
      }
      continue;
    }
    if (sh.k === "circle") {
      nodes.push(<Pencil key={key} keyBase={key} d={() => circleD(sh.cx, sh.cy, sh.r, pen)} sw={sh.sw * 0.9} ink={ink} />);
      continue;
    }
    // Подписи длин стен — от руки, с подложкой цвета бумаги, чтобы клетка не лезла под цифры
    if (sh.k === "text" && tag === "dim-wall") {
      const size = sh.size * 1.35;
      const tw = sh.text.length * size * 0.5;
      const style = { fontSize: size, fontFamily: "Caveat", fontWeight: 700 } as unknown as Record<string, never>;
      nodes.push(
        <React.Fragment key={key}>
          <Rect x={sh.x - tw / 2 - size * 0.1} y={sh.y - size * 0.55} width={tw + size * 0.2} height={size * 1.1} fill={paper} />
          <SvgText x={sh.x} y={sh.y} fill={ink} textAnchor="middle" dominantBaseline="middle" style={style}>{sh.text}</SvgText>
        </React.Fragment>,
      );
    }
  }

  return (
    <Svg width={w} height={h} viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}>
      {nodes}
    </Svg>
  );
}

// ---------- лист из тетради ----------

/**
 * Кремовый лист в клетку с мягкой тенью и полоской скотча. Клетка рисуется
 * в масштабе страницы (5 мм), а не плана — как у настоящей тетради.
 * `tilt` — наклон в градусах (на обложке лист лежит чуть криво, как приклеенный).
 */
/** Синий чертёжный лист (стиль blueprint): белые линии, тонкая белая рамка, без скотча. */
export const BLUEPRINT = {
  paper: "#1F3F7A",
  paperEdge: "#17305E",
  grid: "#FFFFFF",
  ink: "#FFFFFF",
  inkSoft: "#C7D4EA",
  cell: 14.17,
};

export type SheetLook = "notebook" | "blueprint";

export function NotebookSheet({
  width,
  height,
  tilt = 0,
  tape = true,
  padding = 10,
  look = "notebook",
  children,
}: {
  width: number;
  height: number;
  tilt?: number;
  tape?: boolean;
  padding?: number;
  look?: SheetLook;
  children?: React.ReactNode;
}) {
  const C = look === "blueprint" ? BLUEPRINT : NOTEBOOK;
  const cell = C.cell;
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const shadow = Math.max(2, Math.min(5, width / 60));
  const gridOpacity = look === "blueprint" ? 0.14 : 0.85;
  const showTape = tape && look === "notebook";
  return (
    <View
      style={{
        width: width + shadow,
        height: height + shadow,
        ...(tilt ? { transform: `rotate(${tilt}deg)` } : {}),
      }}
    >
      {/* Тень */}
      <View style={{ position: "absolute", left: shadow, top: shadow, width, height, backgroundColor: "#000000", opacity: 0.13 }} />
      {/* Бумага */}
      <View style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: C.paper, borderWidth: 0.5, borderColor: C.paperEdge }} />
      {/* Клетка */}
      <View style={{ position: "absolute", left: 0, top: 0, width, height }}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {Array.from({ length: cols }, (_, k) => (
            <Line key={`v${k}`} x1={k * cell + 3} y1={0} x2={k * cell + 3} y2={height} stroke={C.grid} strokeWidth={0.45} strokeOpacity={gridOpacity} />
          ))}
          {Array.from({ length: rows }, (_, k) => (
            <Line key={`h${k}`} x1={0} y1={k * cell + 3} x2={width} y2={k * cell + 3} stroke={C.grid} strokeWidth={0.45} strokeOpacity={gridOpacity} />
          ))}
          {look === "blueprint" && width > 100 && (
            <>
              <Rect x={5} y={5} width={width - 10} height={height - 10} fill="none" stroke={BLUEPRINT.ink} strokeWidth={0.6} strokeOpacity={0.7} />
              <Rect x={7.5} y={7.5} width={width - 15} height={height - 15} fill="none" stroke={BLUEPRINT.ink} strokeWidth={0.3} strokeOpacity={0.5} />
            </>
          )}
        </Svg>
      </View>
      {/* Содержимое */}
      <View style={{ position: "absolute", left: padding, top: padding, width: width - padding * 2, height: height - padding * 2 }}>
        {children}
      </View>
      {/* Скотч */}
      {showTape && (
        <View
          style={{
            position: "absolute",
            left: width / 2 - 24,
            top: -5,
            width: 48,
            height: 12,
            backgroundColor: NOTEBOOK.tape,
            opacity: 0.82,
            transform: "rotate(-3deg)",
          }}
        />
      )}
    </View>
  );
}

// ---------- обложка: все комнаты на одном листе ----------

export function SketchCoverHero({
  rooms,
  width,
  height,
  fonts,
  showArea,
  caption,
  tilt = -1.5,
}: {
  rooms: PdfRoom[];
  width: number;
  height: number;
  fonts: FontPair;
  showArea: boolean;
  caption?: string;
  tilt?: number;
}): React.ReactElement | null {
  const planned = rooms.filter((r) => r.plan);
  const n = planned.length;
  if (n === 0) return null;
  void fonts;

  const pad = 12;
  const innerW = width - pad * 2;
  const captionH = caption ? 18 : 0;
  const innerH = height - pad * 2 - captionH;
  const portrait = innerH > innerW * 1.15;
  const cols = n === 1 ? 1 : n === 2 ? (portrait ? 1 : 2) : n <= 4 ? 2 : n <= 6 ? (portrait ? 2 : 3) : portrait ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const labelH = 15;
  const cellW = innerW / cols, cellH = innerH / rows;
  const side = Math.max(24, Math.min(cellW, cellH - labelH) * (n === 1 ? 0.96 : 0.86));
  const labelSize = n > 4 ? 9.5 : n > 1 ? 11 : 13;

  return (
    <NotebookSheet width={width} height={height} tilt={tilt} padding={pad}>
      <View style={{ width: innerW, height: innerH, flexDirection: "row", flexWrap: "wrap", alignContent: "center", justifyContent: "center" }}>
        {planned.map((r) => (
          <View key={r.id} style={{ width: cellW, height: cellH, alignItems: "center", justifyContent: "center" }}>
            <SketchRoomPlan room={r.plan!} side={side} />
            <Text style={{ fontFamily: "Caveat", fontWeight: 700, fontSize: labelSize, color: NOTEBOOK.ink, marginTop: 1, maxWidth: cellW - 4 }}>
              {r.name}
              {showArea && r.area > 0 ? `, ${fmtArea(r.area)}` : ""}
            </Text>
          </View>
        ))}
      </View>
      {caption && (
        <Text style={{ fontFamily: "Caveat", fontWeight: 400, fontSize: 10.5, color: NOTEBOOK.inkSoft, textAlign: "right", marginTop: 2 }}>
          {caption}
        </Text>
      )}
    </NotebookSheet>
  );
}
