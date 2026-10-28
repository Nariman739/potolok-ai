// Заливка библиотеки фото КП: ~/Desktop/kp-фото/<папка>/*.jpg → Vercel Blob + KpLibraryPhoto.
//   npx tsx --env-file=.env.local scratchpad/kp-library-upload.ts [папка …]
// Папка → тип: FOLDER_TO_KIND (src/lib/kp/kinds.ts). Повторный запуск не дублирует:
// ключ — sha1 содержимого (в source). Картинки ужимаются до 1600 px по длинной стороне.
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { FOLDER_TO_KIND } from "@/lib/kp/kinds";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.join(os.homedir(), "Desktop", "kp-фото");

async function main() {
  const only = process.argv.slice(2);
  const folders = fs.readdirSync(ROOT).filter((f) => fs.statSync(path.join(ROOT, f)).isDirectory() && (only.length === 0 || only.includes(f)));
  const existing = new Set((await prisma.kpLibraryPhoto.findMany({ select: { source: true } })).map((r) => r.source ?? ""));
  let added = 0, skipped = 0;
  for (const folder of folders) {
    const kind = FOLDER_TO_KIND[folder];
    if (!kind) { console.log("?? папка без типа:", folder); continue; }
    const files = fs.readdirSync(path.join(ROOT, folder)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
    for (const f of files) {
      const src = path.join(ROOT, folder, f);
      const sha = createHash("sha1").update(fs.readFileSync(src)).digest("hex").slice(0, 16);
      const source = `desktop:${folder}/${f}#${sha}`;
      if (existing.has(source)) { skipped++; continue; }
      // ужать: sips -Z 1600 → во временный файл (jpeg)
      const tmp = path.join(os.tmpdir(), `kp-lib-${sha}.jpg`);
      // sips -Z растягивает маленькие картинки до 1600 — ужимаем только большие
      const srcDims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src]).toString();
      const srcMax = Math.max(Number(/pixelWidth: (\d+)/.exec(srcDims)?.[1]), Number(/pixelHeight: (\d+)/.exec(srcDims)?.[1]));
      const resize = srcMax > 1600 ? ["-Z", "1600"] : [];
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", ...resize, src, "--out", tmp], { stdio: "ignore" });
      const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", tmp]).toString();
      const width = Number(/pixelWidth: (\d+)/.exec(dims)?.[1]), height = Number(/pixelHeight: (\d+)/.exec(dims)?.[1]);
      const blob = await put(`kp-library/${kind}/${sha}.jpg`, fs.readFileSync(tmp), { access: "public", contentType: "image/jpeg", addRandomSuffix: false });
      await prisma.kpLibraryPhoto.create({ data: { kind, url: blob.url, width, height, source, sortOrder: added } });
      existing.add(source);
      added++;
      console.log("+", kind, f, `${width}×${height}`, blob.url);
    }
  }
  const counts = await prisma.kpLibraryPhoto.groupBy({ by: ["kind"], _count: { _all: true }, where: { active: true } });
  console.log({ added, skipped }, Object.fromEntries(counts.map((c) => [c.kind, c._count._all])));
  await prisma.$disconnect();
}
main();
