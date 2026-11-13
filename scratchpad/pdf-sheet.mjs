// Склейка кадров: для каждого вида — 4 названия в ряд (страница 1 и, у full, страница 2 снизу).
import sharp from "sharp";
import { readdirSync } from "node:fs";
const [dir, tag, outDir] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith(".png") && f.includes(`-${tag}-`));
const groups = {};
for (const f of files) {
  const m = f.match(/^(full|quick)-(.+)-(real32|nospace|email|long57)-[a-z]+-(\d+)\.png$/);
  if (!m) continue;
  const key = `${m[1]}-${m[2]}-p${Number(m[4])}`;
  (groups[key] ??= {})[m[3]] = `${dir}/${f}`;
}
for (const [key, g] of Object.entries(groups)) {
  const order = ["real32", "nospace", "email", "long57"].filter((k) => g[k]);
  const imgs = await Promise.all(order.map((k) => sharp(g[k]).resize({ width: 420 }).toBuffer({ resolveWithObject: true })));
  const h = Math.max(...imgs.map((i) => i.info.height));
  const canvas = sharp({ create: { width: 420 * imgs.length + 10 * (imgs.length - 1), height: h, channels: 3, background: "#888" } });
  await canvas.composite(imgs.map((i, n) => ({ input: i.data, left: n * 430, top: 0 }))).png().toFile(`${outDir}/sheet-${key}-${tag}.png`);
}
console.log(Object.keys(groups).length, "листов");
