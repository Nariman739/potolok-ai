// Заголовок группы/комнаты одиноко внизу страницы (13.11.2026). Один процесс — один формат.
// npx tsx scratchpad/pdf-orphan-check.tsx <outDir> <tag> <format> <template>
// Перебираем число комнат (копии комнат мока), ищем страницу, где последняя строка — заголовок комнаты.
import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";
import type { KpTemplateId } from "@/lib/kp/types";

const [out, tag, format, template] = process.argv.slice(2) as [string, string, "full" | "quick", KpTemplateId];
mkdirSync(out, { recursive: true });
const counts = (process.env.COUNTS ?? "4,5,6,7,8").split(",").map(Number);
// Сдвиг раскладки: в первой комнате k позиций (повтор позиций мока) — перебираем мелким шагом
const extras = (process.env.EXTRA ?? "0").split(",").map(Number);
(async () => {
  for (const n of counts) for (const k of extras) {
    const config = getDefaultConfigForTemplate(template);
    config.format = format;
    const data = await buildMockPdfData({ template, config });
    const base = data.estimate.rooms;
    const names = ["Гостиная", "Спальня", "Детская", "Кухня", "Коридор", "Ванная", "Кабинет", "Гардероб", "Балкон", "Прихожая", "Санузел", "Столовая"];
    data.estimate.rooms = Array.from({ length: n }, (_, i) => ({ ...base[i % base.length], name: names[i % names.length] }));
    const r0 = data.estimate.rooms[0];
    data.estimate.rooms[0] = { ...r0, items: [...r0.items, ...Array.from({ length: k }, (_, j) => ({ ...r0.items[j % r0.items.length] }))] };
    const buf = await renderToBuffer(KpDocument({ data }));
    const f = `${out}/${format}-${template}-${n}rooms-k${k}-${tag}`;
    writeFileSync(`${f}.pdf`, buf);
    const pages = execFileSync("pdftotext", ["-layout", `${f}.pdf`, "-"]).toString().split("\f").filter((p) => p.trim());
    const orphans: number[] = [];
    pages.forEach((p, pi) => {
      const lines = p.split("\n").map((l) => l.trim()).filter(Boolean)
        // подвалы: номер страницы и «Расчёт сделан в potolok.ai…» (набран вразрядку — сравниваем без пробелов)
        .filter((l) => { const t = l.replace(/\s+/g, ""); return !/^\d{2}\/\d{2}/.test(t) && !/potolok\.ai|публичнаяоферта/i.test(t); });
      const last = lines[lines.length - 1] ?? "";
      const t = last.replace(/\s+/g, "");
      // «Гостиная 165 980 ₸», «01 Гостиная…» (номер комнаты в полном КП), «+ ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» вразрядку
      if (names.some((nm) => new RegExp(`^\\d{0,2}${nm}`).test(t)) || /^\+?ДОПОЛНИТЕЛЬНЫЕРАБОТЫ/i.test(t)) orphans.push(pi + 1);
    });
    console.log(`${format} ${template} ${n} комнат +${k} поз.: страниц ${pages.length}, заголовок один внизу на стр.: ${orphans.join(",") || "нет"}`);
    for (const pg of orphans) execFileSync("pdftoppm", ["-png", "-r", "60", "-f", String(pg), "-l", String(pg), "-singlefile", `${f}.pdf`, `${f}-p${pg}`]);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
