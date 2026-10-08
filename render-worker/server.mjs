// potolok-render — воркер серверного рендера «Фото клиенту».
//
// POST /render  (заголовок x-render-secret = RENDER_WORKER_SECRET)
//   body: { visualizationId, renderId?, snapshot, presets, appOrigin?, callback?: boolean }
//   1) headless Chromium (swiftshader WebGL) открывает {appOrigin}/render-scene,
//      снапшот кладётся в window.__SNAPSHOT__ ДО загрузки (addInitScript, не query);
//   2) ждёт window.__SCENE_READY__ (HDRI/текстуры/GLB догружены) или __SCENE_ERROR__;
//   3) window.__captureFrames() → beauty (JPEG) + маска потолка + маска парящего (PNG);
//   4) POST {appOrigin}/api/visualizations/{id}/frames (тот же секрет) — там AI-пайплайн;
//   5) отвечает, когда /frames ответил (держим соединение → Fly не гасит машину посреди работы).
//   callback:false → кадры возвращаются в ответе, /frames не вызывается (отладка).
// GET /health → { ok, busy, queued, browser }
//
// Один браузер на процесс (тёплый между запросами), до MAX_CONCURRENCY страниц сразу,
// остальное — в очереди процесса.

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { chromium } from "playwright-core";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RENDER_WORKER_SECRET || "";
const ALLOWED = (process.env.ALLOWED_APP_ORIGINS || "https://potolok.ai,https://www.potolok.ai")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
const DEFAULT_ORIGIN = (process.env.DEFAULT_APP_ORIGIN || ALLOWED[0] || "").replace(/\/$/, "");
const PAGE_PATH = process.env.RENDER_PAGE_PATH || "/render-scene";
const VIEW_W = Number(process.env.VIEW_W || 1536);
const VIEW_H = Number(process.env.VIEW_H || 1024);
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 2);
const SCENE_TIMEOUT_MS = Number(process.env.SCENE_TIMEOUT_MS || 90_000);
const CALLBACK_TIMEOUT_MS = Number(process.env.CALLBACK_TIMEOUT_MS || 150_000);
const CAPTURE_TIMEOUT_MS = Number(process.env.CAPTURE_TIMEOUT_MS || 60_000);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 150_000);
const MAX_BODY = 1_000_000;

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

const CHROMIUM_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- браузер ----------
let browserPromise = null;
let browserLaunchMs = 0;
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return { browser: b, launchedNow: false };
    browserPromise = null;
  }
  const t = Date.now();
  browserPromise = chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const b = await browserPromise;
  browserLaunchMs = Date.now() - t;
  b.on("disconnected", () => {
    browserPromise = null;
  });
  log(`chromium launched in ${browserLaunchMs}ms`);
  return { browser: b, launchedNow: true };
}

// ---------- очередь ----------
let busy = 0;
const queue = [];
function withSlot(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      busy++;
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      } finally {
        busy--;
        const next = queue.shift();
        if (next) next();
      }
    };
    if (busy < MAX_CONCURRENCY) run();
    else queue.push(run);
  });
}

