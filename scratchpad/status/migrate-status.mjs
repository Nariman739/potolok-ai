// Сверка статуса с ручным этапом канбана (10.11.2026).
// Правило: промежуточный этап (не new/done/lost) + статус NEW → IN_PROGRESS, с событием в историю.
// WON не трогаем: сделка, закрытая раньше, остаётся сделкой (правило applyCrmColumn).
//
//   dry-run (по умолчанию):  node --env-file=.env.local scratchpad/status/migrate-status.mjs
//   только один клиент:      … --client <id>
//   применить:               … --apply [--client <id>]      → лог scratchpad/status/migrate-<ts>.json
//   откат по логу:           … --rollback scratchpad/status/migrate-<ts>.json
import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const apply = args.includes("--apply");
const onlyClient = opt("--client");
const rollback = opt("--rollback");
const REASON = "Сверка со стадией канбана";
const MIDDLE = ["measure", "calc", "kp_sent", "negotiation", "contract", "purchase", "planning", "install_planned", "install"];

if (rollback) {
  const log = JSON.parse(fs.readFileSync(rollback, "utf8"));
  for (const r of log.applied) {
    await sql`UPDATE "Client" SET status = ${r.from}::"DealStatus" WHERE id = ${r.id} AND status = ${r.to}::"DealStatus"`;
    if (r.eventId) await sql`DELETE FROM "ClientEvent" WHERE id = ${r.eventId}`;
    console.log(`откат ${r.id}: ${r.to} → ${r.from}`);
  }
  console.log(`откатено: ${log.applied.length}`);
  process.exit(0);
}

const rows = await sql`SELECT id, name, status::text AS status, "crmColumn" AS col FROM "Client"
  WHERE "deletedAt" IS NULL AND "crmColumn" = ANY(${MIDDLE}) AND status = 'NEW'
  ${onlyClient ? sql`AND id = ${onlyClient}` : sql``} ORDER BY "updatedAt" DESC`;
console.log(`${apply ? "ПРИМЕНЯЮ" : "dry-run"}: кандидатов ${rows.length}`);
for (const r of rows) console.log(`  ${r.id}  ${r.col.padEnd(16)} ${r.status} → IN_PROGRESS  (${r.name})`);
if (!apply) process.exit(0);

const applied = [];
for (const r of rows) {
  await sql`UPDATE "Client" SET status = 'IN_PROGRESS' WHERE id = ${r.id} AND status = 'NEW'`;
  const ev = await sql`INSERT INTO "ClientEvent" (id, "clientId", type, content, metadata, "createdAt")
    VALUES (gen_random_uuid(), ${r.id}, 'STATUS_CHANGE', ${REASON}, ${JSON.stringify({ from: "NEW", to: "IN_PROGRESS", migration: "status-sync-2026-11-10" })}::jsonb, now())
    RETURNING id`;
  applied.push({ id: r.id, from: "NEW", to: "IN_PROGRESS", eventId: ev[0].id });
}
const file = `scratchpad/status/migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), applied }, null, 1));
console.log(`применено: ${applied.length}, лог ${file}`);
