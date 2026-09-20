const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0;
const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: res.headers.get("set-cookie")?.split(";")[0] };
const calc = (total) => ({ totalArea: 20, totalPerimeter: 18, total, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 20, unit: "м²", unitPrice: total/20, total }], subtotal: total, subtotalAfterHeight: total }], extraItems: [] });
const roomsData = [{ id: "r1", name: "Зал", walls: [500,400,500,400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 20, perimeter: 18, elements: [] }];

// объект + КП, клиент согласовал (ручной этап) → «пора в цех»
res = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Сегодня цех", status: "saved", clientName: "QA Сегодня", clientPhone: "+77010000079",
  rooms: [{ name: "Зал", walls: [500,400,500,400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [] }] }) });
const m = await j(res);
res = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ fromMeasurementId: m.id, clientId: m.clientId, roomsData, calculationData: calc(150000), totalArea: 20 }) });
const est = await j(res);
await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "confirmed" }) });
// монтаж завтра
const tomorrow = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
res = await fetch(`${API}/clients/${m.clientId}/events`, { method: "POST", headers: H, body: JSON.stringify({ type: "INSTALL", content: "Монтаж", scheduledAt: tomorrow }) });
check("событие монтажа создано", res.status === 200 || res.status === 201, await res.text());

res = await fetch(`${API}/today`, { headers: H });
const t = await j(res);
check("GET /today 200", res.status === 200, JSON.stringify(t).slice(0, 100));
check("пора в цех: наш объект", t.toWorkshop?.some((x) => x.id === m.id && x.total === 150000), JSON.stringify(t.toWorkshop));
check("расписание: монтаж", t.schedule?.some((s) => s.type === "INSTALL" && s.client?.id === m.clientId), JSON.stringify(t.schedule));
check("calls — три бакета", t.calls && "overdue" in t.calls && "today" in t.calls);
check("objectsCount > 0", t.objectsCount > 0);
check("waiting — массив", Array.isArray(t.waiting));

// отправили в цех → из «пора в цех» уходит
await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H, body: JSON.stringify({}) });
res = await fetch(`${API}/today`, { headers: H });
const t2 = await j(res);
check("после отправки в цех объекта нет в toWorkshop", !t2.toWorkshop.some((x) => x.id === m.id));

// уборка
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
