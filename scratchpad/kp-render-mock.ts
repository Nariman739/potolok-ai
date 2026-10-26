// Рендер КП на моковых данных без фото обложки — все темы (дефолтный стиль
// плана) + все три стиля плана на теме minimal. Для проверки глазами:
//   npx tsx --env-file=.env.local scratchpad/kp-render-mock.ts <out-dir>
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";
import { ALL_TEMPLATES } from "@/lib/kp/themes";
import { KP_PLAN_STYLES } from "@/lib/kp/types";
import fs from "node:fs";
async function main() {
  const out = process.argv[2];
  const jobs: Array<{ name: string; template: (typeof ALL_TEMPLATES)[number]; planStyle?: (typeof KP_PLAN_STYLES)[number]; summary?: boolean }> = [];
  for (const template of ALL_TEMPLATES) jobs.push({ name: template, template, summary: template === "bold-color" });
  for (const planStyle of KP_PLAN_STYLES) jobs.push({ name: `minimal-${planStyle}`, template: "minimal", planStyle });
  for (const j of jobs) {
    const config = getDefaultConfigForTemplate(j.template);
    if (j.planStyle) config.planStyle = j.planStyle;
    const data = await buildMockPdfData({ template: j.template, config, master: { coverPhotoUrl: "" } });
    if (j.summary) data.estimate.priceView = "summary";
    const buf = await renderToBuffer(KpDocument({ data }));
    fs.writeFileSync(`${out}/mock-${j.name}.pdf`, buf);
    console.log("ok", j.name, buf.length);
  }
}
main();
