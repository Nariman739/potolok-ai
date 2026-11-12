// Сценарии сторожа WebGL (ревью 8d, 12.11.2026). ТОЛЬКО локально (на проде прогоны без GPU шумят в Sentry).
// node scratchpad/parity/nogl-scenarios.mjs <base> <zShareId> <outDir>
// A) фоновая вкладка 20 с: visibilityState=hidden + колбэки ResizeObserver задержаны (как в настоящем
//    фоне — r3f не создаёт рендерер) → вернулись в visible → 3D, запасного экрана нет;
// B) WebGL2 «пропал» → запасной экран → вернули → «Попробовать ещё раз» → 3D;
// C) проба прошла, а рендерер не создался (все следующие getContext → null) → через 10 с видимого времени экран;
// D) свернули (hidden) → контекст потерян → 20 с в фоне → вернулись, восстановился за 1 с → 3D остаётся.
import { chromium } from "playwright";
const [base, zId, out] = process.argv.slice(2);
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
const INIT = () => {
  // управляемая видимость
  window.__vis = "visible";
  Object.defineProperty(document, "visibilityState", { get: () => window.__vis, configurable: true });
  Object.defineProperty(document, "hidden", { get: () => window.__vis !== "visible", configurable: true });
  window.__setVis = (v) => { window.__vis = v; document.dispatchEvent(new Event("visibilitychange")); if (v === "visible") window.__flushRO?.(); };
  // ResizeObserver: в фоне колбэки копятся
  const RO = window.ResizeObserver; const queued = [];
  window.ResizeObserver = class extends RO {
    constructor(cb) { super((entries, obs) => (window.__vis === "visible" ? cb(entries, obs) : queued.push(() => cb(entries, obs)))); }
  };
  window.__flushRO = () => { while (queued.length) queued.shift()(); };
  // управляемый WebGL
  window.__noGL = false; window.__probeOnly = false; let calls = 0;
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/.test(String(type))) { calls++; if (window.__noGL) return null; if (window.__probeOnly && calls > 1) return null; }
    return orig.call(this, type, ...rest);
  };
};
const b = await chromium.launch({ args: GL });
const state = async (p) => ({ fallback: await p.locator('[data-testid="no-webgl"]').count(), canvas: await p.locator("canvas").count() });
async function page(setup) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(INIT);
  if (setup) await ctx.addInitScript(setup);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  return { p, ctx, errs };
}
const res = [];
{ // A
  const { p, ctx, errs } = await page(() => { window.__vis = "hidden"; });
  await p.goto(`${base}/z/${zId}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(20000);
  const bg = await state(p);
  await p.evaluate(() => window.__setVis("visible"));
  await p.waitForTimeout(14000);
  const fg = await state(p);
  await p.screenshot({ path: `${out}/A-фон-20с-вернулись.png` });
  res.push(["A фон 20 с → visible", bg, fg, fg.fallback === 0 && fg.canvas === 1 ? "OK" : "FAIL", errs.length]);
  await ctx.close();
}
{ // B
  const { p, ctx, errs } = await page(() => { window.__noGL = true; });
  await p.goto(`${base}/z/${zId}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="no-webgl"]', { timeout: 30000 });
  await p.screenshot({ path: `${out}/B-без-webgl-экран.png` });
  const s1 = await state(p);
  await p.evaluate(() => { window.__noGL = false; });
  await p.getByRole("button", { name: "Попробовать ещё раз" }).click();
  await p.waitForSelector("canvas", { timeout: 60000 }); await p.waitForTimeout(12000);
  const s2 = await state(p);
  await p.screenshot({ path: `${out}/B-повтор-3d.png` });
  res.push(["B нет WebGL → повтор", s1, s2, s1.fallback === 1 && s2.fallback === 0 && s2.canvas === 1 ? "OK" : "FAIL", errs.length]);
  await ctx.close();
}
{ // C
  const { p, ctx, errs } = await page(() => { window.__probeOnly = true; });
  await p.goto(`${base}/z/${zId}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  const s1 = await state(p);
  await p.waitForSelector('[data-testid="no-webgl"]', { timeout: 30000 }).catch(() => {});
  const s2 = await state(p);
  res.push(["C проба ок, рендерер нет → 10 с", s1, s2, s1.fallback === 0 && s2.fallback === 1 ? "OK" : "FAIL", errs.length]);
  await ctx.close();
}
{ // D
  const { p, ctx, errs } = await page();
  await p.goto(`${base}/z/${zId}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("canvas"); await p.waitForTimeout(8000);
  await p.evaluate(() => { window.__setVis("hidden"); const c = document.querySelector("canvas"); window.__ext = c.getContext("webgl2").getExtension("WEBGL_lose_context"); window.__ext.loseContext(); });
  await p.waitForTimeout(20000);
  const s1 = await state(p);
  await p.evaluate(() => { window.__setVis("visible"); setTimeout(() => window.__ext.restoreContext(), 1000); });
  await p.waitForTimeout(6000);
  const s2 = await state(p);
  res.push(["D свернули, контекст потерян 20 с → вернулись", s1, s2, s1.fallback === 0 && s2.fallback === 0 ? "OK" : "FAIL", errs.length]);
  await ctx.close();
}
for (const r of res) console.log(r[0], "| до:", JSON.stringify(r[1]), "| после:", JSON.stringify(r[2]), "|", r[3], "| pageerrors", r[4]);
await b.close();
