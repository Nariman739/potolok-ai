// Ревью 30.10.2026: PDF наряда для старого объекта (aluminum_insert) — строка «Вставка» и рендер без ошибок.
// env $(grep -E '^DATABASE_URL' .env.local | xargs) npx tsx --tsconfig tsconfig.json scratchpad/wo-pdf-legacy-insert.mts <objectId> <out.pdf>
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { loadWorkOrderById, buildWorkOrderModel } from "@/lib/work-order-data";
import { renderWorkOrderPdf } from "@/lib/work-order-pdf";

const [id, out] = process.argv.slice(2);
const o = await prisma.measurementObject.findUnique({ where: { id }, select: { masterId: true } });
if (!o) throw new Error("object not found");
const obj = await loadWorkOrderById(id, [o.masterId]);
if (!obj) throw new Error("not loaded");
const model = await buildWorkOrderModel(obj);
console.log("totals:", model.totals);
for (const r of model.rooms) console.log(r.name, "→", r.lines.filter((l) => /Вставка|Профиль/.test(l)));
const pdf = await renderWorkOrderPdf(model);
writeFileSync(out, pdf);
console.log("pdf bytes:", pdf.length);
await prisma.$disconnect();
