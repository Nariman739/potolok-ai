// /kp/<publicId>/3d на десктопе с узким окном 390 (без мобильного UA): консоль, кадр.
import { chromium } from "playwright";
const [out, base, pub] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 760 } });
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 160)));
const r = await p.goto(`${base}/kp/${pub}/3d`, { waitUntil: "domcontentloaded", timeout: 120000 });
console.log("status", r?.status(), "url", p.url());
await p.waitForSelector("canvas", { timeout: 90000 });
await p.waitForTimeout(12000);
await p.screenshot({ path: `${out}/kp3d-desktop-390.png` });
const hasBack = await p.locator("text=К КП").count();
const beta = await p.locator("text=в разработке").count();
console.log("кнопка «К КП»:", hasBack, "подпись:", beta, "console errors:", errs.length, errs.slice(0, 4));
await b.close();
