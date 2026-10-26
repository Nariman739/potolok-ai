import React from "react";
import { View, Text, Svg, Path, Circle, Line } from "@react-pdf/renderer";
import type { PlanRoom } from "@/lib/work-order-plan";
import type { RoomElement } from "@/lib/room-types";
import type { PdfData, PdfRoom } from "../pdf-data";
import type { KpPlanStyle } from "../types";
import { planStyleFor } from "../themes";
import { roomBoundsCm, tidyPlanForClientEx } from "../plan-tidy";
import { fmtArea } from "./shared";
import { ClientRoomPlan, type PlanColors } from "./ClientPlan";
import { BLUEPRINT, NOTEBOOK, NotebookSheet, SketchRoomPlan } from "./SketchPlan";

/**
 * Три стиля плана по замеру в КП (26.10.2026), выбор мастера в Брендинге,
 * дефолт — от темы:
 *  - notebook  → SketchPlan: карандаш на листе в клетку, подписи Caveat;
 *  - drawing   → ClientPlan: ровные линии в цвете обложки, без подложки;
 *  - blueprint → ClientPlan белым на синем чертёжном листе.
 * Во всех стилях софиты перед рендером «прибираются» (plan-tidy); если
 * комнату пришлось раскладывать сеткой — на листе подпись «схематично».
 *
 * Обложка: все комнаты в ОДНОМ масштабе (детская 12 м² меньше гостиной
 * 22 м², как в жизни), ряды упакованы по высоте, внизу легенда значков.
 */

export function kpPlanStyle(data: PdfData): KpPlanStyle {
  return planStyleFor(data.config, data.theme);
}

export function hasPlans(rooms: PdfRoom[]): boolean {
  return rooms.some((r) => r.plan);
}

type TidyRoom = { id: string; name: string; area: number; plan: PlanRoom; gridded: boolean; w: number; h: number };

function tidyRooms(rooms: PdfRoom[]): TidyRoom[] {
  const out: TidyRoom[] = [];
  for (const r of rooms) {
    if (!r.plan) continue;
    const t = tidyPlanForClientEx(r.plan);
    const b = roomBoundsCm(t.room);
    if (!b) continue;
    out.push({ id: r.id, name: r.name, area: r.area, plan: t.room, gridded: t.gridded, w: b.w, h: b.h });
  }
  return out;
}

/** Есть ли в КП комната, где софиты разложены сеткой (для сноски в составе работ). */
export function anyGridded(rooms: PdfRoom[]): boolean {
  return rooms.some((r) => r.plan && tidyPlanForClientEx(r.plan).gridded);
}

export const SCHEMATIC_NOTE = "Расстановка светильников на плане схематична, точные места уточняются перед монтажом";

// ---------- общий масштаб и раскладка ----------

/** Доля стороны Svg, которую занимает сама комната (поле bbox вокруг плана без подписей). */
const ROOM_FILL = 0.92;

function layoutRooms(rooms: TidyRoom[], innerW: number, innerH: number, labelH: number, gap: number) {
  const n = rooms.length;
  let best = { cols: 1, scale: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (innerW - gap * (cols - 1)) / cols;
    const rowH = (innerH - gap * (rows - 1)) / rows - labelH;
    if (cellW <= 0 || rowH <= 0) continue;
    const scale = Math.min(...rooms.map((r) => Math.min((cellW * ROOM_FILL) / r.w, (rowH * ROOM_FILL) / r.h)));
    if (scale > best.scale) best = { cols, scale };
  }
  const cellW = (innerW - gap * (best.cols - 1)) / best.cols;
  // Сторона Svg = длинная сторона комнаты в масштабе, с полем bbox
  const sides = rooms.map((r) => Math.max(20, (Math.max(r.w, r.h) * best.scale) / ROOM_FILL));
  return { cols: best.cols, cellW, sides };
}

// ---------- легенда ----------

type LegendKind = "spot" | "chandelier" | "pendant" | "vent" | "track" | "lightline" | "curtain" | "subcurtain";
const LEGEND_LABEL: Record<LegendKind, string> = {
  spot: "софит",
  chandelier: "люстра",
  pendant: "подвес",
  vent: "вытяжка",
  track: "трек",
  lightline: "световая линия",
  curtain: "гардина",
  subcurtain: "подшторник",
};
const LEGEND_ORDER: LegendKind[] = ["spot", "chandelier", "pendant", "vent", "track", "lightline", "curtain", "subcurtain"];

