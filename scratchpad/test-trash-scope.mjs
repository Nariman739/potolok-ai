// Уволенный сотрудник не должен ни вернуть из корзины, ни уничтожить
// объект, КП и клиента компании (дыра найдена аудитом 24.09.2026).
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const room = { name: "Зал", walls: [400, 300, 400, 300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12, perimeter: 14, elements: [] };
const calc = { totalArea: 12, totalPerimeter: 14, total: 90000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 12, unit: "м²", unitPrice: 7500, total: 90000 }], subtotal: 90000, subtotalAfterHeight: 90000 }], extraItems: [] };

const H1 = await login("+77000000077"), H2 = await login("+77000000078");
const c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ name: "Второй", phone: "+77000000078" }) });
await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ companyId: c1.companyId }) });

// сотрудник делает объект, КП и клиента
const tail = String(Date.now()).slice(-6);
const m = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H2, body: JSON.stringify({ address: `QA Корзина ${tail}`, status: "saved", clientName: `QA Корзина ${tail}`, clientPhone: `7702${tail}1`, rooms: [room] }) }));
const e = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H2, body: JSON.stringify({ fromMeasurementId: m.id, roomsData: [{ id: "a", ...room, angles: [0,0,0,0] }], calculationData: calc, totalArea: 12 }) }));
check("объект и КП сотрудника созданы", !!m.id && !!e.id);

// владелец увольняет сотрудника
const members = (await j(await fetch(`${API}/company`, { headers: H1 }))).members ?? [];
const memberId = members.find((x) => (x.phone ?? "").endsWith("7000000078"))?.id;
check("сотрудник убран", (await fetch(`${API}/company/members/${memberId}`, { method: "DELETE", headers: H1 })).status === 200);

// владелец кладёт объект и КП в корзину
await fetch(`${API}/estimates/${e.id}`, { method: "DELETE", headers: H1 });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H1 });

// ушедший пытается хозяйничать в корзине компании
for (const [what, path] of [["объект", `/measurements/${m.id}`], ["КП", `/estimates/${e.id}`], ["клиента", `/clients/${m.clientId}`]]) {
  const r1 = await fetch(`${API}${path}/restore`, { method: "POST", headers: H2 });
  check(`ушедший НЕ восстановит ${what} из корзины`, r1.status === 404, r1.status);
  const r2 = await fetch(`${API}${path}/permanent-delete`, { method: "POST", headers: H2 });
  check(`ушедший НЕ удалит ${what} насовсем`, r2.status === 404, r2.status);
}

// владелец по-прежнему может всё
const own = await fetch(`${API}/measurements/${m.id}/restore`, { method: "POST", headers: H1 });
check("владелец восстанавливает объект", own.status === 200, own.status);
const feed = await j(await fetch(`${API}/objects`, { headers: H1 }));
check("объект вернулся в ленту владельца", feed.some((x) => x.id === m.id));

// уборка
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H1 });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
