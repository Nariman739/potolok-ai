// Кадры веб-3D сайта (прод) для QA-комнаты: /z/<shareId> — то, что видит клиент по ссылке.
// node web-shots.mjs <outDir> <shareId>
import { chromium, devices } from "playwright";
const [out, shareId] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const url = `https://potolok.ai/z/${shareId}`;
async function shoot(ctxOpts, name, drags) {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 160)));
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector("canvas", { timeout: 60000 });
  await p.waitForTimeout(12000);
  await p.screenshot({ path: `${out}/${name}-v1.png` });
  let i = 2;
  const vp = p.viewportSize();
  for (const [dx, dy] of drags) {
    const cx = vp.width / 2, cy = vp.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    for (let k = 1; k <= 10; k++) { await p.mouse.move(cx + (dx * k) / 10, cy + (dy * k) / 10); await p.waitForTimeout(30); }
    await p.mouse.up();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-v${i}.png` });
    i++;
  }
  console.log(name, "done; console errors:", errs.length, errs.slice(0, 5));
  await ctx.close();
}

await shoot({ viewport: { width: 1280, height: 800 } }, "web-desktop", [[-300, 0], [-300, 0]]);
await b.close();
