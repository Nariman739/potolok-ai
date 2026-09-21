// Участник бригады (QA2 в компании QA) делает КП → публичное КП показывает бренд владельца (QA).
const API = process.env.API ?? "http://localhost:3000/api";
const BASE = API.replace(/\/api$/, "");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const H1 = await login("+77000000077"), H2 = await login("+77000000078");
// бренд владельца
await fetch(`${API}/master/profile`, { method: "PUT", headers: H1, body: JSON.stringify({ companyName: "Потолки QA Бренд" }) }).catch(() => {});
let r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ phone: "+77000000078" }) });
check("QA2 приглашён в компанию QA", (await j(r)).invited === true);
const c1pre = await j(await fetch(`${API}/company`, { headers: H1 }));
r = await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ companyId: c1pre.companyId }) });
check("QA2 принял приглашение", r.status === 200, r.status);
const calc = { totalArea: 20, totalPerimeter: 18, total: 150000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 20, unit: "м²", unitPrice: 7500, total: 150000 }], subtotal: 150000, subtotalAfterHeight: 150000 }], extraItems: [] };
r = await fetch(`${API}/estimates`, { method: "POST", headers: H2, body: JSON.stringify({ roomsData: [{ id: "a", name: "Зал", walls: [500,400,500,400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 20, perimeter: 18, elements: [] }], calculationData: calc, totalArea: 20, clientName: "Бренд-клиент" }) });
const est = await j(r);
check("КП создано участником", r.status === 200 && est.publicId, JSON.stringify(est).slice(0, 100));
const page = await (await fetch(`${BASE}/kp/${est.publicId}`)).text();
const owner = await j(await fetch(`${API}/auth/me`, { headers: H1 }));
const ownerName = (owner.companyName ?? owner.user?.companyName ?? owner.firstName ?? owner.user?.firstName ?? "");
check("публичное КП участника показывает бренд владельца", ownerName && page.includes(ownerName), `ищем «${ownerName}»`);
// уборка
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H2 });
if (est.measurementObjectId) await fetch(`${API}/measurements/${est.measurementObjectId}`, { method: "DELETE", headers: H2 });
const c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
const m2 = c1.members.find((x) => (x.phone ?? "").endsWith("7000000078"));
if (m2) await fetch(`${API}/company/members/${m2.id}`, { method: "DELETE", headers: H1 });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
