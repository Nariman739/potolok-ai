// Проверка пункта I на проде: ИИ не выдумывает город, страна по валюте (27.10.2026).
// QA RU +79990000077 — без города в профиле. node scratchpad/verify-kp-city.mjs
const API = "https://potolok.ai/api";
let res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+79990000077", password: "qa12345" }) });
const cookie = res.headers.get("set-cookie")?.split(";")[0];
const H = { "Content-Type": "application/json", Cookie: cookie };
const bad = /Алматы|Астан|Казахстан|Almaty/i;
for (const field of ["tagline", "about.body"]) {
  res = await fetch(`${API}/ai/copy-suggest`, { method: "POST", headers: H, body: JSON.stringify({ field, context: { city: "" }, n: 3 }) });
  const j = await res.json();
  const texts = (j.suggestions ?? []).map((s) => s.text);
  console.log(bad.test(texts.join(" ")) ? "❌" : "✅", field, res.status, JSON.stringify(texts));
}
