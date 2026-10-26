import React from "react";
import { Svg, Path, Polygon, Polyline, Line, Circle, Rect, Text as SvgText } from "@react-pdf/renderer";
import { buildRoomPlan, type PlanRoom, type RoomPlan } from "@/lib/work-order-plan";

/**
 * План комнаты для клиента в КП (26.10.2026).
 *
 * У 290 из 303 КП за месяц есть замеренная геометрия комнат, а фото на
 * обложке — у 48: без фото обложка была пустым листом. Теперь главная
 * картинка КП — план квартиры по замеру в фирменном цвете мастера: контур,
 * софиты, люстра, гардины, трек. Клиент видит «это моя квартира, это
 * считали для меня», а не прайс из интернета.
 *
 * Фигуры строит buildRoomPlan из наряда монтажнику (режим `client`: без букв
 * углов, длин элементов и легенды профилей), здесь они рисуются примитивами
 * @react-pdf. Один стиль и на обложке, и в составе работ.
 */

export type PlanColors = {
  /** Контур стен, люстра, трек, световая линия */
  accent: string;
  /** Софиты, гардины, подписи */
  ink: string;
  /** Фон под планом — им же заливаются кружки светильников и подложки цифр */
  paper: string;
  /** Без заливки комнаты (классика: серая заливка выглядела как disabled) */
  noFill?: boolean;
};

/** Смешать два hex-цвета: t = 0 → a, t = 1 → b. 8-значный hex с альфой в Svg react-pdf не надёжен. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return a;
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "");
  if (!/^[0-9a-f]{6}/i.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

/**
 * Фигуры плана → примитивы @react-pdf. Подписи — Inter (есть у всех тем, цифры мелкие).
 * `crop` — обрезать квадрат плана по габаритам комнаты: вытянутая комната
 * вписывается в `side` по длинной стороне, пустого поля сверху/снизу нет.
 */
export function PlanShapes({ plan, side, crop = false }: { plan: RoomPlan; side: number; crop?: boolean }) {
  const { size, shapes, bbox } = plan;
  const ar = crop ? bbox.w / bbox.h : 1;
  const w = ar >= 1 ? side : side * ar;
  const h = ar >= 1 ? side / ar : side;
  const viewBox = crop ? `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}` : `0 0 ${size} ${size}`;
  return (
    <Svg width={w} height={h} viewBox={viewBox}>
      {shapes.map((sh, i) => {
        switch (sh.k) {
          case "path": return <Path key={i} d={sh.d} fill={sh.fill} stroke={sh.stroke} strokeWidth={sh.sw} strokeLinejoin="round" />;
          case "polygon": return <Polygon key={i} points={sh.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill={sh.fill} stroke={sh.stroke} strokeWidth={sh.sw} strokeLinejoin="round" />;
          case "line": return <Line key={i} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke={sh.stroke} strokeWidth={sh.sw} strokeDasharray={sh.dash} strokeLinecap={sh.round ? "round" : "butt"} />;
          case "polyline": return <Polyline key={i} points={sh.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={sh.stroke} strokeWidth={sh.sw} strokeDasharray={sh.dash} strokeLinecap="round" strokeLinejoin="round" />;
          case "circle": return <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={sh.fill} stroke={sh.stroke === "none" ? undefined : sh.stroke} strokeWidth={sh.sw} />;
          case "text": {
            const style = { fontSize: sh.size, fontFamily: "Inter", fontWeight: sh.weight >= 600 ? 600 : 400 } as unknown as Record<string, never>;
            const tw = sh.text.length * sh.size * 0.58;
            return (
              <React.Fragment key={i}>
                {sh.halo && sh.haloColor && (
                  <Rect x={sh.x - tw / 2 - sh.size * 0.15} y={sh.y - sh.size * 0.62} width={tw + sh.size * 0.3} height={sh.size * 1.24} fill={sh.haloColor} />
                )}
                <SvgText x={sh.x} y={sh.y} fill={sh.fill} textAnchor="middle" dominantBaseline="middle" style={style}>
                  {sh.text}
                </SvgText>
              </React.Fragment>
            );
          }
        }
      })}
    </Svg>
  );
}

/** Один план комнаты в клиентском стиле. `dims` — подписи длин стен в метрах (только «Подробно»). */
export function ClientRoomPlan({
  room,
  side,
  colors,
  dims = false,
}: {
  room: PlanRoom;
  side: number;
  colors: PlanColors;
  dims?: boolean;
}): React.ReactElement | null {
  // Чем меньше план на странице, тем толще линии относительно комнаты:
  // 84pt → ×2.1, 230pt → ×1 (иначе софиты превращались в точки).
  const boost = Math.min(2.6, Math.max(1, (320 / side) * 0.55));
  const plan = buildRoomPlan(room, "ru", 320, {
    client: { accent: colors.accent, ink: colors.ink, paper: colors.paper, fill: colors.noFill ? "none" : mixHex(colors.accent, colors.paper, 0.92) },
    labels: dims ? "walls-m" : undefined,
    boost,
  });
  if (!plan) return null;
  return <PlanShapes plan={plan} side={side} crop />;
}
