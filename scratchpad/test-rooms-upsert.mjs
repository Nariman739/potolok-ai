// PATCH /measurements/:id с комнатами: id сохраняются, новая комната получает id, лишняя удаляется.
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const room = (name, w) => ({ name, walls: w, normalCorners: w.map(() => true), angles: w.map(() => 90), area: 10, perimeter: 12, elements: [] });
r = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Upsert", status: "saved", rooms: [room("A", [300,300,300,300]), room("B", [200,300,200,300])] }) });
const m = await j(r);
const [a, b] = m.rooms;
// отправили A в цех — запись ссылается на id комнаты A
await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H, body: JSON.stringify({ roomIds: [a.id] }) });
// «Обновить»: A с id (переименована), B убрана, C новая
r = await fetch(`${API}/measurements/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ address: "QA Upsert", rooms: [{ id: a.id, ...room("A2", [300,300,300,300]) }, room("C", [400,400,400,400])] }) });
const res = await j(r);
check("PATCH отвечает списком комнат с id", r.status === 200 && Array.isArray(res.rooms) && res.rooms.length === 2, JSON.stringify(res).slice(0, 160));
const card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
const a2 = card.rooms.find((x) => x.id === a.id);
check("id комнаты A сохранился, имя обновилось", a2 && a2.name === "A2", JSON.stringify(card.rooms.map((x) => [x.id === a.id, x.name])));
check("комната B удалена, C создана", !card.rooms.some((x) => x.id === b.id) && card.rooms.some((x) => x.name === "C"));
check("отметка «в цеху» у A жива (roomIds ссылаются на тот же id)", card.workshopOrders[0]?.roomIds?.includes(a.id));
// автосохранение: PATCH комнаты по старому id работает
r = await fetch(`${API}/measurements/${m.id}/rooms/${a.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ name: "A3" }) });
check("PATCH комнаты по сохранённому id → 200", r.status === 200);
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
