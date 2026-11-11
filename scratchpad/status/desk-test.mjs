// 1366: карточка клиента («Этап» + «Сменить этап»), drag на доске тем же переносом (статус подтягивается),
// drag в «Монтаж запланирован» → диалог даты. Клиент — из state.json (status-test.mjs).
import fs from "fs";
import path from "path";
import { open, ok, BASE, state } from "./lib.mjs";

const OUT = path.join(process.env.HOME, "Desktop", "веб-статус-этап", "after");
fs.mkdirSync(OUT, { recursive: true });
const id = state.created.clientId;
const { browser, page, api, errs } = await open(1366);
const get = async () => (await api.get(`${BASE}/api/clients/${id}`)).json();
const patch = (data) => api.patch(`${BASE}/api/clients/${id}`, { data });
await patch({ crmColumn: "new" });
await patch({ status: "NEW" });

// ── Карточка ──
await page.goto(`${BASE}/dashboard/clients/${id}`, { waitUntil: "networkidle" });
// Статус NEW при объектах с датой монтажа — допускаемое расхождение: этап считается из объекта
const stage0 = await page.locator("[data-stage]").getAttribute("data-stage");
ok("1366 карточка: этап показан (статус «Новый», этап из объекта)", !!stage0, stage0);
await page.screenshot({ path: path.join(OUT, "1366-01-карточка.png") });
await page.getByRole("button", { name: "Сменить этап" }).click();
await page.waitForSelector("[data-move]");
await page.screenshot({ path: path.join(OUT, "1366-02-сменить-этап.png") });
const r1 = page.waitForResponse((r) => r.url().includes(`/api/clients/${id}`) && r.request().method() === "PATCH");
await page.locator('[data-move="contract"]').click();
await r1;
await page.waitForTimeout(1200);
let c = await get();
ok("1366 карточка → Договор: IN_PROGRESS", c.status === "IN_PROGRESS" && c.crmColumn === "contract", `${c.status}/${c.crmColumn}`);
ok("1366 бейдж «В работе»", (await page.locator("h1 + div").first().textContent())?.includes("В работе"));

// ── Доска: drag Договор → Закуп ──
await page.goto(`${BASE}/dashboard/clients?view=board`, { waitUntil: "networkidle" });
await page.getByPlaceholder("Имя, телефон или адрес").fill("QA Статус-этап");
await page.waitForTimeout(400);
const card = page.locator(`[data-column="contract"] a[href="/dashboard/clients/${id}"]`);
ok("1366 карточка в колонке Договор", (await card.count()) === 1);
const drag = async (fromCol, toCol) => {
  const el = page.locator(`[data-column="${fromCol}"] a[href="/dashboard/clients/${id}"]`);
  await el.scrollIntoViewIfNeeded();
  const cb = await el.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 15, cb.y + cb.height / 2 + 5, { steps: 4 });
  await page.waitForTimeout(200);
  await page.evaluate((col) => document.querySelector(`[data-column="${col}"]`)?.scrollIntoView({ inline: "center", block: "nearest" }), toCol);
  await page.waitForTimeout(300);
  const pb = await page.locator(`[data-column="${toCol}"]`).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + 60, { steps: 25 });
  await page.waitForTimeout(300);
  await page.mouse.up();
};
const r2 = page.waitForResponse((r) => r.url().includes(`/api/clients/${id}`) && r.request().method() === "PATCH", { timeout: 20000 });
await drag("contract", "purchase");
await r2;
await page.waitForTimeout(400);
c = await get();
ok("1366 drag → Закуп: crmColumn=purchase, статус IN_PROGRESS", c.crmColumn === "purchase" && c.status === "IN_PROGRESS", `${c.status}/${c.crmColumn}`);
await page.screenshot({ path: path.join(OUT, "1366-03-доска-после-drag.png") });

// ── drag → Монтаж запланирован: диалог даты (у клиента есть объект) ──
await drag("purchase", "install_planned");
await page.getByText("Когда монтаж?").waitFor({ timeout: 5000 });
ok("1366 drag в «Монтаж запланирован» спрашивает дату", true);
await page.screenshot({ path: path.join(OUT, "1366-04-когда-монтаж.png") });
await page.getByRole("button", { name: "Послезавтра" }).click();
const r3 = page.waitForResponse((r) => r.url().includes(`/api/objects/`) && r.request().method() === "PATCH", { timeout: 20000 });
await page.getByRole("button", { name: "Сохранить" }).click();
await r3;
await page.waitForTimeout(500);
c = await get();
const o = await (await api.get(`${BASE}/api/measurements/${state.created.objectId}`)).json();
ok("1366 монтаж запланирован с датой, статус IN_PROGRESS", c.crmColumn === "install_planned" && c.status === "IN_PROGRESS" && !!o.installAt, `${c.status}/${c.crmColumn} ${o.installAt}`);
// Esc в диалоге даты откатывает перенос
await drag("install_planned", "install");
const dis = await page.getByText("Когда монтаж?").waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
if (dis) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  c = await get();
  ok("1366 Esc в диалоге: перенос не записан", c.crmColumn === "install_planned", c.crmColumn);
} else ok("1366 перенос в «Монтаж» с датой на послезавтра спрашивает дату", false, "диалог не открылся");

ok("1366 консоль чистая", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
const { fails } = await import("./lib.mjs");
console.log(fails ? `${fails} FAIL` : "всё OK");
