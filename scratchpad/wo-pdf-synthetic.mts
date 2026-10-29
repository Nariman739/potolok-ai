// Синтетический наряд: Г-комната, ряд пар софитов вдоль стены + ряд одиночных, люстра, трек.
// npx tsx --tsconfig tsconfig.json scratchpad/wo-pdf-synthetic.mts out.pdf
import { writeFileSync } from "node:fs";
import { renderWorkOrderPdf } from "@/lib/work-order-pdf";
import { summarizeRoom, summaryLines, type PlanRoom } from "@/lib/work-order-plan";
import "@/lib/i18n/work-order";
import type { WorkOrderModel } from "@/lib/work-order-data";

const pair = (id: string, cx: number, cy: number, horizontal = true) => [
  { id: `${id}a`, type: "spot", x: horizontal ? cx - 5 : cx, y: horizontal ? cy : cy - 5, groupId: `pair-${id}` },
  { id: `${id}b`, type: "spot", x: horizontal ? cx + 5 : cx, y: horizontal ? cy : cy + 5, groupId: `pair-${id}` },
];

const elements = [
  // ряд пар вдоль верхней стены (y = 60), шаг 100
  ...pair("p1", 80, 60), ...pair("p2", 180, 60), ...pair("p3", 280, 60), ...pair("p4", 380, 60), ...pair("p5", 480, 60),
  // ряд одиночных по низу (y = 340), шаг 110
  { id: "s1", type: "spot", x: 70, y: 340 }, { id: "s2", type: "spot", x: 180, y: 340 }, { id: "s3", type: "spot", x: 290, y: 340 },
  // колонка в выступе (x = 500)
  { id: "c1", type: "spot", x: 500, y: 140 }, { id: "c2", type: "spot", x: 500, y: 300 },
  // люстра в центре, вертикальная пара отдельно
  { id: "ch", type: "chandelier", x: 250, y: 200 },
  { id: "v1", type: "vent", x: 80, y: 420 },
  ...pair("pv", 420, 200, false),
  // трек
  { id: "tr", type: "track", shape: "freeform", length: 300, points: [{ x: 100, y: 150 }, { x: 400, y: 150 }] },
];

// Г-комната: 566 × 466, вырез 166 × 120 внизу слева? Для простоты — прямоугольник с выступом.
const plan: PlanRoom = {
  walls: [566, 466, 166, 120, 400, 346],
  angles: null,
  normalCorners: [true, true, true, false, true, true],
  elements,
  wallProfiles: { "0": "shadow" },
};
const s = summarizeRoom(plan);
const model: WorkOrderModel = {
  lang: "ru",
  payLines: [],
  payGroups: [],
  url: null, currency: "KZT", company: "QA Потолки", title: "ул. Тестовая 1, кв. 7", when: "25 октября, 10:00",
  roomsCount: 1, totalArea: 24.4, installerName: "Бригада №1", clientName: "Рава", clientPhone: "+7 777 000 00 77",
  masterPhone: "+7 700 000 00 77", fee: "45 000 ₸", workshop: null,
  totals: summaryLines(s, "ru", { withWalls: false }), materials: [],
  rooms: [{ id: "r1", name: "Зал", area: 24.4, perimeter: 20.6, wallsCount: 6, plan, lines: summaryLines(s, "ru", { withWalls: true }) }],
};

async function main() {
  const buf = await renderWorkOrderPdf(model);
  writeFileSync(process.argv[2] ?? "scratchpad/wo-synthetic.pdf", buf);
  console.log("pdf bytes", buf.length, "lines", model.rooms[0].lines);
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
