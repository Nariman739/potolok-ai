// Дыра S1: QA добавляет по номеру мастера, у которого есть свои объекты (QA2 с объектом) → QA НЕ должен видеть объекты QA2.
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const H1 = await login("+77000000077"), H2 = await login("+77000000078");
let r = await fetch(`${API}/measurements`, { method: "POST", headers: H2, body: JSON.stringify({ address: "QA2 Своя фирма", status: "saved", rooms: [{ name: "Зал", walls: [300,300,300,300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 9, perimeter: 12, elements: [] }] }) });
const m2 = await j(r);
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ phone: "+77000000078" }) });
const inv = await j(r);
check("приглашение создано, регистрация не раскрыта", inv.invited === true && inv.linked === false);
const c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
const mem = c1.members.find((x) => (x.phone ?? "").endsWith("7000000078"));
check("до согласия: не worksHere, masterId и hasApp скрыты", mem && mem.worksHere === false && mem.masterId === null && mem.hasApp === false, JSON.stringify(mem));
const feed1 = await j(await fetch(`${API}/objects`, { headers: H1 }));
check("QA НЕ видит объект QA2", !feed1.some((x) => x.id === m2.id));
const card = await fetch(`${API}/objects/${m2.id}`, { headers: H1 });
check("карточка объекта QA2 для QA → 404", card.status === 404);
const c2 = await j(await fetch(`${API}/company`, { headers: H2 }));
check("QA2 остался в своей компании", c2.isOwner === true);
// уборка
await fetch(`${API}/company/members/${mem.id}`, { method: "DELETE", headers: H1 });
await fetch(`${API}/measurements/${m2.id}`, { method: "DELETE", headers: H2 });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
