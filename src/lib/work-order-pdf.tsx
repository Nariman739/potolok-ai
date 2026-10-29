/**
 * PDF наряда монтажнику (16.10.2026): те же чертежи с расстановкой, что на
 * странице /n/[token], но файлом — мастер кидает его бригаде в WhatsApp.
 * Фигуры плана строит buildRoomPlan, здесь они рисуются примитивами @react-pdf.
 */
import React from "react";
import { Document, Page, View, Text, StyleSheet, Svg, Path, Polygon, Polyline, Line, Circle, Rect, Text as SvgText, renderToBuffer } from "@react-pdf/renderer";
import { ensureFontsRegistered } from "@/lib/kp/pdf/fonts";
import { tFor } from "@/lib/i18n";
import { buildRoomPlan, type RoomPlan, type Legend } from "@/lib/work-order-plan";
import type { WorkOrderModel } from "@/lib/work-order-data";

const NAVY = "#1e3a5f";
const PLAN = 230; // pt — сторона квадрата плана
// Карандашная страница чертежа
const PAPER = "#fbfaf3";
const INK = "#2f2f35";
const INK_SOFT = "#5b5b63";

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 36, fontFamily: "Inter", fontSize: 9.5, color: "#0f172a" },
  eyebrow: { fontSize: 7.5, color: "#64748b", letterSpacing: 1.2, textTransform: "uppercase" },
  h1: { fontSize: 18, fontWeight: 800, marginTop: 2, color: NAVY },
  when: { fontSize: 12, fontWeight: 600, color: "#ea580c", marginTop: 2 },
  sub: { color: "#475569", marginTop: 2 },
  card: { borderWidth: 0.8, borderColor: "#cbd5e1", borderRadius: 6, padding: 9, marginTop: 10 },
  cardTitle: { fontSize: 11, fontWeight: 800, marginBottom: 4, color: NAVY },
  row: { flexDirection: "row", marginBottom: 2 },
  k: { color: "#64748b", width: 110 },
  cols: { flexDirection: "row" },
  col: { flex: 1, paddingRight: 8 },
  li: { marginBottom: 2 },
  hint: { fontSize: 8, color: "#64748b", marginTop: 8, marginBottom: 4 },
  roomCard: { borderWidth: 0.8, borderColor: "#cbd5e1", borderRadius: 6, padding: 9, marginTop: 8, flexDirection: "row" },
  roomInfo: { flex: 1, paddingLeft: 10 },
  roomName: { fontSize: 12, fontWeight: 800, marginBottom: 2 },
  roomMeta: { color: "#475569", marginBottom: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, width: PLAN },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 8, marginBottom: 2 },
  legendText: { fontSize: 7.5, color: "#475569" },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#94a3b8" },
  // Оплата монтажнику построчно (29.10.2026)
  payRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 3, paddingBottom: 3 },
  payRoom: { fontSize: 7.5, color: "#94a3b8" },
  payQty: { width: 150, textAlign: "right", color: "#64748b", paddingRight: 8 },
  paySum: { width: 80, textAlign: "right", fontWeight: 600 },
  payTotalRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1.2, borderTopColor: "#cbd5e1", paddingTop: 4, marginTop: 2 },
});

