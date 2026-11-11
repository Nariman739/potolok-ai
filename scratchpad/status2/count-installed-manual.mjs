import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
// Клиенты с ручной колонкой ниже «Завершён», у которых главный (новейший) объект смонтирован/закрыт
const rows = await sql`
WITH main AS (
  SELECT DISTINCT ON ("clientId") "clientId", id, "manualStage"
  FROM "MeasurementObject" WHERE "deletedAt" IS NULL ORDER BY "clientId", "createdAt" DESC)
SELECT c.id, c.status, c."crmColumn", m."manualStage"
FROM "Client" c JOIN main m ON m."clientId" = c.id
WHERE c."deletedAt" IS NULL AND c."crmColumn" IS NOT NULL AND c."crmColumn" NOT IN ('done')
  AND m."manualStage" IN ('installed','closed')`;
console.log("ручная колонка < Завершён при смонтированном главном объекте:", rows.length);
for (const r of rows) console.log(r.id.slice(0, 8), r.status, r.crmColumn, r.manualStage);
const manual = await sql`SELECT "crmColumn", status, count(*)::int n FROM "Client" WHERE "deletedAt" IS NULL AND "crmColumn" IS NOT NULL GROUP BY 1,2 ORDER BY 1`;
console.log("все ручные колонки:", JSON.stringify(manual));
