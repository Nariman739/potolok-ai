// Общее для прогонов web-crm-fixes-2 на QA KZ (localhost:3096): логин, тестовые данные, уборка по id.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

export const BASE = process.env.BASE ?? "http://localhost:3096";
export const STATE = new URL("./state.json", import.meta.url).pathname;
export const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { created: {} };
export const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const PW = /password:\s*"([^"]+)"/.exec(
  fs.readFileSync(path.join(process.env.HOME, "projects/potolok-ai/scratchpad/verify-prod.mjs"), "utf8"),
)[1];

export let fails = 0;
export const ok = (n, c, x = "") => {
  console.log(`${c ? "OK  " : "FAIL"} ${n} ${x}`);
  if (!c) fails++;
};

export async function open(width = 390) {
  const browser = await chromium.launch();
  const mobile = width < 700;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
  });
  const lr = await ctx.request.post(BASE + "/api/auth/login", { data: { phone: "+77000000077", password: PW } });
  if (!lr.ok()) throw new Error("логин " + lr.status());
  await ctx.addCookies([
    {
      name: "session_token",
      value: /session_token=([^;]+)/.exec(lr.headers()["set-cookie"])[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (c) => {
    if ((c.type() === "error" || c.type() === "warning") && !/DevTools|Download the React DevTools/.test(c.text()))
      errs.push(c.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 200)));
  page.on("dialog", (d) => d.accept());
  return { browser, ctx, page, api: ctx.request, errs };
}

/** Клиент с адресом и замером в календаре + объект с косой комнатой и 3 диагоналями. */
export async function ensureData(api) {
  if (!state.created.clientId) {
    const r = await api.post(`${BASE}/api/clients`, {
      data: { name: "QA Фикс2 Диагонали", phone: "+77000000212", address: "Астана, ул. Тестовая 2, кв. 12" },
    });
    const j = await r.json();
    if (!r.ok()) throw new Error("POST /api/clients " + r.status() + " " + JSON.stringify(j));
    state.created.clientId = j.id;
    save();
  }
  if (!state.created.planAt) {
    // Завтра 11:00 по Астане
    const d = new Date(Date.now() + 5 * 3600e3);
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.toISOString().slice(0, 10);
    const at = new Date(`${day}T11:00:00+05:00`).toISOString();
    const r = await api.put(`${BASE}/api/clients/${state.created.clientId}/plan`, { data: { kind: "measure", at } });
    if (!r.ok()) throw new Error("PUT plan " + r.status());
    state.created.planAt = at;
    state.created.planDay = day;
    save();
  }
  if (!state.created.objectId) {
    const o = JSON.parse(fs.readFileSync(new URL("./room-oblique.json", import.meta.url)))[0];
    const room = {
      name: o.name,
      walls: o.walls,
      normalCorners: o.normalCorners,
      angles: o.angles,
      obliqueDiagonals: o.obliqueDiagonals,
      area: o.area,
      perimeter: o.perimeter,
      elements: o.elements,
    };
    const r = await api.post(`${BASE}/api/measurements`, {
      data: { address: "QA Фикс2 — косой коридор", status: "saved", clientId: state.created.clientId, rooms: [room] },
      headers: { "X-Op-Id": `qa-fix2-${Date.now()}` },
    });
    const j = await r.json();
    if (!r.ok()) throw new Error("POST /api/measurements " + r.status() + " " + JSON.stringify(j));
    state.created.objectId = j.id;
    save();
  }
  return state.created;
}

/** Уборка по id: объект и клиент — мягко и навсегда; КП (если создано) — тоже. */
export async function cleanup(api) {
  const c = state.created;
  const log = [];
  for (const id of c.estimateIds ?? []) {
    const r1 = await api.delete(`${BASE}/api/estimates/${id}`);
    const r2 = await api.post(`${BASE}/api/estimates/${id}/permanent-delete`);
    log.push(`estimate ${id}: ${r1.status()}/${r2.status()}`);
  }
  if (c.objectId) {
    const r1 = await api.delete(`${BASE}/api/measurements/${c.objectId}`);
    const r2 = await api.post(`${BASE}/api/measurements/${c.objectId}/permanent-delete`);
    log.push(`object ${c.objectId}: ${r1.status()}/${r2.status()}`);
  }
  if (c.clientId) {
    const r1 = await api.delete(`${BASE}/api/clients/${c.clientId}`);
    const r2 = await api.post(`${BASE}/api/clients/${c.clientId}/permanent-delete`);
    log.push(`client ${c.clientId}: ${r1.status()}/${r2.status()}`);
  }
  console.log(log.join("\n"));
  return log;
}
