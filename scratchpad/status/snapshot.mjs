// Снимок статусов и колонок всех живых клиентов (только чтение).
//   node --env-file=.env.local scratchpad/status/snapshot.mjs before.json
//   node --env-file=.env.local scratchpad/status/snapshot.mjs after.json --compare before.json --ignore id1,id2
import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [out, ...rest] = process.argv.slice(2);
const compare = rest.includes("--compare") ? rest[rest.indexOf("--compare") + 1] : null;
const ignore = new Set((rest.includes("--ignore") ? rest[rest.indexOf("--ignore") + 1] : "").split(",").filter(Boolean));
const rows = await sql`SELECT id, status::text AS status, "crmColumn" AS col FROM "Client" WHERE "deletedAt" IS NULL ORDER BY id`;
fs.writeFileSync(out, JSON.stringify(rows, null, 0));
console.log(`снимок: ${rows.length} клиентов → ${out}`);
if (compare) {
  const before = new Map(JSON.parse(fs.readFileSync(compare, "utf8")).map((r) => [r.id, r]));
  let same = 0;
  const diffs = [];
  for (const r of rows) {
    if (ignore.has(r.id)) continue;
    const b = before.get(r.id);
    if (!b) { diffs.push(`новый ${r.id}`); continue; }
    if (b.status === r.status && b.col === r.col) same++;
    else diffs.push(`${r.id}: ${b.status}/${b.col} → ${r.status}/${r.col}`);
  }
  for (const [id] of before) if (!rows.some((r) => r.id === id) && !ignore.has(id)) diffs.push(`пропал ${id}`);
  console.log(`совпали байт в байт: ${same}; расхождений: ${diffs.length}`);
  diffs.forEach((d) => console.log("  " + d));
  process.exitCode = diffs.length ? 1 : 0;
}
