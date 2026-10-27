// Кто получил «по Алматы» в текстах КП (пункт I.4, 27.10.2026). Только отчёт.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select m.id, m.phone, m."firstName", m.address, m.currency, m."kpConfig"::text as cfg, b.city as "briefCity"
  from "Master" m left join "MasterBrief" b on b."masterId" = m.id
  where m."kpConfig"::text ilike '%Алматы%' order by m."createdAt"`;
for (const r of rows) {
  const hits = [...r.cfg.matchAll(/[^"]{0,40}Алматы[^"]{0,30}/g)].map((m) => m[0].trim());
  console.log(`…${r.phone.slice(-4)} ${r.firstName} | валюта ${r.currency} | адрес «${r.address ?? ""}» | бриф-город «${r.briefCity ?? ""}»`);
  for (const h of hits.slice(0, 4)) console.log("    ", h);
}
console.log("всего:", rows.length);
