// READ-ONLY: прошлые визуализации QA (scene3d) — для сравнения AI-фото «было/стало».
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const m = (await sql`select id from "Master" where phone='+77000000077'`)[0];
const rows = await sql`select v.id, v."sourceType", v.status, v."createdAt", v."originalUrl", v.markup, v."objectId",
  (select count(*) from "VisualizationRender" r where r."visualizationId"=v.id) nr
  from "Visualization" v where v."masterId"=${m.id} and v."sourceType"='scene3d' order by v."createdAt" desc limit 15`;
for (const r of rows) {
  const els = r.markup?.elements ?? [];
  const types = {};
  for (const e of els) types[e.type] = (types[e.type] ?? 0) + 1;
  console.log(r.id, r.status, r.createdAt.toISOString().slice(0, 16), "renders:", r.nr, "obj:", r.objectId?.slice(0, 8), JSON.stringify(types), "profiles:", JSON.stringify(r.markup?.profileSummary ?? r.markup?.wallProfiles ?? null));
}
