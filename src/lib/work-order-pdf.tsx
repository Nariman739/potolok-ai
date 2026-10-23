/**
 * PDF наряда монтажнику (16.10.2026): те же чертежи с расстановкой, что на
 * странице /n/[token], но файлом — мастер кидает его бригаде в WhatsApp.
 * Фигуры плана строит buildRoomPlan, здесь они рисуются примитивами @react-pdf.
 */
import React from "react";
import { Document, Page, View, Text, StyleSheet, Svg, Path, Polygon, Polyline, Line, Circle, Text as SvgText, renderToBuffer } from "@react-pdf/renderer";
import { ensureFontsRegistered } from "@/lib/kp/pdf/fonts";
import { tFor } from "@/lib/i18n";
import { buildRoomPlan, type RoomPlan } from "@/lib/work-order-plan";
import type { WorkOrderModel } from "@/lib/work-order-data";

const NAVY = "#1e3a5f";
const PLAN = 230; // pt — сторона квадрата плана

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
          case "polyline": return <Polyline key={i} points={sh.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={sh.stroke} strokeWidth={sh.sw} strokeLinecap="round" strokeLinejoin="round" />;
          case "circle": return <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={sh.fill} stroke={sh.stroke === "none" ? undefined : sh.stroke} strokeWidth={sh.sw} />;
          case "text": return (
            // Шрифт у svg-Text в react-pdf задаётся через style; в типах этих полей нет
            <SvgText key={i} x={sh.x} y={sh.y} fill={sh.fill} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: sh.size, fontFamily: "Inter", fontWeight: sh.weight >= 600 ? 600 : 400 } as unknown as Record<string, never>}>
              {sh.text}
            </SvgText>
          );
        }
      })}
    </Svg>
  );
}

function LegendSwatch({ color, kind }: { color: string; kind: "dot" | "ring" | "pair" | "line" | "dash" }) {
  if (kind === "line" || kind === "dash") {
    return (
      <Svg width={14} height={6} viewBox="0 0 14 6">
        <Line x1={0} y1={3} x2={14} y2={3} stroke={color} strokeWidth={2} strokeDasharray={kind === "dash" ? "3 2" : undefined} />
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
    .map((r, i) => ({ r, i, plan: r.lines.length > 0 ? buildRoomPlan(r.plan, model.lang, 320, { dims: true }) : null }))
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

      {dimPages.map(({ r, i, plan }) => (
        <Page key={`dims-${r.id}`} size="A4" style={s.page}>
          <Text style={s.eyebrow}>{t("wo.dimsTitle")} · {model.title}</Text>
          <Text style={s.h1}>{i + 1}. {r.name}</Text>
          <Text style={s.sub}>{r.area} м² · {t("wo.perimeter")} {r.perimeter} м · {r.wallsCount} {t("wo.walls")}</Text>
          <View style={{ marginTop: 6, alignItems: "center" }}>
            <PlanSvg plan={plan} side={BIG} />
          </View>
          {plan.legend.length > 0 && (
            <View style={[s.legend, { width: BIG, alignSelf: "center" }]}>
              {plan.legend.map((l) => (
                <View key={l.key} style={s.legendItem}>
                  <LegendSwatch color={l.color} kind={l.kind} />
                  <Text style={[s.legendText, { marginLeft: 3 }]}>{l.key}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ marginTop: 6 }}>
            {r.lines.map((l) => <Text key={l} style={s.li}>• {l}</Text>)}
          </View>
          <Text style={s.hint}>{t("wo.dimsHint")}</Text>
          <View style={s.footer} fixed>
            <Text>{t("wo.pdfFooter", { date: new Date().toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) })}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
