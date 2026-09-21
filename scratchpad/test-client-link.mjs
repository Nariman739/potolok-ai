const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const tail = String(Date.now()).slice(-7);
const m = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Связь клиента " + tail, status: "saved",
  rooms: [{ name: "Зал", walls: [443, 317, 443, 317], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 14, perimeter: 15.2, elements: [] }] }) }));
const calc = { totalArea: 14, totalPerimeter: 15.2, total: 90000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 14, unit: "м²", unitPrice: 6000, total: 90000 }], subtotal: 90000, subtotalAfterHeight: 90000 }], extraItems: [] };
const est = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", name: "Зал", walls: [443, 317, 443, 317], angles: [0,0,0,0], area: 14, perimeter: 15.2, elements: [] }], calculationData: calc, totalArea: 14, fromMeasurementId: m.id }) }));
check("КП привязано к объекту, клиента нет", est.measurementObjectId === m.id && !est.clientId, JSON.stringify(est).slice(0, 120));
r = await fetch(`${API}/measurements/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ clientName: "QA Связь " + tail, clientPhone: "701" + tail }) });
check("клиент указан после КП", r.ok, r.status);
const card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("телефон клиента приведён к 7XXXXXXXXXX", card.client?.phone === "7701" + tail, card.client?.phone);
const est2 = await j(await fetch(`${API}/estimates/${est.id}`, { headers: H }));
check("КП объекта получило клиента", (est2.clientId ?? est2.estimate?.clientId) === card.client?.id, JSON.stringify(est2).slice(0, 160));
// тот же номер в другом написании → тот же клиент
const c2 = await j(await fetch(`${API}/clients`, { method: "POST", headers: H, body: JSON.stringify({ name: "QA Дубль " + tail, phone: "8 701 " + tail }) }));
check("«8 701…» находит того же клиента, дубля нет", (c2.id ?? c2.client?.id) === card.client?.id, JSON.stringify(c2).slice(0, 120));
await fetch(`${API}/objects/${m.id}`, { method: "DELETE", headers: H });
if (card.client?.id) await fetch(`${API}/clients/${card.client.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
