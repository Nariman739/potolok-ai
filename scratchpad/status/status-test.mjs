// Единый статус: этап канбана → статус (все 12), статус из приложения → этап, карточка «Сменить этап»,
// диалог даты монтажа, защита WON. QA KZ, dev 3096. Созданное удаляется по id в cleanup.mjs.
import fs from "fs";
import path from "path";
import { open, ok, BASE, state, save } from "./lib.mjs";

const OUT = path.join(process.env.HOME, "Desktop", "веб-статус-этап", "after");
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, api, errs } = await open(390);
const shot = (n) => page.screenshot({ path: path.join(OUT, `390-${n}.png`) });

const EXPECT = {
  new: "NEW", measure: "IN_PROGRESS", calc: "IN_PROGRESS", kp_sent: "IN_PROGRESS", negotiation: "IN_PROGRESS",
  contract: "IN_PROGRESS", purchase: "IN_PROGRESS", planning: "IN_PROGRESS", install_planned: "IN_PROGRESS",
  install: "IN_PROGRESS", done: "WON", lost: "LOST",
};
const LABELS = { new: "Новая заявка", measure: "Замер", calc: "Расчёт / КП", kp_sent: "КП отправлено", negotiation: "Согласование", contract: "Договор", purchase: "Закуп материала", planning: "Планирование", install_planned: "Монтаж запланирован", install: "Монтаж", done: "Завершён", lost: "Отказ" };

// Клиент без объекта (повторный запуск использует уже созданного — чтобы не плодить)
if (!state.created.clientId) {
  const cr = await api.post(`${BASE}/api/clients`, { data: { name: "QA Статус-этап", phone: "+77000000313", address: "Астана, Статусная 1" } });
  const created = await cr.json();
  if (!cr.ok()) throw new Error("POST client " + cr.status());
  state.created.clientId = created.id; save();
}
const id = state.created.clientId;
const get = async () => (await api.get(`${BASE}/api/clients/${id}`)).json();
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const lastEvent = async () => {
  const rows = await sql`SELECT content FROM "ClientEvent" WHERE "clientId" = ${id} AND type = 'STATUS_CHANGE' ORDER BY "createdAt" DESC LIMIT 1`;
  return rows[0] ?? null;
};
const patch = (data) => api.patch(`${BASE}/api/clients/${id}`, { data });

// ── 1. Все 12 этапов через PATCH crmColumn (как доска) → статус ──
for (const col of Object.keys(EXPECT)) {
  const r = await patch({ crmColumn: col });
  const c = await get();
  const ev = await lastEvent();
  const evOk = EXPECT[col] === "IN_PROGRESS" && col !== "measure" ? true : true; // причина проверяется ниже точечно
  ok(`этап ${col} → статус ${EXPECT[col]}`, r.ok() && c.status === EXPECT[col] && c.crmColumn === col, `${c.status}/${c.crmColumn} ${ev?.content ?? ""}`);
  void evOk;
}
// причина события для промежуточного этапа
await patch({ crmColumn: "new" });
await patch({ crmColumn: "kp_sent" });
ok("событие «Канбан: КП отправлено»", (await lastEvent())?.content === "Канбан: КП отправлено", (await lastEvent())?.content);

// ── 2. Статус из приложения → этап ──
await patch({ crmColumn: "new" });
let c = await get();
ok("сброс: new/NEW", c.status === "NEW" && c.crmColumn === "new", `${c.status}/${c.crmColumn}`);
await patch({ status: "IN_PROGRESS" });
c = await get();
ok("приложение: В работе без объекта → Замер", c.status === "IN_PROGRESS" && c.crmColumn === "measure", `${c.status}/${c.crmColumn}`);
await patch({ crmColumn: "negotiation" });
await patch({ status: "IN_PROGRESS" });
c = await get();
ok("приложение: В работе при промежуточном этапе — этап не трогаем", c.crmColumn === "negotiation", c.crmColumn);
await patch({ status: "WON" });
c = await get();
ok("приложение: Сделка → Завершён", c.status === "WON" && c.crmColumn === "done", `${c.status}/${c.crmColumn}`);
await patch({ status: "LOST" });
c = await get();
ok("приложение: Отказ → Отказ", c.status === "LOST" && c.crmColumn === "lost", `${c.status}/${c.crmColumn}`);
await patch({ status: "NEW" });
c = await get();
ok("приложение: Новый → ручная колонка снята, статус NEW", c.status === "NEW" && c.crmColumn === null, `${c.status}/${c.crmColumn}`);
await patch({ status: "QUALIFIED" });
c = await get();
ok("старый билд: QUALIFIED → IN_PROGRESS и Замер", c.status === "IN_PROGRESS" && c.crmColumn === "measure", `${c.status}/${c.crmColumn}`);

// ── 3. Защита WON, поставленного не канбаном ──
await patch({ crmColumn: "new" });
await patch({ status: "WON" }); // причина не «Канбан: Завершён»
await patch({ crmColumn: "measure" });
c = await get();
ok("WON не от канбана при переносе в Замер остаётся WON", c.status === "WON" && c.crmColumn === "measure", `${c.status}/${c.crmColumn}`);
// А WON от канбана откатывается
await patch({ status: "NEW" });
await patch({ crmColumn: "done" });
await patch({ crmColumn: "calc" });
c = await get();
ok("WON от канбана при переносе в Расчёт → IN_PROGRESS", c.status === "IN_PROGRESS" && c.crmColumn === "calc", `${c.status}/${c.crmColumn}`);

