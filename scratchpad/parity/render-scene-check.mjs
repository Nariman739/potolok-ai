// Проверка /render-scene (воркер «Фото клиенту»): кладём снапшот QA-комнаты как воркер
// (window.__SNAPSHOT__ до загрузки), ждём __SCENE_READY__, снимаем __captureFrames() →
// beauty + маска потолка + маска парящего. node render-scene-check.mjs <outDir> <base>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [out, base] = process.argv.slice(2);
const snapshot = {
  vertices: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }, { x: 0, y: 0 }],
  ceilingHeight: 270,
  wallProfiles: { 1: "floating", 3: "shadow" }, insertColor: "black", wallFurniture: [{ wall: 0, color: "wood" }],
  elements: [
    { id: "l2", type: "level2", shape: "freeform", closed: true, length: 940, points: [{ x: 100, y: 80 }, { x: 400, y: 80 }, { x: 400, y: 320 }, { x: 100, y: 320 }], level2: { shelfCm: 10, dropCm: 10, led: true, radiusCm: 20, closed: true } },
    { id: "s1", type: "spot", x: 55, y: 45 }, { id: "s2", type: "spot", x: 445, y: 45 },
    { id: "s3", type: "spot", x: 55, y: 355 }, { id: "s4", type: "spot", x: 445, y: 355 },
    { id: "ch", type: "chandelier", x: 250, y: 200 },
    { id: "ll", type: "lightline", shape: "freeform", closed: false, length: 260, points: [{ x: 50, y: 70 }, { x: 50, y: 330 }] },
    { id: "cu", type: "curtain", wallIndex: 2, wallPosition: 0.5, length: 300, rows: 2, color: "black" },
    { id: "tr", type: "track", shape: "freeform", closed: false, length: 260, trackType: "track_magnetic", points: [{ x: 450, y: 70 }, { x: 450, y: 330 }] },
    { id: "dr", type: "door", wallIndex: 3, wallPosition: 0.3, length: 80 },
    { id: "wn", type: "window", wallIndex: 1, wallPosition: 0.5, length: 150 },
    { id: "f1", type: "furniture", furnitureType: "sofa", x: 250, y: 345, width: 200, height: 90, rotation: 0 },
  ],
};
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1536, height: 1024 } });
await ctx.addInitScript((snap) => { window.__SNAPSHOT__ = { snapshot: snap, presets: { finish: "matte", colorId: "white", lightTempKey: "neutral" } }; }, snapshot);
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 160)));
await p.goto(`${base}/render-scene`, { waitUntil: "domcontentloaded", timeout: 120000 });
const t0 = Date.now();
await p.waitForFunction(() => window.__SCENE_READY__ === true || typeof window.__SCENE_ERROR__ === "string", null, { timeout: 180000 });
const err = await p.evaluate(() => window.__SCENE_ERROR__);
console.log("scene ready in", Math.round((Date.now() - t0) / 1000), "s; error:", err ?? "нет");
if (!err) {
  const frames = await p.evaluate(() => window.__captureFrames());
  for (const k of ["beauty", "ceilingMask", "floatingMask"]) {
    const d = frames[k];
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(d);
    writeFileSync(`${out}/render-${k}.${m[1] === "jpeg" ? "jpg" : "png"}`, Buffer.from(m[2], "base64"));
  }
  console.log("frames", frames.width, "x", frames.height, "stats", JSON.stringify(await p.evaluate(() => window.__SCENE_STATS__)));
}
console.log("console errors:", errs.length, errs.slice(0, 4));
await b.close();
