// Бэкфилл валюты для мастеров из России (27.10.2026, решение Наримана).
//   1) Master.currency: 'KZT' → 'RUB' у всех с номером +79XXXXXXXXX (currencyForPhone
//      появилась 07.10, старые сидели на тенге и видели «₸» в КП/договоре).
//   2) PriceItem своей компании: строки, которые мастер НЕ трогал (цена = дефолт ₸
//      каталога, включая старые дефолты до понижения 01.10) → рублёвый дефолт.
//      Тронутые цены не пересчитываем (как и 07.10): меняется только знак.
// Запуск: node --env-file=.env.local scratchpad/backfill-rub-currency.mjs [--apply]
// Без --apply — только отчёт. Откат по id — в scratchpad/backfill-rub-currency.log.json.
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
import { PRODUCT_ITEMS, DEFAULT_PRICES_RUB, LOWERED_DEFAULTS_2026_10 } from "../src/lib/constants.ts";

const sql = neon(process.env.DATABASE_URL);
const apply = process.argv.includes("--apply");

const kztDefaults = new Map(PRODUCT_ITEMS.map((i) => [i.code, new Set([i.defaultPrice])]));
for (const [code, { from }] of Object.entries(LOWERED_DEFAULTS_2026_10)) kztDefaults.get(code)?.add(from);

const masters = await sql`
  select m.id, m.phone, m."firstName", m."companyName", m.currency, c.id as "companyId",
    (select count(*)::int from "MeasurementObject" o where o."masterId" = m.id and o."deletedAt" is null) as objects
  from "Master" m left join "Company" c on c."ownerId" = m.id
  where m.phone ~ '^\\+79\\d{9}$' and m.currency = 'KZT'
  order by m."createdAt"`;
console.log(`мастеров +79 на тенге: ${masters.length}`);

const log = { at: new Date().toISOString(), apply, masters: [], prices: [] };
let touchedRows = 0, untouchedRows = 0, noCompany = 0;
for (const m of masters) {
  log.masters.push({ id: m.id, phone: m.phone, prevCurrency: m.currency });
  if (!m.companyId) { noCompany++; continue; }
  const rows = await sql`select id, "templateCode", price from "PriceItem" where "companyId" = ${m.companyId} and "deletedAt" is null and "templateCode" is not null`;
  for (const r of rows) {
    const defs = kztDefaults.get(r.templateCode);
    const rub = DEFAULT_PRICES_RUB[r.templateCode];
    if (!defs || rub == null) continue;
    if (defs.has(r.price)) {
      untouchedRows++;
      log.prices.push({ id: r.id, code: r.templateCode, prev: r.price, next: rub });
    } else touchedRows++;
  }
}
console.log(`строк прайса: нетронутых (→ ₽) ${untouchedRows}, тронутых (оставляем) ${touchedRows}; без компании ${noCompany}`);
const perMaster = {};
for (const p of log.prices) perMaster[p.id] = 1;
console.log("примеры:", masters.slice(0, 5).map((m) => `${m.firstName} …${m.phone.slice(-4)} (${m.objects} об.)`).join(", "));

if (!apply) { console.log("DRY RUN — добавьте --apply"); process.exit(0); }

await sql`update "Master" set currency = 'RUB' where id = any(${masters.map((m) => m.id)}::text[])`;
for (const p of log.prices) {
  await sql`update "PriceItem" set price = ${p.next}, "updatedAt" = now() where id = ${p.id} and price = ${p.prev}`;
}
writeFileSync(new URL("./backfill-rub-currency.log.json", import.meta.url), JSON.stringify(log, null, 1));
console.log(`ГОТОВО: валюта → RUB у ${masters.length}, цен → ₽ ${log.prices.length}. Лог для отката: scratchpad/backfill-rub-currency.log.json`);