function legendKinds(rooms: TidyRoom[]): LegendKind[] {
  const set = new Set<LegendKind>();
  for (const r of rooms) {
    for (const e of (Array.isArray(r.plan.elements) ? r.plan.elements : []) as RoomElement[]) {
      const t = String(e.type);
      if (t === "builtin_gardina" || t === "shower_curtain") set.add("curtain");
      else if ((LEGEND_ORDER as string[]).includes(t)) set.add(t as LegendKind);
    }
  }
  return LEGEND_ORDER.filter((k) => set.has(k));
}

function LegendIcon({ kind, color, sketch }: { kind: LegendKind; color: string; sketch: boolean }) {
  const s = 11;
  const c = s / 2;
  const sw = sketch ? 0.9 : 0.8;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {kind === "spot" && <Circle cx={c} cy={c} r={2.6} fill="none" stroke={color} strokeWidth={sw} />}
      {kind === "chandelier" && (
        <>
          <Circle cx={c} cy={c} r={2.4} fill="none" stroke={color} strokeWidth={sw} />
          {sketch ? (
            [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
              const a = (k * Math.PI) / 4 + 0.2;
              return <Line key={k} x1={c + Math.cos(a) * 3.2} y1={c + Math.sin(a) * 3.2} x2={c + Math.cos(a) * 4.8} y2={c + Math.sin(a) * 4.8} stroke={color} strokeWidth={0.7} />;
            })
          ) : (
            <Circle cx={c} cy={c} r={0.9} fill={color} />
          )}
        </>
      )}
      {kind === "pendant" && (
        <>
          <Circle cx={c} cy={c} r={2.8} fill="none" stroke={color} strokeWidth={sw} />
          <Circle cx={c} cy={c} r={1} fill={color} />
        </>
      )}
      {kind === "vent" && (
        <>
          <Circle cx={c} cy={c} r={3.2} fill="none" stroke={color} strokeWidth={sw} />
          <Circle cx={c} cy={c} r={1.6} fill="none" stroke={color} strokeWidth={sw * 0.8} />
        </>
      )}
      {kind === "track" && (
        <>
          <Line x1={1} y1={c - 1.3} x2={s - 1} y2={c - 1.3} stroke={color} strokeWidth={sw} />
          <Line x1={1} y1={c + 1.3} x2={s - 1} y2={c + 1.3} stroke={color} strokeWidth={sw} />
        </>
      )}
      {kind === "lightline" && <Line x1={1} y1={c} x2={s - 1} y2={c} stroke={color} strokeWidth={sw} strokeDasharray="2.2 1.3" />}
      {kind === "curtain" &&
        (sketch ? (
          <Path d={`M 1 ${c} Q 2.5 ${c - 2} 4 ${c} Q 5.5 ${c + 2} 7 ${c} Q 8.5 ${c - 2} 10 ${c}`} fill="none" stroke={color} strokeWidth={sw} />
        ) : (
          <Line x1={1} y1={c} x2={s - 1} y2={c} stroke={color} strokeWidth={sw} />
        ))}
      {kind === "subcurtain" && <Line x1={1} y1={c} x2={s - 1} y2={c} stroke={color} strokeWidth={sw} strokeDasharray="0.8 1.4" />}
    </Svg>
  );
}

