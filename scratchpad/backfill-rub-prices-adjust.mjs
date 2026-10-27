// Поправка рублёвых дефолтов после сверки с рынком РФ (27.10.2026, второй проход).
// Трогаем только строки из лога первого бэкфилла (и QA RU), у которых цена всё ещё равна
// старому рублёвому дефолту — т.е. мастер их не менял. node --env-file=.env.local scratchpad/backfill-rub-prices-adjust.mjs --apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const apply = process.argv.includes("--apply");
const CHANGES = {"profile_plastic": [150, 200], "insert": [100, 70], "profile_aluminum": [450, 350], "led_strip": [900, 800], "chandelier": [400, 800], "chandelier_install": [1000, 800], "pipe_bypass": [500, 350], "light_line": [3500, 3000], "demontage": [100, 250], "corner_plastic": [150, 250], "min_order": [15000, 12000]};
const log = JSON.parse(readFileSync(new URL("./backfill-rub-currency.log.json", import.meta.url), "utf8"));
const byCode = {};
for (const p of log.prices) if (CHANGES[p.code]) (byCode[p.code] ??= []).push(p.id);
let total = 0;
for (const [code, [oldV, newV]] of Object.entries(CHANGES)) {
  const ids = byCode[code] ?? [];
  // + все компании рублёвых мастеров, где цена = старый рублёвый дефолт (QA RU и новые регистрации сегодня)
  const rows = await sql`select p.id from "PriceItem" p join "Company" c on c.id = p."companyId" join "Master" m on m.id = c."ownerId"
    where m.currency = 'RUB' and p."templateCode" = ${code} and p.price = ${oldV} and p."deletedAt" is null`;
  const set = new Set([...ids, ...rows.map((r) => r.id)]);
  console.log(code, `${oldV} → ${newV}:`, set.size, "строк");
  total += set.size;
  if (apply && set.size) await sql`update "PriceItem" set price = ${newV}, "updatedAt" = now() where id = any(${[...set]}::text[]) and price = ${oldV}`;
}
console.log(apply ? `ГОТОВО: обновлено ${total}` : `DRY RUN: затронет ${total} строк — добавьте --apply`);
