// QA: зафиксировать строки наряда на QA-объекте (для скринов страницы /n и PDF).
// node --import ./scratchpad/_cache-login.mjs scratchpad/wo-set.mjs [API] [reset]
const API = process.argv[2] ?? "http://localhost:3000/api";
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0];
const H = { cookie, "Content-Type": "application/json" };
const id = "917ab370-8dc5-4d34-b51e-a7ffe6627599";
if (process.argv[3] === "reset") {
  const r = await fetch(`${API}/objects/${id}/work-order`, { method: "PUT", headers: H, body: JSON.stringify({ reset: true }) });
  console.log("reset", r.status); process.exit(0);
}
const g = await (await fetch(`${API}/objects/${id}/work-order`, { headers: H })).json();
const lines = [...g.lines, { key: `own:${Date.now()}`, room: "", name: "Демонтаж старого потолка", qty: 1, unit: "шт.", price: 5000 }];
const p = await fetch(`${API}/objects/${id}/work-order`, { method: "PUT", headers: H, body: JSON.stringify({ lines }) });
const tok = await (await fetch(`${API}/objects/${id}/work-order`, { method: "POST", headers: H })).json();
console.log("put", p.status, "url", tok.url);
