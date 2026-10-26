import React from "react";
import { View, Text } from "@react-pdf/renderer";
import type { PlanRoom } from "@/lib/work-order-plan";
import type { PdfData, PdfRoom } from "../pdf-data";
import type { KpPlanStyle } from "../types";
import { planStyleFor } from "../themes";
import { tidyPlanForClient } from "../plan-tidy";
import { fmtArea } from "./shared";
import { ClientRoomPlan, CoverPlanHero, type PlanColors } from "./ClientPlan";
import { BLUEPRINT, NotebookSheet, SketchCoverHero, SketchRoomPlan } from "./SketchPlan";

/**
 * Три стиля плана по замеру в КП (26.10.2026), выбор мастера в Брендинге,
 * дефолт — от темы:
 *  - notebook  → SketchPlan: карандаш на листе в клетку;
 *  - drawing   → ClientPlan: ровные линии в фирменном цвете без подложки;
 *  - blueprint → ClientPlan белым на синем чертёжном листе.
 * Во всех стилях софиты перед рендером «прибираются» (plan-tidy).
 */

export function kpPlanStyle(data: PdfData): KpPlanStyle {
  return planStyleFor(data.config, data.theme);
}

/** Комнаты с прибранными софитами — для всех стилей сразу. */
function tidyRooms(rooms: PdfRoom[]): PdfRoom[] {
  return rooms.map((r) => (r.plan ? { ...r, plan: tidyPlanForClient(r.plan) } : r));
}

export function hasPlans(rooms: PdfRoom[]): boolean {
  return rooms.some((r) => r.plan);
}

// ---------- обложка ----------

export function KpPlanHero({
  data,
  width,
  height,
  tilt = -1.5,
  drawing,
  caption,
}: {
  data: PdfData;
  width: number;
  height: number;
  /** Наклон листа (тетрадь/blueprint) */
  tilt?: number;
  /** Цвета для стиля «Чертёж» — зависят от обложки темы */
  drawing: PlanColors;
  caption?: string;
}): React.ReactElement | null {
  const style = kpPlanStyle(data);
  const rooms = tidyRooms(data.estimate.rooms);
  const showArea = data.estimate.priceView !== "summary";
  if (!hasPlans(rooms)) return null;

  if (style === "notebook") {
    return <SketchCoverHero rooms={rooms} width={width} height={height} fonts={data.fonts} showArea={showArea} caption={caption} tilt={tilt} />;
  }
  if (style === "blueprint") {
    return <BlueprintCoverHero rooms={rooms} width={width} height={height} fonts={data.fonts} showArea={showArea} caption={caption} tilt={tilt} />;
  }
  return <CoverPlanHero rooms={rooms} width={width} height={height} colors={drawing} fonts={data.fonts} showArea={showArea} caption={caption} />;
}

function BlueprintCoverHero({
  rooms,
  width,
  height,
  fonts,
  showArea,
  caption,
  tilt,
}: {
  rooms: PdfRoom[];
  width: number;
  height: number;
  fonts: PdfData["fonts"];
  showArea: boolean;
  caption?: string;
  tilt: number;
}) {
  const planned = rooms.filter((r) => r.plan);
  const n = planned.length;
  const pad = 14;
  const innerW = width - pad * 2;
  const captionH = caption ? 14 : 0;
  const innerH = height - pad * 2 - captionH;
  const portrait = innerH > innerW * 1.15;
  const cols = n === 1 ? 1 : n === 2 ? (portrait ? 1 : 2) : n <= 4 ? 2 : n <= 6 ? (portrait ? 2 : 3) : portrait ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const labelH = 14;
  const cellW = innerW / cols, cellH = innerH / rows;
  const side = Math.max(24, Math.min(cellW, cellH - labelH) * (n === 1 ? 0.94 : 0.84));
  const colors: PlanColors = { accent: BLUEPRINT.ink, ink: BLUEPRINT.ink, paper: BLUEPRINT.paper };
  return (
    <NotebookSheet width={width} height={height} tilt={tilt} padding={pad} look="blueprint">
      <View style={{ width: innerW, height: innerH, flexDirection: "row", flexWrap: "wrap", alignContent: "center", justifyContent: "center" }}>
        {planned.map((r) => (
          <View key={r.id} style={{ width: cellW, height: cellH, alignItems: "center", justifyContent: "center" }}>
            <ClientRoomPlan room={r.plan!} side={side} colors={colors} />
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: n > 4 ? 6.5 : 7.5,
                color: BLUEPRINT.ink,
                marginTop: 2,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                maxWidth: cellW - 4,
              }}
            >
              {r.name}
              {showArea && r.area > 0 ? ` · ${fmtArea(r.area)}` : ""}
            </Text>
          </View>
        ))}
      </View>
      {caption && (
        <Text style={{ fontFamily: fonts.body.family, fontSize: 6, color: BLUEPRINT.inkSoft, letterSpacing: 1.6, textTransform: "uppercase", textAlign: "right", marginTop: 3 }}>
          {caption}
        </Text>
      )}
    </NotebookSheet>
  );
}

// ---------- состав работ: карточка комнаты ----------

export function KpRoomPlanCard({
  data,
  room,
  side,
  dims,
}: {
  data: PdfData;
  room: PlanRoom;
  side: number;
  dims: boolean;
}): React.ReactElement | null {
  const style = kpPlanStyle(data);
  const tidy = tidyPlanForClient(room);
  const { theme } = data;

  if (style === "drawing") {
    return (
      <ClientRoomPlan
        room={tidy}
        side={side - 8}
        colors={{ accent: theme.palette.accent, ink: theme.palette.pageText, paper: theme.palette.pageBg }}
        dims={dims}
      />
    );
  }
  const look = style === "blueprint" ? "blueprint" : "notebook";
  return (
    <NotebookSheet width={side} height={side} padding={5} tape={false} look={look}>
      <View style={{ width: side - 10, height: side - 10, alignItems: "center", justifyContent: "center" }}>
        {style === "blueprint" ? (
          <ClientRoomPlan room={tidy} side={side - 14} colors={{ accent: BLUEPRINT.ink, ink: BLUEPRINT.ink, paper: BLUEPRINT.paper }} dims={dims} />
        ) : (
          <SketchRoomPlan room={tidy} side={side - 12} dims={dims} />
        )}
      </View>
    </NotebookSheet>
  );
}
