// Кадры «было (прод) → стало (локально)» для /z/<shareId>: телефон 390 и десктоп 1280,
// плюс грубый бенч FPS (rAF за 4 с, тот же headless SwiftShader для обеих сторон).
// node scratchpad/parity/shots-ab.mjs <outDir> <shareId> <localBase>
import { chromium } from "playwright";
const [out, shareId, localBase] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
async function run(base, tag, kind) {
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
  await p.screenshot({ path: `${out}/${tag}-${kind}-v1.png` });
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(Math.round(n / 4)); }; requestAnimationFrame(tick); }));
  // второй ракурс — поворот влево
  const vp = p.viewportSize(); const cx = vp.width / 2, cy = vp.height / 2;
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let k = 1; k <= 10; k++) { await p.mouse.move(cx - (vp.width * 0.45 * k) / 10, cy); await p.waitForTimeout(30); }
  await p.mouse.up(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${tag}-${kind}-v2.png` });
  console.log(tag, kind, "fps≈" + fps, "errors:", errs.length, errs.slice(0, 3));
  await ctx.close();
}
for (const kind of ["phone", "desktop"]) { if (process.env.ONLY_LOCAL) { await run(localBase, process.env.TAG || "стало", kind); continue; }
  await run("https://potolok.ai", "было", kind);
  await run(localBase, "стало", kind);
}
await b.close();
