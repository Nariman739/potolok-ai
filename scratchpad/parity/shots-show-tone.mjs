// Тон показа у клиента (12.11.2026): кадры «до (прод) → после (локально)».
// node scratchpad/parity/shots-show-tone.mjs <outDir> <localBase> <qaRoomScript>
// Пароль QA берётся из qa-room.mjs (в чат не печатать).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [out, localBase, qaScript] = process.argv.slice(2);
const PASS = readFileSync(qaScript, "utf8").match(/password:\s*"([^"]+)"/)[1];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const CASES = (process.env.CASES || "z-rect,z-l2,kp3d,dash").split(",");
const PATHS = {
  "z-rect": "/z/ftjBv5A3",
  "z-l2": "/z/DfsYcbCH",
  // живая КП QA (пустая комната 4 стены); у удалённых/без геометрии /kp/3d → 404 или
  // редирект на /kp (а /kp шлёт пуш мастеру «КП открыли» — такие не открывать)
  "kp3d": "/kp/065f7c05-0f84-4a45-9494-2ed24b419240/3d",
  // дашборд: конструктор замера (ничего не сохраняет) — комната 500×400 с цифровой клавиатуры, люстра, «3D»
  "dash": "/dashboard/vision-test",
};
async function run(base, tag, kind, key) {
  const ctx = await b.newContext(kind === "phone"
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PHONE_UA }
    : { viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 140)));
  if (key.startsWith("dash")) {
    const r = await p.request.post(`${base}/api/auth/login`, { data: { phone: "+77000000077", password: PASS } });
    if (!r.ok()) throw new Error("login " + r.status());
  }
  const resp = await p.goto(`${base}${PATHS[key]}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (!key.startsWith("dash") && (resp?.status() !== 200 || !p.url().includes(PATHS[key]))) throw new Error(`${key}: ${resp?.status()} ${p.url()}`);
  const posts = [];
  p.on("request", (r) => { if (r.method() !== "GET" && !r.url().includes("/auth/login")) posts.push(r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  if (key.startsWith("dash")) {
    await p.waitForTimeout(6000);
    await p.getByText("Добавить помещение").click();
    await p.waitForTimeout(1500);
    const k = async (c) => { await p.locator("button", { hasText: new RegExp("^" + c + "$") }).first().click(); await p.waitForTimeout(150); };
    for (const w of ["500", "400", "500", "400"]) { for (const c of w) await k(c); await k("✓"); await p.waitForTimeout(800); }
    await p.waitForTimeout(1500);
    await p.locator("button", { hasText: /^Добавить помещение$/ }).first().click();
    await p.waitForTimeout(3000);
    await p.locator("button", { hasText: /Люстра/ }).first().click();
    await p.waitForTimeout(1000);
    await p.locator("button", { hasText: /^3D$/ }).first().click();
  }
  await p.waitForSelector("canvas", { timeout: 90000 });
  await p.waitForTimeout(kind === "phone" ? 15000 : 13000);
  await p.screenshot({ path: `${out}/${key}-${kind}-${tag}.png` });
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(Math.round((n / 4) * 10) / 10); }; requestAnimationFrame(tick); }));
  console.log(key, kind, tag, "fps≈" + fps, "errors:", errs.length, errs.slice(0, 3), posts.length ? "non-GET: " + posts.join(", ") : "");
  await ctx.close();
}
for (const key of CASES) {
  const kinds = key.startsWith("kp3d") || key.startsWith("dash") ? ["phone"] : ["phone", "desktop"];
  if (key.startsWith("dash")) kinds.splice(0, 1, "desktop");
  for (const kind of kinds) {
    await run("https://potolok.ai", "до", kind, key);
    await run(localBase, "после", kind, key);
  }
}
await b.close();
