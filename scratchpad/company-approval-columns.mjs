// Сверка перед деплоем «подтверждения владельцем» (только чтение).
// node --env-file=.env.local scratchpad/company-approval-columns.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const want = { pendingSince: "timestamp without time zone", pendingBringData: "boolean", rejectedAt: "timestamp without time zone", approvalPushAt: "timestamp without time zone" };
const rows = await sql`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='Member' and column_name = any(${Object.keys(want)})`;
let bad = 0;
for (const [name, type] of Object.entries(want)) {
  const r = rows.find((x) => x.column_name === name);
  const fine = r && r.data_type === type && r.is_nullable === "YES";
  if (!fine) bad++;
  console.log(`${fine ? "✅" : "❌"} Member.${name}: ${r ? `${r.data_type}, nullable=${r.is_nullable}` : "НЕТ КОЛОНКИ"}`);
}
console.log(bad ? `НЕ ГОТОВО: ${bad} — сайт не деплоить` : "ГОТОВО: можно деплоить сайт");
process.exit(bad ? 1 : 0);
