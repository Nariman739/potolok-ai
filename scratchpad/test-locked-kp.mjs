const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const tail = String(Date.now()).slice(-6);
const calc = { totalArea: 12, totalPerimeter: 14, total: 80000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 12, unit: "м²", unitPrice: 6667, total: 80000 }], subtotal: 80000, subtotalAfterHeight: 80000 }], extraItems: [] };
const est = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", name: "Зал", walls: [419, 287, 419, 287], angles: [0,0,0,0], area: 12, perimeter: 14, elements: [] }], calculationData: calc, totalArea: 12, clientAddress: "QA Замок " + tail }) }));
check("КП создано", !!est.id, JSON.stringify(est).slice(0, 120));
// правка черновика разрешена
r = await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ discount: { mode: "percent", value: 5 } }) });
check("черновик правится", r.ok, r.status);
// мастер отправил, клиент принял
await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ status: "SENT" }) });
r = await fetch(`${API}/estimates/by-public/${est.publicId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
const confirmed = await j(await fetch(`${API}/estimates/${est.id}`, { headers: H }));
check("КП принято клиентом", (confirmed.status ?? confirmed.estimate?.status) === "CONFIRMED", confirmed.status ?? JSON.stringify(confirmed).slice(0, 100));
// теперь сумму менять нельзя
r = await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ discount: { mode: "percent", value: 30 } }) });
check("сумму принятого КП менять нельзя", r.status === 409, r.status);
const after = await j(await fetch(`${API}/estimates/${est.id}`, { headers: H }));
check("итог не изменился", Math.round(after.total ?? after.estimate?.total) === Math.round(confirmed.total ?? confirmed.estimate?.total), `${after.total} vs ${confirmed.total}`);
// имя клиента поправить можно
r = await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ clientName: "QA Замок " + tail }) });
check("имя клиента поправить можно", r.ok, r.status);
// уборка
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H });
if (est.measurementObjectId) await fetch(`${API}/objects/${est.measurementObjectId}`, { method: "DELETE", headers: H });
const cl = await j(await fetch(`${API}/clients`, { headers: H }));
for (const c of (cl.clients ?? cl ?? [])) if ((c.name ?? "").startsWith("QA Замок")) await fetch(`${API}/clients/${c.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
