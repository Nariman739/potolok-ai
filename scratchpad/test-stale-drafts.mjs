// Старые черновики без имени: посчитать и убрать одной кнопкой (27.09.2026).
const API = process.env.API ?? "https://potolok.ai/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const H = await login("+77000000077");

// Без авторизации — 401
const anon = await fetch(`${API}/estimates/stale-drafts`);
check("без входа не отдаём", anon.status === 401, String(anon.status));

// Считаем
const before = await j(await fetch(`${API}/estimates/stale-drafts`, { headers: H }));
check("ручка считает", typeof before.count === "number" && before.days === 7, JSON.stringify(before));

// Список до: сколько КП-сирот у QA в ленте
const feedBefore = await j(await fetch(`${API}/objects`, { headers: H }));
const orphansBefore = feedBefore.filter((r) => r.kind === "estimate").length;

// Свежий черновик (создан только что) убираться НЕ должен — считаем до/после
const list = await j(await fetch(`${API}/estimates`, { headers: H }));
const namedDrafts = list.filter((e) => e.status === "DRAFT" && (e.clientName || "").trim()).length;

const del = await j(await fetch(`${API}/estimates/stale-drafts`, { method: "DELETE", headers: H }));
check("убрали ровно столько, сколько насчитали", del.removed === before.count, `${del.removed} vs ${before.count}`);
const after = await j(await fetch(`${API}/estimates/stale-drafts`, { headers: H }));
check("после чистки ноль", after.count === 0, JSON.stringify(after));
const listAfter = await j(await fetch(`${API}/estimates`, { headers: H }));
check("черновики с именем клиента не тронуты", listAfter.filter((e) => e.status === "DRAFT" && (e.clientName || "").trim()).length === namedDrafts);
check("КП со статусом не черновик не тронуты", listAfter.filter((e) => e.status !== "DRAFT").length === list.filter((e) => e.status !== "DRAFT").length);
const feedAfter = await j(await fetch(`${API}/objects`, { headers: H }));
check("в ленте КП-сирот стало меньше или столько же", feedAfter.filter((r) => r.kind === "estimate").length === orphansBefore - before.count, `${orphansBefore} → ${feedAfter.filter((r) => r.kind === "estimate").length}, убрано ${before.count}`);
console.log(`\n${ok} ok, ${fail} fail (QA: было ${before.count} старых черновиков)`); process.exit(fail ? 1 : 0);
