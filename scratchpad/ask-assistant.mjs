const API = "https://potolok.ai/api";
const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
const token = cookie.split("=")[1];
const res = await fetch(`${API}/assistant/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: process.argv[2] }) });
const text = await res.text();
const out = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { const d = JSON.parse(l.slice(5)); return d.content ?? d.delta ?? d.text ?? ""; } catch { return ""; } }).join("");
console.log(res.status, (out || text).slice(0, 700));
