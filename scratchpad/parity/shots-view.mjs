// Кадр /z/<shareId> с поворотом камеры: протяжка мышью на dx/dy долей ширины/высоты
// (dx>0 — вправо, dy>0 — вниз). Телефон 390 и десктоп 1280.
// node scratchpad/parity/shots-view.mjs <outDir> <shareId> <base> <tag> <dx> <dy>
import { chromium } from "playwright";
const [out, shareId, base, tag, dxS, dyS] = process.argv.slice(2);
const dx = Number(dxS ?? 0), dy = Number(dyS ?? 0);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
for (const kind of ["phone", "desktop"]) {
  const ctx = await b.newContext(kind === "phone"
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PHONE_UA }
    : { viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 140)));
  await p.goto(`${base}/z/${shareId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector("canvas", { timeout: 90000 });
  await p.waitForTimeout(kind === "phone" ? 14000 : 12000);
  const vp = p.viewportSize(); const cx = vp.width / 2, cy = vp.height / 2;
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let k = 1; k <= 10; k++) { await p.mouse.move(cx + (vp.width * dx * k) / 10, cy + (vp.height * dy * k) / 10); await p.waitForTimeout(30); }
  await p.mouse.up(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${tag}-${kind}.png` });
  console.log(tag, kind, "errors:", errs.length, errs.slice(0, 3));
  await ctx.close();
}
await b.close();
