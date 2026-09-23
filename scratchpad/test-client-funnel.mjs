const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const tail = String(Date.now()).slice(-6);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const status = async (cid) => { const c = await j(await fetch(`${API}/clients/${cid}`, { headers: H })); return c.status ?? c.client?.status; };
const m = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Воронка " + tail, status: "saved", clientName: "QA Воронка " + tail, clientPhone: "702" + tail,
  rooms: [{ name: "Зал", walls: [437, 293, 437, 293], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12.8, perimeter: 14.6, elements: [] }] }) }));
const cid = m.clientId;
check("клиент создан и «Новый»", cid && (await status(cid)) === "NEW", await status(cid));
const calc = { totalArea: 12.8, totalPerimeter: 14.6, total: 90000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 12.8, unit: "м²", unitPrice: 7031, total: 90000 }], subtotal: 90000, subtotalAfterHeight: 90000 }], extraItems: [] };
const est = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", name: "Зал", walls: [437, 293, 437, 293], angles: [0,0,0,0], area: 12.8, perimeter: 14.6, elements: [] }], calculationData: calc, totalArea: 12.8, fromMeasurementId: m.id, clientId: cid }) }));
await fetch(`${API}/estimates/${est.id}`, { method: "PUT", headers: H, body: JSON.stringify({ status: "SENT" }) });
await wait(1500);
check("отправил КП → «В работе»", (await status(cid)) === "IN_PROGRESS", await status(cid));
r = await fetch(`${API}/objects/${m.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: 40000, kind: "prepayment" }) });
await wait(1500);
check("предоплата → «Сделка»", (await status(cid)) === "WON", await status(cid));
// вручную вниз — и этап не поднимает обратно без нового события
await fetch(`${API}/clients/${cid}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "LOST" }) });
check("мастер поставил «Отказ» — остаётся", (await status(cid)) === "LOST", await status(cid));
await fetch(`${API}/objects/${m.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/clients/${cid}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
