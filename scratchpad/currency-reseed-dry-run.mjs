// Сколько компаний на проде живут с прайсом «не в своей валюте» (11.11.2026).
// Только чтение. Критерий тот же, что в src/lib/price-reseed.ts (isDefaultPriceBook):
//   «стартовый чужой» — своих позиций и плёнок нет, каждая каталожная строка равна
//                        стартовой цене ДРУГОЙ валюты (текущей или до понижения 01.10)
//                        либо общему значению — при смене валюты такой прайс пересеялся бы;
//   «смешанный»       — есть строки со стартовыми ценами другой валюты, но есть и
//                        правленные/свои — при смене валюты остался бы как есть (подсказка).
// Запуск (из ~/projects/potolok-ai или worktree): node --env-file=.env.local scratchpad/currency-reseed-dry-run.mjs
import { neon } from "@neondatabase/serverless";
import { PRODUCT_ITEMS, DEFAULT_PRICES_RUB, LOWERED_DEFAULTS_2026_10 } from "../src/lib/constants.ts";

const QA = new Set(["+77000000077", "+79990000077"]);
if (!process.env.DATABASE_URL) { console.error("нет DATABASE_URL (запуск с --env-file=.env.local)"); process.exit(2); }
const sql = neon(process.env.DATABASE_URL);

const kzt = new Map(PRODUCT_ITEMS.map((i) => [i.code, new Set([i.defaultPrice])]));
for (const [code, { from }] of Object.entries(LOWERED_DEFAULTS_2026_10)) kzt.get(code)?.add(from);
const rub = new Map(PRODUCT_ITEMS.map((i) => [i.code, new Set([DEFAULT_PRICES_RUB[i.code] ?? i.defaultPrice])]));
const defs = (cur) => (cur === "RUB" ? rub : kzt);

const rows = await sql`
  select c.id as "companyId", m.phone, m.currency, m."createdAt" as "ownerCreatedAt",
         p."templateCode" as code, p."filmKey", p.price
  from "Company" c join "Master" m on m.id = c."ownerId"
  join "PriceItem" p on p."companyId" = c.id and p."deletedAt" is null`;
const byCompany = new Map();
for (const r of rows) {
  if (QA.has(r.phone)) continue;
  let c = byCompany.get(r.companyId);
  if (!c) byCompany.set(r.companyId, (c = { id: r.companyId, phone: r.phone.slice(0, 4) + "…", currency: r.currency ?? "KZT", createdAt: r.ownerCreatedAt, own: 0, mine: 0, foreign: 0, common: 0, custom: 0, minOrder: null }));
  if (!r.code || r.filmKey) { c.own++; continue; }
  const price = Number(r.price);
  if (r.code === "min_order") c.minOrder = price;
  const other = c.currency === "RUB" ? "KZT" : "RUB";
  const inMine = defs(c.currency).get(r.code)?.has(price) ?? false;
  const inOther = defs(other).get(r.code)?.has(price) ?? false;
  if (inMine && inOther) c.common++;
  else if (inMine) c.mine++;
  else if (inOther) c.foreign++;
  else c.custom++;
}

const state = (c) => (c.foreign === 0 ? "ok" : c.mine === 0 && c.custom === 0 && c.own === 0 ? "foreign-default" : "mixed");
const all = [...byCompany.values()];
const tally = {};
for (const c of all) {
  const k = `${c.currency}: ${state(c)}`;
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log(`Компаний с прайсом (без QA): ${all.length}`);
for (const [k, n] of Object.entries(tally).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);

const ids = all.filter((c) => state(c) !== "ok").map((c) => c.id);
const est = ids.length
  ? await sql`select c.id, count(e.id)::int as kp, count(e.id) filter (where e."createdAt" >= now() - interval '30 days')::int as kp30
      from "Company" c join "Master" m on m.id = c."ownerId"
      left join "Estimate" e on e."masterId" = m.id and e."deletedAt" is null
      where c.id = any(${ids}::text[]) group by c.id`
  : [];
const kpOf = new Map(est.map((r) => [r.id, r]));

for (const st of ["foreign-default", "mixed"]) {
  const list = all.filter((c) => state(c) === st).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!list.length) continue;
  console.log(`\n${st === "foreign-default" ? "СТАРТОВЫЙ ПРАЙС ЧУЖОЙ ВАЛЮТЫ (при смене валюты пересеялся бы; сейчас — кандидаты на ручной пересев)" : "СМЕШАННЫЙ (есть чужие стартовые и правленные строки — только подсказка)"}: ${list.length}`);
  for (const c of list) {
    const e = kpOf.get(c.id) ?? { kp: 0, kp30: 0 };
    console.log(`  ${c.id}  владелец ${c.phone} ${c.currency}  зарег. ${new Date(c.createdAt).toISOString().slice(0, 10)}  чужих ${c.foreign} своих-дефолт ${c.mine} правленых ${c.custom} своих позиций ${c.own}  min_order ${c.minOrder}  КП ${e.kp} (30 дн: ${e.kp30})`);
  }
}
console.log("\nТолько чтение — ничего не меняли.");
