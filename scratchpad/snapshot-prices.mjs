// Слепок ответов прайса для сравнения до/после миграции PriceItem (01.10.2026).
// node scratchpad/snapshot-prices.mjs before|after  → scratchpad/prices-snap-<tag>.json ; after — сравнивает с before.
import fs from "node:fs";
const API = process.env.API ?? "https://potolok.ai/api";
const tag = process.argv[2] ?? "before";
const ACCOUNTS = ["+77000000077", "+77000000078"];
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const strip = (v) => { const { createdAt, updatedAt, role, needsReview, ...rest } = v; return rest; };
const snap = {};
for (const phone of ACCOUNTS) {
  const H = await login(phone);
  const prices = await (await fetch(`${API}/prices`, { headers: H })).json();
  const variants = (await (await fetch(`${API}/prices/variants`, { headers: H })).json()).map(strip);
  const custom = await (await fetch(`${API}/custom-items`, { headers: H })).json();
  snap[phone] = { prices, variants, custom: Array.isArray(custom) ? custom.map(strip) : custom };
}
fs.writeFileSync(`scratchpad/prices-snap-${tag}.json`, JSON.stringify(snap, null, 1));
console.log(`snapshot ${tag}:`, Object.entries(snap).map(([p, s]) => `${p}: ${s.prices.length} prices, ${s.variants.length} variants`).join(" | "));
if (tag === "after") {
  const before = JSON.parse(fs.readFileSync("scratchpad/prices-snap-before.json", "utf8"));
  let diffs = 0;
  for (const phone of ACCOUNTS) {
    const b = before[phone], a = snap[phone];
    const bp = Object.fromEntries(b.prices.map((x) => [x.code, x])), ap = Object.fromEntries(a.prices.map((x) => [x.code, x]));
    for (const code of new Set([...Object.keys(bp), ...Object.keys(ap)])) {
      const x = bp[code], y = ap[code];
      if (!x) { console.log(`+ ${phone} новая позиция каталога ${code} (${y.price})`); continue; }
      if (!y) { diffs++; console.log(`❌ ${phone} пропала позиция ${code}`); continue; }
      for (const k of ["price", "installerPrice", "photoUrl", "isHidden", "isCustom", "unit", "category"]) {
        if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) {
          // Понижение дефолтов — ожидаемо только для нетронутых цен
          if (k === "price" && x.isCustom === false && y.isCustom === false) { console.log(`~ ${phone} ${code}: дефолт ${x.price} → ${y.price}`); continue; }
          if (k === "isCustom" && x.isCustom === false) continue;
          diffs++; console.log(`❌ ${phone} ${code}.${k}: ${JSON.stringify(x[k])} → ${JSON.stringify(y[k])}`);
        }
      }
    }
    const bv = Object.fromEntries(b.variants.map((v) => [v.id, v])), av = Object.fromEntries(a.variants.map((v) => [v.id, v]));
    for (const id of new Set([...Object.keys(bv), ...Object.keys(av)])) {
      if (!bv[id] || !av[id]) { diffs++; console.log(`❌ ${phone} вариант ${id} ${!bv[id] ? "появился" : "пропал"}`); continue; }
      for (const k of Object.keys(bv[id])) {
        if (k === "baseCode") continue;
        if (JSON.stringify(bv[id][k]) !== JSON.stringify(av[id][k])) { diffs++; console.log(`❌ ${phone} вариант ${bv[id].name}.${k}: ${JSON.stringify(bv[id][k])} → ${JSON.stringify(av[id][k])}`); }
      }
    }
  }
  console.log(diffs ? `\n${diffs} расхождений` : "\n✅ слепки совпадают (кроме ожидаемого понижения дефолтов и новых позиций каталога)");
  process.exit(diffs ? 1 : 0);
}
