// QA наряда построчно (29.10.2026): логин QA → объект с КП → GET/PUT/reset work-order,
// страница /n/<token> и PDF. Запуск: node --import ./scratchpad/_cache-login.mjs scratchpad/wo-lines-check.mjs [API]
const API = process.argv[2] ?? "http://localhost:3000/api";
const SITE = API.replace(/\/api$/, "");
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
if (!r0.ok) { console.log("login", r0.status, await r0.text()); process.exit(1); }
const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0];
const H = { cookie, "Content-Type": "application/json" };
const j = async (path, init) => { const r = await fetch(`${API}${path}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } }); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b }; };

const list = await j("/objects");
const objs = Array.isArray(list.body) ? list.body : list.body.objects ?? list.body.items ?? [];
console.log("objects:", list.status, objs.length, Object.keys(list.body).slice(0, 5));
let picked = null;
for (const o of objs.slice(0, 15)) {
  const card = await j(`/objects/${o.id}`);
  if (card.status === 200 && card.body.primaryEstimateId) { picked = card.body; break; }
}
if (!picked) { console.log("нет объекта с КП"); process.exit(1); }
console.log("object:", picked.id, picked.address, "fee:", picked.installerFee, "primary:", picked.primaryEstimateId);

const g1 = await j(`/objects/${picked.id}/work-order`);
console.log("\nGET:", g1.status, "edited", g1.body.edited, "total", g1.body.total, "cur", g1.body.currency);
for (const l of g1.body.lines ?? []) console.log("  ", l.room || "—", "|", l.name, "|", l.qty, l.unit, "×", l.price);

const lines = [...(g1.body.lines ?? [])];
if (lines[0]) lines[0] = { ...lines[0], price: lines[0].price + 1 };
lines.push({ key: `own:${Date.now()}`, room: "", name: "Демонтаж старого потолка (QA)", qty: 2, unit: "шт.", price: 5000 });
const p1 = await j(`/objects/${picked.id}/work-order`, { method: "PUT", body: JSON.stringify({ lines }) });
console.log("\nPUT:", p1.status, "edited", p1.body.edited, "total", p1.body.total, p1.body.error ?? "");
const card2 = await j(`/objects/${picked.id}`);
console.log("card installerFee after PUT:", card2.body.installerFee, "money.installerFee:", card2.body.money?.installerFee);

const bad = await j(`/objects/${picked.id}/work-order`, { method: "PUT", body: JSON.stringify({ lines: [{ key: "x", name: "", qty: 1, price: 1 }] }) });
console.log("PUT bad:", bad.status, bad.body.error);

const tok = await j(`/objects/${picked.id}/work-order`, { method: "POST" });
console.log("\nPOST url:", tok.status, tok.body.url);
const page = await fetch(`${SITE}/n/${tok.body.token}`);
const html = await page.text();
console.log("page:", page.status, "payTitle:", html.includes("Работы и оплата") || html.includes("Жұмыстар мен төлем"), "qa line:", html.includes("Демонтаж старого потолка (QA)"), "no fee dup:", !html.includes("За монтаж:"));
const g2 = await j(`/objects/${picked.id}/work-order`);
console.log("GET after PUT: edited", g2.body.edited, "stale", g2.body.stale, "hasEstimate", g2.body.hasEstimate);
const pdf = await fetch(`${SITE}/api/work-order/${tok.body.token}/pdf`);
console.log("pdf:", pdf.status, pdf.headers.get("content-type"), (await pdf.arrayBuffer()).byteLength, "bytes");
const plan = await fetch(`${API}/objects/${picked.id}/installer-plan-pdf`, { headers: { cookie } });
console.log("plan pdf:", plan.status, (await plan.arrayBuffer()).byteLength, "bytes");

const rs = await j(`/objects/${picked.id}/work-order`, { method: "PUT", body: JSON.stringify({ reset: true }) });
console.log("\nreset:", rs.status, "edited", rs.body.edited, "total", rs.body.total);
const card3 = await j(`/objects/${picked.id}`);
console.log("card installerFee after reset (ждём null):", card3.body.installerFee);
const html2 = await (await fetch(`${SITE}/n/${tok.body.token}`)).text();
console.log("page after reset: table hidden (ждём true):", !(html2.includes("Работы и оплата") || html2.includes("Жұмыстар мен төлем")), "qa line gone:", !html2.includes("(QA)"));
// Отправка фиксирует авто-строки и сумму
const tok2 = await j(`/objects/${picked.id}/work-order`, { method: "POST" });
const g3 = await j(`/objects/${picked.id}/work-order`);
const card4 = await j(`/objects/${picked.id}`);
console.log("after POST: same token", tok2.body.token === tok.body.token, "edited", g3.body.edited, "fee", card4.body.installerFee, "total", g3.body.total);
// Вернуть как было: сброс
await j(`/objects/${picked.id}/work-order`, { method: "PUT", body: JSON.stringify({ reset: true }) });
const pdfPath = new URL("./wo-qa.pdf", import.meta.url);
const { writeFileSync } = await import("node:fs");
writeFileSync(pdfPath, Buffer.from(await (await fetch(`${SITE}/api/work-order/${tok.body.token}/pdf`)).arrayBuffer()));
console.log("pdf saved:", pdfPath.pathname);
