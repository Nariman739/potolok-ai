// Сквозной тест ленты объектов: логин QA → создать замер → КП по нему →
// быстрое КП без замера → лента → карточка → ручной этап → «в цех» → лента.
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0;
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log("✅", name); } else { fail++; console.log("❌", name, extra); } };

let res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const cookie = res.headers.get("set-cookie")?.split(";")[0];
check("логин", res.status === 200 && cookie);
const H = { "Content-Type": "application/json", Cookie: cookie };

// 1. замер с клиентом
res = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({
  address: "QA Лента, Кабанбай батыра 1", status: "saved", clientName: "QA Лента", clientPhone: "+77010000078",
  rooms: [
    { name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [] },
    { name: "Спальня", walls: [400, 300, 400, 300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12, perimeter: 14, elements: [] },
  ] }) });
const m = await j(res);
check("замер создан", res.status === 200 && m.id, JSON.stringify(m).slice(0, 100));

// 2. лента: объект на этапе «замерил», без суммы
res = await fetch(`${API}/objects`, { headers: H });
let feed = await j(res);
check("лента отвечает массивом", Array.isArray(feed));
let row = feed.find((r) => r.kind === "object" && r.id === m.id);
check("объект в ленте", !!row);
check("этап = measured", row?.stage === "measured", row?.stage);
check("сумма null (КП нет)", row?.total === null);
check("2 комнаты, 32 м²", row?.roomsCount === 2 && row?.totalArea === 32, `${row?.roomsCount} ${row?.totalArea}`);
check("клиент подтянулся", row?.clientName === "QA Лента", row?.clientName);
check("миниатюра есть", Array.isArray(row?.preview?.walls) && row.preview.walls.length === 4);

// 3. КП по замеру
res = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({
  fromMeasurementId: m.id, clientId: m.clientId,
  roomsData: [{ id: "r1", name: "Зал", walls: [500,400,500,400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 20, perimeter: 18, elements: [] }],
  calculationData: { totalArea: 20, totalPerimeter: 18, total: 150000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 20, unit: "м²", unitPrice: 7500, total: 150000 }], subtotal: 150000, subtotalAfterHeight: 150000 }], extraItems: [] },
  totalArea: 20, total: 150000, clientName: "QA Лента" }) });
const est = await j(res);
check("КП создано и привязано", res.status === 200 && est.measurementObjectId === m.id, JSON.stringify(est).slice(0, 120));

res = await fetch(`${API}/objects`, { headers: H });
feed = await j(res);
row = feed.find((r) => r.kind === "object" && r.id === m.id);
check("этап = calculated", row?.stage === "calculated", row?.stage);
check("сумма = 150000", row?.total === 150000, row?.total);
check("КП не дублируется отдельной строкой", !feed.some((r) => r.kind === "estimate" && r.id === est.id));

// 4. отправили клиенту → sent
res = await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ status: "SENT" }) });
check("КП → SENT", res.status === 200);
res = await fetch(`${API}/objects/${m.id}`, { headers: H });
let card = await j(res);
check("карточка: этап sent", card.stage === "sent", card.stage);
check("карточка: 1 КП, isPrimary", card.estimates?.length === 1 && card.estimates[0].isPrimary === true);
check("карточка: история ≥ 2 записей", Array.isArray(card.history) && card.history.length >= 2, card.history?.length);
check("карточка: комнаты полные", card.rooms?.length === 2 && Array.isArray(card.rooms[0].walls));

// 5. ручной этап «согласовали» (клиент сказал да по телефону)
res = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "confirmed" }) });
let p = await j(res);
check("ручной этап confirmed", res.status === 200 && p.stage === "confirmed" && p.stageIsManual === true, JSON.stringify(p));
res = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "nonsense" }) });
check("мусорный этап → 400", res.status === 400);

// 6. в цех: одна комната из двух
const roomIds = card.rooms.map((r) => r.id);
res = await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H, body: JSON.stringify({ roomIds: [roomIds[0], "chuzhoy-id"], note: "белый мат" }) });
const wo = await j(res);
check("запись в цех создана", res.status === 200 && wo.id, JSON.stringify(wo).slice(0, 120));
check("чужой id отброшен, 1 комната, 20 м²", wo.roomsCount === 1 && wo.area === 20, `${wo.roomsCount} ${wo.area}`);

res = await fetch(`${API}/objects/${m.id}`, { headers: H });
card = await j(res);
check("ручной confirmed сброшен → авто workshop", card.stage === "workshop" && card.stageIsManual === false, `${card.stage} manual=${card.stageIsManual}`);
check("в истории есть WORKSHOP_SENT", card.history.some((h) => h.type === "WORKSHOP_SENT"));
check("workshopOrders в карточке", card.workshopOrders?.length === 1);

// событие у клиента
res = await fetch(`${API}/clients/${m.clientId}`, { headers: H });
const cl = await j(res);
check("у клиента событие WORKSHOP_SENT", cl.events?.some((e) => e.type === "WORKSHOP_SENT"));

// 7. ручной «смонтировали» не сбрасывается новой отправкой
await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "installed" }) });
await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H, body: JSON.stringify({ roomIds: [roomIds[1]] }) });
res = await fetch(`${API}/objects/${m.id}`, { headers: H });
card = await j(res);
check("installed остался после досылки в цех", card.stage === "installed" && card.stageIsManual, card.stage);
res = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: null }) });
p = await j(res);
check("сброс ручного → авто workshop", p.stage === "workshop" && p.stageIsManual === false, JSON.stringify(p));

// 8. быстрое КП без замера — отдельной строкой
res = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({
  roomsData: [], calculationData: { totalArea: 0, totalPerimeter: 0, total: 25000, roomResults: [], extraItems: [{ itemName: "Слив воды", quantity: 1, unit: "шт.", unitPrice: 25000, total: 25000 }] },
  totalArea: 0, total: 25000, clientName: "QA Быстрое" }) });
const quick = await j(res);
check("быстрое КП создано без объекта", res.status === 200 && !quick.measurementObjectId, JSON.stringify(quick).slice(0, 100));
res = await fetch(`${API}/objects`, { headers: H });
feed = await j(res);
const qrow = feed.find((r) => r.kind === "estimate" && r.id === quick.id);
check("быстрое КП — строка kind=estimate", !!qrow && qrow.stage === "calculated" && qrow.total === 25000, JSON.stringify(qrow));
check("лента отсортирована по активности", feed.length < 2 || feed[0].lastActivityAt >= feed[1].lastActivityAt);

// 9. фильтры
res = await fetch(`${API}/objects?q=кабанбай`, { headers: H });
feed = await j(res);
check("поиск по адресу", feed.length >= 1 && feed.every((r) => r.title.toLowerCase().includes("кабанбай")));
res = await fetch(`${API}/objects?stage=workshop`, { headers: H });
feed = await j(res);
check("фильтр по этапу", feed.length >= 1 && feed.every((r) => r.stage === "workshop"));

// чужой объект → 404
res = await fetch(`${API}/objects/00000000-0000-0000-0000-000000000000`, { headers: H });
check("несуществующий объект → 404", res.status === 404);

// уборка
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/estimates/${quick.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H });
res = await fetch(`${API}/objects`, { headers: H });
feed = await j(res);
check("после удаления объекта нет в ленте", !feed.some((r) => r.id === m.id || r.id === est.id || r.id === quick.id));

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
