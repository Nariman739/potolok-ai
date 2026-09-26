// 26.09.2026: отзыв отправки в цех, единое имя КП без объекта, «Взять на объект».
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const H1 = await login("+77000000077"), H2 = await login("+77000000078");
// второй аккаунт — в своей компании, чужой
await fetch(`${API}/company`, { method: "POST", headers: H2, body: JSON.stringify({ name: "Чужая", phone: "+77000000078" }) });
const own = await j(await fetch(`${API}/company`, { headers: H2 }));
if (own.companyId) await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ companyId: own.companyId }) });

const tail = String(Date.now()).slice(-6);
const rooms = [
  { name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [] },
  { name: "Спальня", walls: [400, 300, 400, 300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12, perimeter: 14, elements: [] },
];
const items = (p, s) => [
  { itemCode: "canvas_320", itemName: "Полотно матовое", quantity: p === 18 ? 20 : 12, unit: "м²", unitPrice: 2000, total: 1 },
  { itemCode: "profile_plastic", itemName: "Пластиковый профиль", quantity: p, unit: "м.п.", unitPrice: 500, total: 1 },
  { itemCode: "insert", itemName: "Вставка", quantity: p, unit: "м.п.", unitPrice: 1000, total: 1 },
  { itemCode: "spot_ours", itemName: "Софиты GX53", quantity: s, unit: "шт.", unitPrice: 5000, total: 1 },
  { itemCode: "install_canvas", itemName: "Монтаж полотна", quantity: 5, unit: "м²", unitPrice: 800, total: 1 },
];
const calc = { totalArea: 32, totalPerimeter: 32, total: 300000, roomResults: [
  { roomName: "Зал", area: 20, perimeter: 18, items: items(18, 6), subtotal: 1, subtotalAfterHeight: 1 },
  { roomName: "Спальня", area: 12, perimeter: 14, items: items(14, 4), subtotal: 1, subtotalAfterHeight: 1 },
], extraItems: [{ itemCode: "pipe_bypass", itemName: "Обход трубы", quantity: 2, unit: "шт.", unitPrice: 2000, total: 1 }] };

const m = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H1, body: JSON.stringify({ address: `QA Цех ${tail}`, status: "saved", rooms }) }));
const e = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H1, body: JSON.stringify({ fromMeasurementId: m.id, roomsData: rooms.map((r, i) => ({ id: String(i), ...r, angles: [0,0,0,0] })), calculationData: calc, totalArea: 32 }) }));
check("объект и КП созданы", !!m.id && !!e.id, JSON.stringify({ m, e }).slice(0, 200));

// «Взять на объект»
let card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H1 }));
const mat = card.materials;
check("materials есть", !!mat && mat.lines.length > 0, JSON.stringify(mat)?.slice(0, 200));
const q = (code) => mat?.lines.find((l) => l.code === code)?.quantity;
check("багет сложен по комнатам: 18+14=32", q("profile_plastic") === 32, q("profile_plastic"));
check("софиты сложены: 6+4=10", q("spot_ours") === 10, q("spot_ours"));
check("полотно: 20+12=32", q("canvas_320") === 32, q("canvas_320"));
check("допы вне комнат тоже: обход трубы 2", q("pipe_bypass") === 2, q("pipe_bypass"));
check("монтаж (работа) в список не попал", q("install_canvas") === undefined);
check("периметр объекта 32, комнат 2", mat?.perimeter === 32 && mat?.rooms === 2, JSON.stringify([mat?.perimeter, mat?.rooms]));
check("порядок: полотно раньше багета раньше софитов", mat && mat.lines.findIndex((l) => l.code === "canvas_320") < mat.lines.findIndex((l) => l.code === "profile_plastic") && mat.lines.findIndex((l) => l.code === "profile_plastic") < mat.lines.findIndex((l) => l.code === "spot_ours"));

// В цех — одну комнату
const roomIds = card.rooms.map((r) => r.id);
const wo = await j(await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H1, body: JSON.stringify({ roomIds: [roomIds[0]] }) }));
check("отправка в цех записана", !!wo.id, JSON.stringify(wo).slice(0, 120));
card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H1 }));
check("этап стал «в цеху»", card.stage === "workshop", card.stage);
check("в наряде одна комната из двух", card.workshopOrders[0]?.roomIds?.length === 1 && card.rooms.length === 2);

