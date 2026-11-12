// 3D у клиента без WebGL (12.11.2026): кадры /z и /kp/3d — обычный Chromium (WebGL есть) и без WebGL.
// node scratchpad/parity/shots-nogl.mjs <outDir> <base> <zShareId> <kpPublicId> [tag]
// /kp/3d открывать только у живых КП с геометрией: иначе редирект на /kp, а /kp шлёт мастеру пуш.
import { chromium } from "playwright";
const [out, base, zId, kpId, tag = "local"] = process.argv.slice(2);
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MODES = {
  gl: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  nogl: ["--disable-gpu", "--disable-software-rasterizer", "--disable-webgl", "--disable-webgl2"],
};
const only = process.env.MODES ? process.env.MODES.split(",") : Object.keys(MODES);
for (const mode of only) {
  const b = await chromium.launch({ args: MODES[mode] });
  for (const [key, path] of [["z", `/z/${zId}`], ["kp3d", `/kp/${kpId}/3d`]]) {
    for (const kind of ["phone", "desktop"]) {
      const ctx = await b.newContext(kind === "phone"
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PHONE_UA }
        : { viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
      p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 120)));
      const resp = await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      if (resp?.status() !== 200 || !p.url().endsWith(path)) throw new Error(`${path}: ${resp?.status()} ${p.url()}`);
      let state = "?";
      if (mode === "nogl") {
        await p.waitForSelector('[data-testid="no-webgl"]', { timeout: 30000 }).then(() => (state = "fallback"), () => (state = "НЕТ fallback"));
        await p.waitForTimeout(1500);
      } else {
        await p.waitForSelector("canvas", { timeout: 90000 });
        await p.waitForTimeout(kind === "phone" ? 15000 : 13000);
        state = (await p.locator('[data-testid="no-webgl"]').count()) ? "fallback?!" : "3D";
      }
      await p.screenshot({ path: `${out}/${key}-${kind}-${mode}-${tag}.png` });
      console.log(key, kind, mode, tag, state, "canvas:", await p.locator("canvas").count(), "errors:", errs.length, errs.slice(0, 2));
      await ctx.close();
    }
  }
  await b.close();
}