function PlanSvg({ plan, side = PLAN }: { plan: RoomPlan; side?: number }) {
  const { size, shapes } = plan;
  return (
    <Svg width={side} height={side} viewBox={`0 0 ${size} ${size}`}>
      {shapes.map((sh, i) => {
        switch (sh.k) {
          case "path": return <Path key={i} d={sh.d} fill={sh.fill} stroke={sh.stroke} strokeWidth={sh.sw} />;
          case "polygon": return <Polygon key={i} points={sh.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill={sh.fill} stroke={sh.stroke} strokeWidth={sh.sw} />;
          case "line": return <Line key={i} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke={sh.stroke} strokeWidth={sh.sw} strokeDasharray={sh.dash} strokeLinecap={sh.round ? "round" : "butt"} />;
          case "polyline": return <Polyline key={i} points={sh.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={sh.stroke} strokeWidth={sh.sw} strokeDasharray={sh.dash} strokeLinecap="round" strokeLinejoin="round" />;
          case "circle": return <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={sh.fill} stroke={sh.stroke === "none" ? undefined : sh.stroke} strokeWidth={sh.sw} />;
          case "text": {
            // Шрифт у svg-Text в react-pdf задаётся через style; в типах этих полей нет.
            // Подложка под цифрой (чтобы клетка не лезла под текст) — прямоугольник цвета бумаги.
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

const PLAN_TOP = 104; // pt — верх плана на карандашной странице (под заголовком)
const A4_W = 595.28, A4_H = 841.89;

/**
 * Клетка тетради на всю страницу, в масштабе комнаты и выровненная с планом:
 * линия каждые 10 см, жирнее каждые 50 см. План лежит абсолютно в (left, top).
 */
function PageGrid({ plan, left, top, side }: { plan: RoomPlan; left: number; top: number; side: number }) {
  const k = side / plan.size;
  const step = 10 * plan.frame.scale * k; // pt на 10 см
  if (step < 2) return null;
  const x0 = left + plan.frame.ox * k; // где x = 0 см
  const y0 = top + plan.frame.oy * k;
  const lines: React.ReactElement[] = [];
  const iMin = Math.ceil(-x0 / step), iMax = Math.floor((A4_W - x0) / step);
  for (let i = iMin; i <= iMax; i++) {
    const X = x0 + i * step;
    const major = i % 5 === 0;
    lines.push(<Line key={`x${i}`} x1={X} y1={0} x2={X} y2={A4_H} stroke={major ? "#c3d0de" : "#dde5ee"} strokeWidth={major ? 0.9 : 0.5} />);
  }
  const jMin = Math.ceil(-y0 / step), jMax = Math.floor((A4_H - y0) / step);
  for (let j = jMin; j <= jMax; j++) {
    const Y = y0 + j * step;
    const major = j % 5 === 0;
    lines.push(<Line key={`y${j}`} x1={0} y1={Y} x2={A4_W} y2={Y} stroke={major ? "#c3d0de" : "#dde5ee"} strokeWidth={major ? 0.9 : 0.5} />);
  }
  // Svg сам по себе не позиционируется — оборачиваем в View, иначе он
  // занимает всю страницу в потоке и выталкивает содержимое на следующую.
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: A4_W, height: A4_H }} fixed>
      <Svg width={A4_W} height={A4_H} viewBox={`0 0 ${A4_W} ${A4_H}`}>
        {lines}
      </Svg>
    </View>
  );
}

function LegendSwatch({ color, kind, dash, double, mul, paper }: { color: string; kind: Legend["kind"]; dash?: string; double?: boolean; mul?: number; paper?: string }) {
  if (kind === "line" || kind === "dash") {
    const sw = 2 * (mul ?? 1);
    return (
      <Svg width={18} height={8} viewBox="0 0 18 8">
        <Line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={double ? sw * 1.6 : sw} strokeDasharray={kind === "dash" ? "3 2" : dash ? dash.split(" ").map((n) => (Number(n) * 0.45).toFixed(2)).join(" ") : undefined} />
        {double && <Line x1={0} y1={4} x2={18} y2={4} stroke={paper ?? "#fff"} strokeWidth={sw * 0.6} />}
      </Svg>
    );
  }
  if (kind === "vent" || kind === "chand") {
    return (
      <Svg width={10} height={10} viewBox="0 0 10 10">
        <Circle cx={5} cy={5} r={4} fill="#fff" stroke={color} strokeWidth={1.3} />
        <Circle cx={5} cy={5} r={1.6} fill={kind === "chand" ? color : "#fff"} stroke={color} strokeWidth={1} />
      </Svg>
    );
  }
  if (kind === "pair") {
    return (
      <Svg width={16} height={8} viewBox="0 0 16 8">
        <Circle cx={4} cy={4} r={3} fill="#fff" stroke={color} strokeWidth={1.5} />
        <Circle cx={12} cy={4} r={3} fill="#fff" stroke={color} strokeWidth={1.5} />
      </Svg>
    );
  }
  return (
    <Svg width={8} height={8} viewBox="0 0 8 8">
      <Circle cx={4} cy={4} r={3} fill={kind === "dot" ? color : "#fff"} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

/** Собрать PDF наряда: регистрация шрифтов и рендер — в одном модуле, одной копией react-pdf. */
export async function renderWorkOrderPdf(model: WorkOrderModel): Promise<Buffer> {
  ensureFontsRegistered();
  return renderToBuffer(WorkOrderPdf({ model }));
}

export function WorkOrderPdf({ model }: { model: WorkOrderModel }) {
  ensureFontsRegistered();
  const t = tFor(model.lang);
  const plans = model.rooms.map((r) => buildRoomPlan(r.plan, model.lang, 320));
  const half = Math.ceil(model.totals.length / 2);
  // Чертёж для монтажа (23.10.2026): отдельная страница на комнату, где есть
  // свет/элементы — большой план с размерными цепочками до каждого светильника.
  const BIG = 523; // pt — ширина A4 минус поля
  const dimPages = model.rooms
    .map((r, i) => ({ r, i, plan: r.lines.length > 0 ? buildRoomPlan(r.plan, model.lang, 320, { dims: true, pencil: true, grid: false }) : null }))
    .filter((p): p is { r: typeof model.rooms[number]; i: number; plan: RoomPlan } => !!p.plan);

  return (
    <Document title={`${t("wo.title")} · ${model.title}`} author={model.company}>
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>{t("wo.title")} · {model.company}</Text>
        <Text style={s.h1}>{model.title}</Text>
        {model.when && <Text style={s.when}>{model.when}</Text>}
        <Text style={s.sub}>
          {model.roomsCount} {t("wo.rooms")} · {model.totalArea} м²{model.installerName ? ` · ${t("wo.install")}: ${model.installerName}` : ""}
        </Text>

        <View style={s.card}>
          {model.clientName && <View style={s.row}><Text style={s.k}>{t("wo.client")}:</Text><Text>{model.clientName}</Text></View>}
          {model.clientPhone && <View style={s.row}><Text style={s.k}>{t("wo.clientPhone")}:</Text><Text>{model.clientPhone}</Text></View>}
          {model.masterPhone && <View style={s.row}><Text style={s.k}>{t("wo.questions")}:</Text><Text>{model.masterPhone} ({model.company})</Text></View>}
          {model.fee && <View style={s.row}><Text style={s.k}>{t("wo.fee")}:</Text><Text style={{ fontWeight: 800 }}>{model.fee}</Text></View>}
          {model.workshop && <Text style={{ color: "#64748b", marginTop: 2 }}>{model.workshop}</Text>}
        </View>

        {/* За что платят — построчно (29.10.2026) */}
        {model.payLines.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t("wo.payTitle")}</Text>
            {model.payLines.map((l, i) => (
              <View key={i} style={s.payRow}>
                <View style={{ flex: 1 }}>
                  <Text>{l.name}</Text>
                  {l.room ? <Text style={s.payRoom}>{l.room}</Text> : null}
                </View>
                <Text style={s.payQty}>{l.qty} {l.unit} × {l.price}</Text>
                <Text style={s.paySum}>{l.total}</Text>
              </View>
            ))}
            <View style={s.payTotalRow}>
              <Text style={{ flex: 1, fontWeight: 800 }}>{t("wo.payTotal")}</Text>
              <Text style={{ fontSize: 12, fontWeight: 800 }}>{model.fee}</Text>
            </View>
          </View>
        )}

        {model.totals.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t("wo.totalsTitle")}</Text>
            <View style={s.cols}>
              <View style={s.col}>{model.totals.slice(0, half).map((l) => <Text key={l} style={s.li}>• {l}</Text>)}</View>
              <View style={s.col}>{model.totals.slice(half).map((l) => <Text key={l} style={s.li}>• {l}</Text>)}</View>
            </View>
          </View>
        )}

        {model.materials.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t("wo.materialsTitle")}</Text>
            <View style={s.cols}>
              {[0, 1].map((c) => (
                <View key={c} style={s.col}>
                  {model.materials.filter((_, i) => i % 2 === c).map((m) => (
                    <Text key={m.code} style={s.li}>• {m.name} — {Number.isInteger(m.quantity) ? m.quantity : m.quantity.toFixed(1)} {m.unit}</Text>
                  ))}
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 7.5, color: "#94a3b8", marginTop: 3 }}>{t("wo.materialsHint")}</Text>
          </View>
        )}

        <Text style={s.hint}>{t("wo.planHint")}</Text>

        {model.rooms.map((r, i) => {
          const plan = plans[i];
          return (
            <View key={r.id} style={s.roomCard} wrap={false}>
              <View>
                {plan ? <PlanSvg plan={plan} /> : <View style={{ width: PLAN, height: 40 }} />}
                {plan && plan.legend.length > 0 && (
                  <View style={s.legend}>
                    {plan.legend.map((l) => (
                      <View key={l.key} style={s.legendItem}>
                        <LegendSwatch color={l.color} kind={l.kind} />
                        <Text style={[s.legendText, { marginLeft: 3 }]}>{l.key}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={s.roomInfo}>
                <Text style={s.roomName}>{i + 1}. {r.name}</Text>
                <Text style={s.roomMeta}>{r.area} м² · {t("wo.perimeter")} {r.perimeter} м · {r.wallsCount} {t("wo.walls")}</Text>
                {r.lines.length > 0
                  ? r.lines.map((l) => <Text key={l} style={s.li}>• {l}</Text>)
                  : <Text style={{ color: "#94a3b8" }}>{t("wo.noLights")}</Text>}
              </View>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text>{t("wo.pdfFooter", { date: new Date().toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) })}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Страница чертежа — «тетрадь в клеточку, карандашом»: бумага, клетка, графит (Нариман 23.10.2026) */}
      {dimPages.map(({ r, i, plan }) => (
        <Page key={`dims-${r.id}`} size="A4" style={[s.page, { backgroundColor: PAPER, color: INK }]}>
          <PageGrid plan={plan} left={36} top={PLAN_TOP} side={BIG} />
          <View style={{ backgroundColor: PAPER, alignSelf: "flex-start", paddingRight: 10, paddingBottom: 4 }}>
            <Text style={[s.eyebrow, { color: INK_SOFT }]}>{t("wo.dimsTitle")} · {model.title}</Text>
            <Text style={[s.h1, { color: INK }]}>{i + 1}. {r.name}</Text>
            <Text style={[s.sub, { color: INK_SOFT }]}>{r.area} м² · {t("wo.perimeter")} {r.perimeter} м · {r.wallsCount} {t("wo.walls")}</Text>
          </View>
          <View style={{ position: "absolute", left: 36, top: PLAN_TOP }}>
            <PlanSvg plan={plan} side={BIG} />
          </View>
          <View style={{ height: PLAN_TOP + BIG - 96 }} />
          <View style={{ backgroundColor: PAPER, padding: 6, marginHorizontal: -6 }}>
            {plan.legend.length > 0 && (
              <View style={[s.legend, { width: BIG }]}>
                {plan.legend.map((l) => (
                  <View key={l.key} style={s.legendItem}>
                    <LegendSwatch color={l.color} kind={l.kind} dash={l.dash} double={l.double} mul={l.mul} paper={PAPER} />
                    <Text style={[s.legendText, { marginLeft: 3, color: INK_SOFT }]}>{l.key}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{ marginTop: 6 }}>
              {r.lines.map((l) => <Text key={l} style={[s.li, { color: INK }]}>• {l}</Text>)}
            </View>
            <Text style={[s.hint, { color: INK_SOFT }]}>{t("wo.dimsHint")}</Text>
          </View>
          <View style={s.footer} fixed>
            <Text>{t("wo.pdfFooter", { date: new Date().toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) })}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
