// Одна реальная генерация «Фото клиенту» на локальной сборке ветки против прод-пайплайна
// (OpenRouter/Flux из .env.local), как делает сайт: /render-scene даёт beauty + маски
// (тот же AiSceneCapture), затем POST /api/visualizations (scene3d) → POST …/render.
// node ai-check.mjs <outDir> <base>   (outDir/old-snapshot.json — от qa-viz-old-dump.mjs)
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [out, base] = process.argv.slice(2);
const old = JSON.parse(readFileSync(`${out}/old-snapshot.json`, "utf8"));
const API = `${base}/api`;
// вход QA
let res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const cookie = res.headers.get("set-cookie")?.split(";")[0];
if (!cookie) { console.log("login failed", res.status); process.exit(1); }
const H = { "Content-Type": "application/json", Cookie: cookie };

// 1) кадры сцены той же комнаты, что в прошлой генерации
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1536, height: 1024 } });
await ctx.addInitScript((payload) => { window.__SNAPSHOT__ = payload; }, { snapshot: old.snapshot, presets: old.presets ?? { finish: "matte", colorId: "white", lightTempKey: old.lightTempKey ?? "neutral" } });
const p = await ctx.newPage();
await p.goto(`${base}/render-scene`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.__SCENE_READY__ === true || typeof window.__SCENE_ERROR__ === "string", null, { timeout: 180000 });
const err = await p.evaluate(() => window.__SCENE_ERROR__);
if (err) { console.log("scene error", err); process.exit(1); }
const frames = await p.evaluate(() => window.__captureFrames());
await b.close();
const save = (name, dataUrl) => { const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl); writeFileSync(`${out}/${name}.${m[1] === "jpeg" ? "jpg" : "png"}`, Buffer.from(m[2], "base64")); };
save("стало-beauty", frames.beauty); save("стало-ceilingMask", frames.ceilingMask); save("стало-floatingMask", frames.floatingMask);
console.log("frames", frames.width, "x", frames.height);

// 2) визуализация + рендер (платный вызов — один)
const sn = old.snapshot;
res = await fetch(`${API}/visualizations`, { method: "POST", headers: H, body: JSON.stringify({
  sourceType: "scene3d", sceneDataUrl: frames.beauty, ceilingMaskDataUrl: frames.ceilingMask, floatingMaskDataUrl: frames.floatingMask,
  elements: sn.elements, finish: old.presets?.finish ?? "matte", colorHex: old.colorHex ?? "#F3F3F1", colorName: old.colorName ?? "белый",
  kelvin: old.kelvin ?? 4000, lightTempKey: old.lightTempKey ?? "neutral", lightTempPromptHint: old.lightTempPromptHint,
  linkedVariants: [], floorPresetId: old.floorPresetId, floorPromptDesc: old.floorPromptDesc, wallPresetId: old.wallPresetId, wallPromptDesc: old.wallPromptDesc,
}) });
const created = await res.json();
console.log("visualization:", res.status, created.id ?? created);
if (!created.id) process.exit(1);
const t0 = Date.now();
res = await fetch(`${API}/visualizations/${created.id}/render`, { method: "POST", headers: H, body: "{}" });
const r = await res.json();
console.log("render:", res.status, Math.round((Date.now() - t0) / 1000) + "s", r.render?.url ?? JSON.stringify(r).slice(0, 200));
if (r.render?.url) {
  const img = Buffer.from(await (await fetch(r.render.url)).arrayBuffer());
  writeFileSync(`${out}/стало-ai.jpg`, img);
  console.log("saved стало-ai.jpg", img.length);
}
// 3) удалить копию по id
res = await fetch(`${API}/visualizations/${created.id}`, { method: "DELETE", headers: H });
console.log("delete:", res.status);
