// Бэкфилл ширины рулона у своих полотен (PriceItem role=canvas, templateCode null, maxWidthCm null).
// Парсер — тот же, что на сервере (src/lib/price-roles.ts parseRollWidthCm). Идемпотентно.
// Запуск: cd ~/projects/potolok-ai && node scratchpad/backfill-roll-width.mjs [--apply]
import { execSync } from "node:child_process";
import fs from "node:fs";
const url = fs.readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL=")).replace(/^DATABASE_URL=/, "").replace(/^"|"$/g, "").replace("-pooler", "");
function parseRollWidthCm(name) {
  const n = name.toLowerCase().replace(/,/g, ".");
  const toCm = (v) => (v >= 1 && v <= 6 ? Math.round(v * 100) : v >= 100 && v <= 600 ? Math.round(v) : null);
  const range = n.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|до)\s*(\d+(?:\.\d+)?)/);
  if (range) { const hi = toCm(parseFloat(range[2])); if (hi !== null) return hi; }
  const m = n.match(/(\d+(?:\.\d+)?)\s*(?:м(?![м])|m(?![m])|метр)/);
  if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 6) return Math.round(v * 100); }
  const cm = n.match(/(\d{3})(?!\d)(?!\s*мм)/);
  if (cm) { const v = parseInt(cm[1], 10); if (v >= 100 && v <= 600) return v; }
  return null;
}
const rows = JSON.parse(execSync(`psql "${url}" -At -c "select coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]') from \\"PriceItem\\" where role='canvas' and \\"templateCode\\" is null and \\"maxWidthCm\\" is null"`).toString());
const updates = rows.map((r) => ({ ...r, w: parseRollWidthCm(r.name) })).filter((r) => r.w !== null);
for (const r of rows) console.log(`${r.name} → ${parseRollWidthCm(r.name) ?? "любая"}`);
console.log(`\n${updates.length} из ${rows.length} распознано`);
if (process.argv.includes("--apply") && updates.length) {
  const sql = updates.map((u) => `update "PriceItem" set "maxWidthCm"=${u.w} where id='${u.id}';`).join(" ");
  execSync(`psql "${url}" -At -c "${sql.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
  console.log("applied");
}
