// Этап 3b: кто делает + наряд. QA добавляет монтажника без приложения, назначает на объект, получает ссылку наряда.
const API = process.env.API ?? "http://localhost:3000/api";
const BASE = API.replace(/\/api$/, "");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
r = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Наряд, Сатпаева 7", status: "saved", clientName: "QA Заказчик", clientPhone: "+77010000090",
  rooms: [{ name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [{ type: "spot", x: 100, y: 100 }, { type: "spot", x: 200, y: 100 }, { type: "chandelier", x: 250, y: 200 }] }] }) });
const m = await j(r);
let card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("кто замерял проставился автоматически (я)", card.measuredBy && card.measuredBy.name, JSON.stringify(card.measuredBy));
// монтажник без приложения
r = await fetch(`${API}/company`, { method: "POST", headers: H, body: JSON.stringify({ name: "Ерлан монтаж", defaultFee: 60000 }) });
const erlan = (await j(r)).member;
check("монтажник добавлен", erlan?.id);
// назначение
const installAt = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
r = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ installerMemberId: erlan.id, installerFee: 65000, installAt }) });
const p = await j(r);
check("назначен монтажник, сумма, дата", r.status === 200 && p.installer?.id === erlan.id && p.installerFee === 65000 && p.installAt, JSON.stringify(p).slice(0, 200));
r = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ installerMemberId: "chuzhoy" }) });
check("чужой участник → 400", r.status === 400);
// лента и сегодня
const feed = await j(await fetch(`${API}/objects`, { headers: H }));
const row = feed.find((x) => x.id === m.id);
check("в ленте есть installerName/installAt", row?.installerName === "Ерлан монтаж" && row?.installAt, JSON.stringify(row).slice(0, 120));
const t = await j(await fetch(`${API}/today`, { headers: H }));
check("«Сегодня»: монтаж завтра с исполнителем", t.installs?.some((x) => x.id === m.id && x.installer?.name === "Ерлан монтаж" && x.isToday === false), JSON.stringify(t.installs));
// наряд
r = await fetch(`${API}/objects/${m.id}/work-order`, { method: "POST", headers: H });
const wo = await j(r);
check("ссылка наряда", r.status === 200 && /\/n\/[A-Za-z0-9_-]{8,}$/.test(wo.url ?? ""), JSON.stringify(wo));
const wo2 = await j(await fetch(`${API}/objects/${m.id}/work-order`, { method: "POST", headers: H }));
check("ссылка постоянная", wo2.url === wo.url);
const page = await (await fetch(`${BASE}/n/${wo.token}`)).text();
check("публичный наряд открывается", page.includes("Наряд на монтаж") && page.includes("Сатпаева 7") && page.includes("65") && page.includes("Софиты: 2") && page.includes("<svg"), page.length);
const page404 = await fetch(`${BASE}/n/nope-nope-nope`);
check("чужой токен → 404", page404.status === 404);
// уборка
await fetch(`${API}/company/members/${erlan.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
