// Логотип в PDF КП: пропорции (12.11.2026). npx tsx scratchpad/pdf-logo-check.tsx <outDir> <tag>
// Рендерит стр. 1 КП (full — 4 дизайна с логотипом; quick — все 5) с тремя логотипами:
// квадрат 600×600, вертикальный 450×600, широкий 1200×300. В каждом — круг: сплющивание видно сразу.
import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";
import type { KpTemplateId } from "@/lib/kp/types";

const [out, tag] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
async function logo(w: number, h: number): Promise<string> {
  const r = Math.min(w, h) * 0.42;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#E83E8C"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#FFFFFF"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${r * 0.5}" fill="#1e3a5f"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
(async () => {
  const logos = { square: await logo(600, 600), tall: await logo(450, 600), wide: await logo(1200, 300) };
  const ONLY = process.env.ONLY?.split(","); const NAMES = process.env.NAMES?.split(",");
  const runs0: Array<[KpTemplateId, "full" | "quick"]> = [
    ["minimal", "full"], ["premium-dark", "full"], ["warm-handmade", "full"], ["classic-architectural", "full"], ["bold-color", "full"],
    ["minimal", "quick"], ["premium-dark", "quick"], ["warm-handmade", "quick"], ["classic-architectural", "quick"], ["bold-color", "quick"],
  ];
  const runs = ONLY ? runs0.filter(([t, f]) => ONLY.includes(`${f}-${t}`)) : runs0;
  for (const [template, format] of runs) {
    for (const [name, url] of Object.entries(logos).filter(([n]) => !NAMES || NAMES.includes(n))) {
      const config = getDefaultConfigForTemplate(template);
      config.format = format;
      const data = await buildMockPdfData({ template, config, master: { logoUrl: url } });
      const buf = await renderToBuffer(KpDocument({ data }));
      const base = `${out}/${format}-${template}-${name}-${tag}`;
      writeFileSync(`${base}.pdf`, buf);
      execFileSync("pdftoppm", ["-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", `${base}.pdf`, base]);
      console.log("ok", format, template, name);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
