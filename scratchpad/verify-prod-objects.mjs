const API = "https://potolok.ai/api";
let res = await fetch(`${API}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone:"+77000000077", password:"qa12345" })});
const cookie = res.headers.get("set-cookie")?.split(";")[0];
console.log("логин на проде:", res.status);
const H = { "Content-Type":"application/json", Cookie: cookie };
res = await fetch(`${API}/today`, { headers: H });
const t = await res.text();
console.log("GET /today:", res.status, res.status === 200 ? `✅ НОВЫЙ КОД В ПРОДЕ, toWorkshop: ${JSON.parse(t).toWorkshop.length}` : `❌ ${t.slice(0,80)}`);
