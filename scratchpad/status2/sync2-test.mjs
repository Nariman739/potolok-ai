// web-status-sync-2: объект смонтирован/закрыт → статус WON по этапу → ручная колонка ниже «Завершён» снимается.
// QA KZ, dev 3096. Созданное удаляется по id в ../status/cleanup.mjs (state.json общий).
import fs from "fs";
import path from "path";
import { open, ok, BASE, state, save } from "../status/lib.mjs";

const OUT = path.join(process.env.HOME, "Desktop", "веб-статус-этап-2", "after");
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, api, errs } = await open(390);
const shot = (n) => page.screenshot({ path: path.join(OUT, `390-${n}.png`) });
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

if (!state.created.clientId) {
  const cr = await api.post(`${BASE}/api/clients`, { data: { name: "QA Статус-этап 2", phone: "+77000000314", address: "Астана, Статусная 2" } });
  const created = await cr.json();
  if (!cr.ok()) throw new Error("POST client " + cr.status());
  state.created.clientId = created.id; save();
}
const id = state.created.clientId;
const get = async () => (await api.get(`${BASE}/api/clients/${id}`)).json();
const patch = (data) => api.patch(`${BASE}/api/clients/${id}`, { data });
const events = async (n = 2) =>
  (await sql`SELECT content FROM "ClientEvent" WHERE "clientId" = ${id} AND type = 'STATUS_CHANGE' ORDER BY "createdAt" DESC LIMIT ${n}`).map((r) => r.content);
const newObject = async (address) => {
  const om = await api.post(`${BASE}/api/measurements`, {
    data: { address, status: "saved", clientId: id, rooms: [{ name: "Зал", walls: [400, 300, 400, 300], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 12, perimeter: 14, elements: [] }] },
    headers: { "X-Op-Id": `qa-sync2-${Date.now()}` },
  });
  const obj = await om.json();
  if (!om.ok()) throw new Error("POST measurement " + om.status());
  return obj.id;
};
const objPatch = (oid, data) => api.patch(`${BASE}/api/objects/${oid}`, { data });
const getObj = async (oid) => (await api.get(`${BASE}/api/measurements/${oid}`)).json();
const stageOnCard = async () => {
  await page.goto(`${BASE}/dashboard/clients/${id}`, { waitUntil: "networkidle" });
  return page.locator("[data-stage]").getAttribute("data-stage");
};
const SYNC_WAIT = 1500; // PATCH /api/objects поднимает статус после ответа (fire-and-forget)

if (!state.created.objectId) { state.created.objectId = await newObject("QA Статус-этап 2 объект"); save(); }
const obj = state.created.objectId;
// Разделы 1–4 работают с главным (новейшим) объектом — при повторном прогоне это второй объект из раздела 5
const m = state.created.objectId2 ?? obj;

// ── 1. Основной случай: ручная колонка «Замер», в приложении «смонтировали» ──
await objPatch(m, { manualStage: null, installAt: null });
await patch({ status: "NEW" }); // WON по объекту канбан не откатывает (защита) — сбрасываем как из приложения
await patch({ crmColumn: "measure" });
let c = await get();
ok("подготовка: IN_PROGRESS/measure, объект без этапа", c.status === "IN_PROGRESS" && c.crmColumn === "measure" && (await getObj(m)).manualStage == null, `${c.status}/${c.crmColumn}`);
await objPatch(m, { manualStage: "installed" });
await page.waitForTimeout(SYNC_WAIT);
c = await get();
let ev = await events();
ok("смонтировали → WON, ручная колонка «Замер» снята", c.status === "WON" && c.crmColumn === null, `${c.status}/${c.crmColumn}`);
ok("событие в истории: «Этап: «Замер» → «Завершён» (объект смонтирован)»", ev[0] === "Этап: «Замер» → «Завершён» (объект смонтирован)" && ev[1] === "Объект согласован (по этапу)", JSON.stringify(ev));
ok("карточка: этап Завершён", (await stageOnCard()) === "done");
await shot("01-смонтировали-завершён");
ok("история в карточке показывает событие этапа", (await page.getByText("Этап: «Замер» → «Завершён»").count()) >= 1);
await shot("02-история");

// ── 2. Наблюдение ad: «Отказ» после монтажа → «В работе» из приложения → /plan назначил монтаж ──
await patch({ crmColumn: "lost" });
c = await get();
ok("Отказ: LOST/lost, installed остался", c.status === "LOST" && c.crmColumn === "lost" && (await getObj(m)).manualStage === "installed", `${c.status}/${c.crmColumn}`);
await patch({ status: "IN_PROGRESS" });
c = await get();
ok("«В работе» из приложения: IN_PROGRESS, колонка Замер, installed остался (как 61c49df)", c.status === "IN_PROGRESS" && c.crmColumn === "measure" && (await getObj(m)).manualStage === "installed", `${c.status}/${c.crmColumn}`);
const at = new Date(Date.now() + 2 * 86400e3).toISOString();
const pr = await api.put(`${BASE}/api/clients/${id}/plan`, { data: { kind: "install", at, objectId: m } });
ok("/plan монтаж ответил ok", pr.ok(), String(pr.status()));
await page.waitForTimeout(600);
c = await get();
ev = await events();
ok("после /plan: WON и колонка снята (Завершён по объекту), а не «Замер»", c.status === "WON" && c.crmColumn === null, `${c.status}/${c.crmColumn} ${JSON.stringify(ev)}`);
ok("карточка: этап Завершён", (await stageOnCard()) === "done");
await shot("03-ad-после-plan-завершён");