function Legend({ kinds, color, sketch, fontFamily, size }: { kinds: LegendKind[]; color: string; sketch: boolean; fontFamily: string; size: number }) {
  if (kinds.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
      {kinds.map((k) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", marginRight: 7, marginBottom: 1 }}>
          <LegendIcon kind={k} color={color} sketch={sketch} />
          <Text style={{ fontFamily, fontSize: size, color, marginLeft: 2.5, ...(sketch ? {} : { letterSpacing: 0.6, textTransform: "uppercase" as const }) }}>{LEGEND_LABEL[k]}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- обложка ----------

export function KpPlanHero({
  data,
  width,
  height,
  tilt = -1.5,
  drawing,
}: {
  data: PdfData;
  width: number;
  height: number;
  /** Наклон листа (тетрадь/blueprint) */
  tilt?: number;
  /** Цвета для стиля «Чертёж» — зависят от обложки темы */
  drawing: PlanColors;
}): React.ReactElement | null {
  const style = kpPlanStyle(data);
  const rooms = tidyRooms(data.estimate.rooms);
  if (rooms.length === 0) return null;
  const showArea = data.estimate.priceView !== "summary";
  const gridded = rooms.some((r) => r.gridded);
  const caption = gridded ? "План по замеру · расстановка света схематична" : "План по замеру";
  const kinds = legendKinds(rooms);
  const sketch = style === "notebook";
  const fontFamily = sketch ? "Caveat" : data.fonts.body.family;
  const ink = style === "notebook" ? NOTEBOOK.ink : style === "blueprint" ? BLUEPRINT.ink : drawing.ink;
  const inkSoft = style === "notebook" ? NOTEBOOK.inkSoft : style === "blueprint" ? BLUEPRINT.inkSoft : drawing.ink;

  const pad = style === "drawing" ? 0 : 12;
  const innerW = width - pad * 2;
  const legendH = kinds.length > 0 ? (sketch ? 14 : 12) : 0;
  const captionH = sketch ? 14 : 11;
  const innerH = height - pad * 2 - legendH - captionH;
  const n = rooms.length;
  const labelSize = sketch ? (n > 4 ? 9.5 : n > 1 ? 11 : 13) : n > 4 ? 6.5 : 7.5;
  const labelH = labelSize + 4;
  const { cols, cellW, sides } = layoutRooms(rooms, innerW, innerH, labelH, 6);

  // Внешний View центрует ряды по вертикали (alignContent у react-pdf для
  // одной строки не работает — планы прилипали к верху листа)
  const grid = (
    <View style={{ width: innerW, height: innerH, justifyContent: "center" }}>
    <View style={{ width: innerW, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
      {rooms.map((r, i) => (
        <View key={r.id} style={{ width: cellW, alignItems: "center", justifyContent: "flex-end", marginBottom: i < n - cols ? 6 : 0 }}>
          {style === "notebook" ? (
            <SketchRoomPlan room={r.plan} side={sides[i]} />
          ) : (
            <ClientRoomPlan room={r.plan} side={sides[i]} colors={style === "blueprint" ? { accent: BLUEPRINT.ink, ink: BLUEPRINT.ink, paper: BLUEPRINT.paper } : drawing} />
          )}
          <Text
            style={{
              fontFamily,
              fontWeight: sketch ? 700 : 400,
              fontSize: labelSize,
              color: ink,
              marginTop: sketch ? 0 : 2,
              maxWidth: cellW - 4,
              ...(sketch ? {} : { letterSpacing: 1, textTransform: "uppercase" as const }),
            }}
          >
            {r.name}
            {showArea && r.area > 0 ? `${sketch ? ", " : " · "}${fmtArea(r.area)}` : ""}
          </Text>
        </View>
      ))}
    </View>
    </View>
  );
  const footer = (
    <>
      <View style={{ height: legendH, justifyContent: "center" }}>
        <Legend kinds={kinds} color={inkSoft} sketch={sketch} fontFamily={fontFamily} size={sketch ? 9 : 5.5} />
      </View>
      <Text
        style={{
          fontFamily,
          fontSize: sketch ? 10 : 6.5,
          color: inkSoft,
          textAlign: sketch ? "right" : "center",
          ...(sketch ? {} : { letterSpacing: 1.4, textTransform: "uppercase" as const }),
        }}
      >
        {caption}
      </Text>
    </>
  );

  if (style === "drawing") {
    return (
      <View style={{ width, height }}>
        {grid}
        {footer}
      </View>
    );
  }
  return (
    <NotebookSheet width={width} height={height} tilt={tilt} padding={pad} look={style === "blueprint" ? "blueprint" : "notebook"}>
      {grid}
      {footer}
    </NotebookSheet>
  );
}

// ---------- состав работ: карточка комнаты ----------

/**
 * Плитка комнаты в составе работ. Без длин стен: в 92pt цифры выходили 3–4pt
 * и не читались на телефоне, а план ужимался вдвое — размеры теперь текстом
 * в шапке комнаты (roomDimsText).
 */
export function KpRoomPlanCard({ data, room, side }: { data: PdfData; room: PlanRoom; side: number }): React.ReactElement | null {
  const style = kpPlanStyle(data);
  const tidy = tidyPlanForClientEx(room).room;
  const { theme } = data;

  if (style === "drawing") {
    return <ClientRoomPlan room={tidy} side={side - 6} colors={{ accent: theme.palette.accent, ink: theme.palette.pageText, paper: theme.palette.pageBg }} />;
  }
  const look = style === "blueprint" ? "blueprint" : "notebook";
  return (
    <NotebookSheet width={side} height={side} padding={6} tape={false} look={look}>
      <View style={{ width: side - 12, height: side - 12, alignItems: "center", justifyContent: "center" }}>
        {style === "blueprint" ? (
          <ClientRoomPlan room={tidy} side={side - 16} colors={{ accent: BLUEPRINT.ink, ink: BLUEPRINT.ink, paper: BLUEPRINT.paper }} />
        ) : (
          <SketchRoomPlan room={tidy} side={side - 14} />
        )}
      </View>
    </NotebookSheet>
  );
}