// ---------- рендер ----------
async function renderFrames({ appOrigin, snapshot, presets, visualizationId }) {
  const timings = {};
  const t0 = Date.now();
  const { browser, launchedNow } = await getBrowser();
  timings.browserLaunchMs = launchedNow ? browserLaunchMs : 0;

  const context = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));
  page.on("crash", () => log(`viz=${visualizationId} PAGE CRASHED (OOM?)`));
  try {
    await page.addInitScript((payload) => {
      window.__SNAPSHOT__ = payload;
    }, { snapshot, presets });

    const tNav = Date.now();
    // Сразу после старта машины Fly сеть ещё «переключается» (net::ERR_NETWORK_CHANGED
    // у браузера, запущенного прогревом) — повторяем навигацию до 3 раз.
    let resp = null;
    for (let attempt = 1; ; attempt++) {
      try {
        resp = await page.goto(`${appOrigin}${PAGE_PATH}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        break;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (attempt >= 3 || !/ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED/.test(msg)) throw e;
        log(`viz=${visualizationId} goto retry ${attempt}: ${msg.split("\n")[0]}`);
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    if (!resp || !resp.ok()) throw new Error(`render page HTTP ${resp ? resp.status() : "?"}`);
    timings.pageLoadMs = Date.now() - tNav;

    const tReady = Date.now();
    await page.waitForFunction(() => window.__SCENE_READY__ === true || typeof window.__SCENE_ERROR__ === "string", null, {
      timeout: SCENE_TIMEOUT_MS,
      polling: 200,
    });
    const sceneError = await page.evaluate(() => window.__SCENE_ERROR__ ?? null);
    const stats = await page
      .evaluate(() => ({ ...(window.__SCENE_STATS__ ?? {}), probe: window.__PROBE__ ?? null }))
      .catch(() => null);
    if (stats) timings.sceneStats = stats;
    if (sceneError) throw new Error(`scene: ${sceneError}`);
    timings.sceneReadyMs = Date.now() - tReady;

    const tCap = Date.now();
    const frames = await withTimeout(page.evaluate(() => window.__captureFrames()), CAPTURE_TIMEOUT_MS, "capture timeout");
    timings.captureMs = Date.now() - tCap;
    const ct = await page.evaluate(() => window.__CAPTURE_TIMING__ ?? null).catch(() => null);
    if (ct) Object.assign(timings, { captureBeautyMs: ct.beautyMs, captureBeautyRenderMs: ct.beautyRenderMs, captureMasksMs: ct.masksMs });
    timings.chromiumTotalMs = Date.now() - t0;
    log(`viz=${visualizationId} frames ${frames.width}x${frames.height} beauty=${Math.round(frames.beauty.length / 1024)}KB`, timings);
    return { frames, timings, consoleErrors };
  } catch (e) {
    if (consoleErrors.length) log(`viz=${visualizationId} console errors:`, consoleErrors.slice(0, 5));
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}

async function postFrames(appOrigin, visualizationId, payload) {
  const t = Date.now();
  const res = await fetch(`${appOrigin}/api/visualizations/${encodeURIComponent(visualizationId)}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-render-secret": SECRET },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, ok: res.ok, body: json ?? text.slice(0, 300), ms: Date.now() - t };
}

// ---------- http ----------
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  const got = req.headers["x-render-secret"];
  if (!SECRET || typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      const b = browserPromise ? await browserPromise.catch(() => null) : null;
      return send(res, 200, { ok: true, busy, queued: queue.length, browser: Boolean(b && b.isConnected()) });
    }
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "not found" });
    if (!authorized(req)) return send(res, 401, { error: "forbidden" });

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, 400, { error: `bad body: ${e.message}` });
    }
    const { visualizationId, snapshot, presets, renderId } = body;
    const appOrigin = String(body.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, "");
    if (!ALLOWED.includes(appOrigin)) return send(res, 400, { error: `origin not allowed: ${appOrigin}` });
    if (typeof visualizationId !== "string" || !/^[\w-]{6,64}$/.test(visualizationId)) {
      return send(res, 400, { error: "visualizationId" });
    }
    if (!snapshot || typeof snapshot !== "object") return send(res, 400, { error: "snapshot" });
    const callback = body.callback !== false;
    const tQueued = Date.now();
    log(`render viz=${visualizationId} rid=${renderId ?? "-"} origin=${appOrigin} busy=${busy} queued=${queue.length}`);

    const result = await withSlot(async () => {
      const queueMs = Date.now() - tQueued;
      let frames;
      let timings;
      try {
        const r = await withTimeout(
          renderFrames({ appOrigin, snapshot, presets: presets ?? {}, visualizationId }),
          JOB_TIMEOUT_MS,
          "render job timeout",
        );
        frames = r.frames;
        timings = { queueMs, ...r.timings };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`viz=${visualizationId} render failed: ${msg}`);
        if (callback) {
          const cb = await postFrames(appOrigin, visualizationId, { error: msg.slice(0, 300), timings: { queueMs } }).catch(
            (err) => ({ ok: false, status: 0, body: String(err) }),
          );
          return { status: 500, json: { ok: false, error: msg, callback: cb } };
        }
        return { status: 500, json: { ok: false, error: msg } };
      }
      if (!callback) return { status: 200, json: { ok: true, timings, frames } };
      const cb = await postFrames(appOrigin, visualizationId, { ...frames, timings });
      timings.callbackMs = cb.ms;
      log(`viz=${visualizationId} /frames → ${cb.status} in ${cb.ms}ms`);
      return { status: cb.ok ? 200 : 502, json: { ok: cb.ok, timings, frames: { width: frames.width, height: frames.height }, app: cb.body } };
    });
    return send(res, result.status, result.json);
  } catch (e) {
    log("unhandled:", e);
    if (!res.headersSent) send(res, 500, { error: "internal" });
  }
});

server.requestTimeout = 300_000;
server.headersTimeout = 60_000;
server.listen(PORT, () => {
  log(`potolok-render listening :${PORT}, origins=${ALLOWED.join(",")}, view=${VIEW_W}x${VIEW_H}, conc=${MAX_CONCURRENCY}`);
  if (!SECRET) log("WARNING: RENDER_WORKER_SECRET is empty — all /render requests will be rejected");
  // Прогрев: браузер стартует сразу при старте машины, а не на первом запросе.
  getBrowser().catch((e) => log("warmup failed:", e.message));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    log(`${sig}: shutting down`);
    server.close();
    const b = browserPromise ? await browserPromise.catch(() => null) : null;
    await b?.close().catch(() => {});
    process.exit(0);
  });
}