// ── 4. Карточка клиента: этап и «Сменить этап» ──
await page.goto(`${BASE}/dashboard/clients/${id}`, { waitUntil: "networkidle" });
ok("карточка показывает этап Расчёт / КП", (await page.locator("[data-stage]").getAttribute("data-stage")) === "calc");
ok("кнопок старых статусов нет", (await page.getByText("Сменить статус").count()) === 0);
await shot("01-карточка-этап");
await page.getByRole("button", { name: "Сменить этап" }).click();
await page.waitForSelector("[data-move]");
ok("в списке 11 этапов (без текущего)", (await page.locator("[data-move]").count()) === 11);
await shot("02-карточка-сменить-этап");
const resp = page.waitForResponse((r) => r.url().includes(`/api/clients/${id}`) && r.request().method() === "PATCH");
await page.locator('[data-move="kp_sent"]').click();
await resp;
await page.waitForTimeout(1200);
c = await get();
ok("карточка → КП отправлено: статус IN_PROGRESS", c.status === "IN_PROGRESS" && c.crmColumn === "kp_sent", `${c.status}/${c.crmColumn}`);
ok("на экране этап КП отправлено", (await page.locator("[data-stage]").getAttribute("data-stage")) === "kp_sent");
// перенос в Отказ → бейдж статуса «Отказ»
await page.getByRole("button", { name: "Сменить этап" }).click();
const resp2 = page.waitForResponse((r) => r.url().includes(`/api/clients/${id}`) && r.request().method() === "PATCH");
await page.locator('[data-move="lost"]').click();
await resp2;
c = await get();
ok("карточка → Отказ: статус LOST", c.status === "LOST" && c.crmColumn === "lost", `${c.status}/${c.crmColumn}`);
await page.locator("h1 + div", { hasText: "Отказ" }).first().waitFor({ timeout: 8000 }).catch(() => {});
ok("бейдж статуса обновился на «Отказ» без перезагрузки", (await page.locator("h1 + div").first().textContent())?.includes("Отказ"), await page.locator("h1 + div").first().textContent());
await shot("03-карточка-отказ");

// ── 5. С объектом: «Монтаж запланирован» спрашивает дату, как на доске ──
const om = await api.post(`${BASE}/api/measurements`, {
  data: { address: "QA Статус-этап объект", status: "saved", clientId: id, rooms: [{ name: "Зал", walls: [400, 300, 400, 300], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 12, perimeter: 14, elements: [] }] },
  headers: { "X-Op-Id": `qa-status-${Date.now()}` },
});
const obj = await om.json();
if (!om.ok()) throw new Error("POST measurement " + om.status());
state.created.objectId = obj.id; save();
await patch({ crmColumn: "new" });
await page.goto(`${BASE}/dashboard/clients/${id}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Сменить этап" }).click();
await page.locator('[data-move="install_planned"]').click();
await page.getByText("Когда монтаж?").waitFor({ timeout: 5000 });
ok("диалог «Когда монтаж?» открылся из карточки", true);
await shot("04-карточка-когда-монтаж");
await page.waitForTimeout(600); // предыдущий диалог («Перенести в …») дозакрывается с анимацией
const dm = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.textContent.includes("Когда монтаж?")); const r = d.getBoundingClientRect(); return { right: Math.round(r.right), scrollW: d.scrollWidth, width: Math.round(r.width), vw: innerWidth }; });
ok("диалог даты в экране 390", dm.right <= dm.vw && dm.scrollW <= dm.width + 1, JSON.stringify(dm));
await page.getByRole("button", { name: "Завтра", exact: true }).click();
const respO = page.waitForResponse((r) => r.url().includes(`/api/objects/${obj.id}`) && r.request().method() === "PATCH");
await page.getByRole("button", { name: "Сохранить" }).click();
await respO;
await page.waitForTimeout(1200);
c = await get();
const o = await (await api.get(`${BASE}/api/measurements/${obj.id}`)).json();
ok("монтаж запланирован: дата в объекте, статус IN_PROGRESS", c.crmColumn === "install_planned" && c.status === "IN_PROGRESS" && !!o.installAt, `${c.status}/${c.crmColumn} installAt=${o.installAt}`);
ok("на экране этап Монтаж запланирован", (await page.locator("[data-stage]").getAttribute("data-stage")) === "install_planned");

// ── 6. Доска на телефоне: «⋯» → перенести — статус подтянулся ──
await page.goto(`${BASE}/dashboard/clients?view=board`, { waitUntil: "networkidle" });
await page.locator('[data-mchip="install_planned"]').click();
await page.locator(`[data-mcard="${id}"] button`).click();
const resp3 = page.waitForResponse((r) => r.url().includes(`/api/clients/${id}`) && r.request().method() === "PATCH");
await page.locator('[data-move="done"]').click();
await resp3;
await page.waitForTimeout(800);
c = await get();
// crmColumn: "done" или null (если объект уже «смонтирован» — колонку не пишут, этап считается сам)
ok("доска: → Завершён даёт WON", c.status === "WON" && (c.crmColumn === "done" || c.crmColumn === null), `${c.status}/${c.crmColumn}`);
await page.goto(`${BASE}/dashboard/clients/${id}`, { waitUntil: "networkidle" });
ok("карточка после доски: этап Завершён, статус Сделка", (await page.locator("[data-stage]").getAttribute("data-stage")) === "done" && (await page.locator("h1 + div").first().textContent())?.includes("Сделка"));
await shot("05-доска-завершён");

ok("консоль чистая", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
const { fails } = await import("./lib.mjs");
console.log(fails ? `${fails} FAIL` : "всё OK", "| created:", JSON.stringify(state.created));