// чужой не отзовёт
const alien = await fetch(`${API}/objects/${m.id}/workshop/${wo.id}`, { method: "DELETE", headers: H2 });
check("чужая компания не отзовёт наряд (404)", alien.status === 404, alien.status);
// несуществующий
const nope = await fetch(`${API}/objects/${m.id}/workshop/nope-id`, { method: "DELETE", headers: H1 });
check("несуществующий наряд — 404", nope.status === 404, nope.status);

// свой отзовёт
const del = await fetch(`${API}/objects/${m.id}/workshop/${wo.id}`, { method: "DELETE", headers: H1 });
check("владелец отзывает наряд", del.status === 200, del.status);
card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H1 }));
check("наряд исчез", card.workshopOrders.length === 0, card.workshopOrders.length);
check("этап вернулся к «посчитал»", card.stage === "calculated", card.stage);
check("в истории нет «В цех»", !card.history.some((h) => h.type === "WORKSHOP_SENT"), JSON.stringify(card.history.map((h) => h.type)));
const again = await fetch(`${API}/objects/${m.id}/workshop/${wo.id}`, { method: "DELETE", headers: H1 });
check("повторный отзыв — 404, не 500", again.status === 404, again.status);

// Единое имя КП без объекта
const quick = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H1, body: JSON.stringify({ roomsData: [], calculationData: { ...calc, totalArea: 0, roomResults: [] }, totalArea: 0 }) }));
const withArea = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H1, body: JSON.stringify({ roomsData: [{ id: "0", ...rooms[0], angles: [0,0,0,0] }], calculationData: calc, totalArea: 20.4 }) }));
const feed = await j(await fetch(`${API}/objects`, { headers: H1 }));
const fq = feed.find((r) => r.kind === "estimate" && r.id === quick.id);
check("быстрое КП в ленте: «Быстрое КП от <дата>»", /^Быстрое КП от \d{1,2} [а-я]{3}$/.test(fq?.title ?? ""), fq?.title);
// КП с комнатами с 19.09 само становится объектом — сиротой быть не должно
const fa = feed.find((r) => r.kind === "object" && r.primaryEstimateId === withArea.id);
check("КП с комнатами стало объектом, а не сиротой", !!fa && !feed.some((r) => r.kind === "estimate" && r.id === withArea.id), JSON.stringify(fa)?.slice(0, 120));
// принятое быстрое КП: в «Деньгах» то же имя, что в ленте
await fetch(`${API}/estimates/${quick.id}`, { method: "PUT", headers: H1, body: JSON.stringify({ status: "SENT" }) });
const conf = await fetch(`${API}/estimates/by-public/${quick.publicId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
const money = await j(await fetch(`${API}/money`, { headers: H1 }));
const row = money.owedToMe?.find((x) => x.id === quick.id);
check("в «Деньгах» то же имя, что в ленте", !!row && row.title === fq?.title, JSON.stringify({ confirm: conf.status, row: row?.title, feed: fq?.title }));
// «Не ответил» — REJECTED убирает из «Должны мне», в ленте остаётся
const rej = await fetch(`${API}/estimates/${quick.id}`, { method: "PUT", headers: H1, body: JSON.stringify({ status: "REJECTED" }) });
const money2 = await j(await fetch(`${API}/money`, { headers: H1 }));
check("после «Не ответил» КП ушло из «Должны мне»", rej.status === 200 && !money2.owedToMe?.some((x) => x.id === quick.id), rej.status);
const feed2 = await j(await fetch(`${API}/objects`, { headers: H1 }));
check("но в ленте осталось", feed2.some((r) => r.id === quick.id));

// уборка
for (const id of [quick.id, withArea.id, e.id]) await fetch(`${API}/estimates/${id}`, { method: "DELETE", headers: H1 });
if (fa?.id) await fetch(`${API}/measurements/${fa.id}`, { method: "DELETE", headers: H1 });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H1 });
console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
