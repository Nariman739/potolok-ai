// Длинное название компании в PDF КП (13.11.2026). Один процесс — один вид КП (renderToBuffer
// зависает после ~10 рендеров в процессе). npx tsx scratchpad/pdf-company-check.tsx <outDir> <tag> <format> <template>
// Рендер в файл локально, никому не отправляется. Страницы: 1 (обложка/шапка) и 2 (подвал с брендом).
import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";
import type { KpTemplateId } from "@/lib/kp/types";

const [out, tag, format, template] = process.argv.slice(2) as [string, string, "full" | "quick", KpTemplateId];
mkdirSync(out, { recursive: true });
// Топ реальных (длина 32, слово без пробелов 26, почта 28) + синтетика на 57 символов
const NAMES: Record<string, string> = {
  real32: "АСП Архитектура света и потолков",
  nospace: "Shanyrak_natyajnoi_potolok",
  email: "Nursultansarsenov@iCloud.com",
  long57: "ИП Натяжные потолки и освещение «Небо над головой» Астана",
};
(async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#E83E8C"/><circle cx="300" cy="300" r="250" fill="#fff"/></svg>`;
  const logoUrl = `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
  const only = process.env.NAMES?.split(",");
  for (const [key, companyName] of Object.entries(NAMES).filter(([k]) => !only || only.includes(k))) {
    const config = getDefaultConfigForTemplate(template);
    config.format = format;
    const data = await buildMockPdfData({ template, config, master: { logoUrl, companyName } });
    const buf = await renderToBuffer(KpDocument({ data }));
    const base = `${out}/${format}-${template}-${key}-${tag}`;
    writeFileSync(`${base}.pdf`, buf);
    execFileSync("pdftoppm", ["-png", "-r", "70", "-f", "1", "-l", format === "full" ? "2" : "1", `${base}.pdf`, base]);
    console.log("ok", format, template, key);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