// ── 3. closed симметрично installed ──
await patch({ crmColumn: "done" });
await patch({ crmColumn: "purchase" }); // уход из «Завершён» снимает installed (61c49df)
await patch({ status: "IN_PROGRESS" }); // WON по объекту канбан не откатывает — как из приложения; колонка Закуп остаётся
c = await get();
ok("Завершён → Закуп: IN_PROGRESS, installed снят", c.status === "IN_PROGRESS" && c.crmColumn === "purchase" && (await getObj(m)).manualStage == null, `${c.status}/${c.crmColumn} manualStage=${(await getObj(m)).manualStage}`);
await objPatch(m, { manualStage: "closed" });
await page.waitForTimeout(SYNC_WAIT);
c = await get();
ev = await events();
ok("закрыл → WON, ручная колонка «Закуп материала» снята", c.status === "WON" && c.crmColumn === null && ev[0] === "Этап: «Закуп материала» → «Завершён» (объект смонтирован)", `${c.status}/${c.crmColumn} ${JSON.stringify(ev)}`);

// ── 4. Не ломаем: «согласован» (не монтаж) колонку не трогает; WON уже стоит — ничего не пишем ──
await objPatch(m, { manualStage: null });
await patch({ status: "NEW" });
await patch({ crmColumn: "purchase" });
c = await get();
ok("подготовка: IN_PROGRESS/purchase", c.status === "IN_PROGRESS" && c.crmColumn === "purchase", `${c.status}/${c.crmColumn}`);
const before = (await events(1))[0];
await objPatch(m, { manualStage: "confirmed" });
await page.waitForTimeout(SYNC_WAIT);
c = await get();
ev = await events();
ok("согласован → WON, колонка «Закуп» осталась (сделка ≠ монтаж)", c.status === "WON" && c.crmColumn === "purchase" && ev[0] === "Объект согласован (по этапу)", `${c.status}/${c.crmColumn} ${JSON.stringify(ev)}`);
void before;
// WON уже стоит, объект смонтировали — статус не растёт, колонка (по правилу «только при подъёме») не трогается
await objPatch(m, { manualStage: "installed" });
await page.waitForTimeout(SYNC_WAIT);
c = await get();
ev = await events();
ok("WON уже был: смонтировали — без новых событий, колонка не тронута", c.status === "WON" && c.crmColumn === "purchase" && ev[0] === "Объект согласован (по этапу)", `${c.status}/${c.crmColumn} ${JSON.stringify(ev)}`);

// ── 5. Смонтирован старый объект, а главный (новейший) — свежий замер: колонку не снимаем ──
await objPatch(obj, { manualStage: null });
if (!state.created.objectId2) { state.created.objectId2 = await newObject("QA Статус-этап 2 второй объект"); save(); }
const obj2 = state.created.objectId2;
await objPatch(obj2, { manualStage: null });
await patch({ status: "NEW" });
await patch({ crmColumn: "kp_sent" });
c = await get();
ok("подготовка: два объекта, IN_PROGRESS/kp_sent", c.status === "IN_PROGRESS" && c.crmColumn === "kp_sent", `${c.status}/${c.crmColumn}`);
await objPatch(obj, { manualStage: "installed" }); // старый объект
await page.waitForTimeout(SYNC_WAIT);
c = await get();
ev = await events();
ok("старый объект смонтирован → WON, но колонка «КП отправлено» осталась (главный объект не завершён)", c.status === "WON" && c.crmColumn === "kp_sent" && ev[0] === "Объект согласован (по этапу)", `${c.status}/${c.crmColumn} ${JSON.stringify(ev)}`);
ok("карточка: этап КП отправлено", (await stageOnCard()) === "kp_sent");
// а если смонтирован главный — снимается
await objPatch(obj, { manualStage: null });
await patch({ status: "NEW" });
await patch({ crmColumn: "kp_sent" });
await objPatch(obj2, { manualStage: "installed" });
await page.waitForTimeout(SYNC_WAIT);
c = await get();
ok("главный объект смонтирован → WON, колонка снята", c.status === "WON" && c.crmColumn === null, `${c.status}/${c.crmColumn}`);
ok("карточка: этап Завершён", (await stageOnCard()) === "done");
await shot("04-два-объекта-завершён");

// ── 6. Доска: карточка в «Завершён» ──
await page.goto(`${BASE}/dashboard/clients?view=board`, { waitUntil: "networkidle" });
await page.locator('[data-mchip="done"]').click();
ok("доска: карточка в колонке Завершён", (await page.locator(`[data-mcard="${id}"]`).count()) === 1);
await shot("05-доска-завершён");

ok("консоль чистая", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
const { fails } = await import("../status/lib.mjs");
console.log(fails ? `${fails} FAIL` : "всё OK", "| created:", JSON.stringify(state.created));
