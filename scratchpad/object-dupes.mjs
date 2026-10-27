// Объекты-двойники: один мастер, один адрес, createdAt в пределах 5 с (27.10.2026). Только список.
// node --env-file=.env.local scratchpad/object-dupes.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select m."firstName", m.phone, a.address,
    to_char(a."createdAt" + interval '5 hours', 'DD.MM HH24:MI:SS') as t1,
    to_char(b."createdAt" + interval '5 hours', 'DD.MM HH24:MI:SS') as t2,
    (select count(*) from "MeasurementRoom" r where r."objectId" = a.id)::int as rooms1,
    (select count(*) from "MeasurementRoom" r where r."objectId" = b.id)::int as rooms2,
    a.id as id1, b.id as id2
  from "MeasurementObject" a
  join "MeasurementObject" b on a."masterId" = b."masterId" and a.address = b.address and a."createdAt" < b."createdAt"
    and b."createdAt" - a."createdAt" < interval '5 seconds'
  join "Master" m on m.id = a."masterId"
  where a."deletedAt" is null and b."deletedAt" is null and a.address <> ''
  order by a."createdAt" desc`;
console.log(`пар двойников (живые, <5 с, один адрес): ${rows.length}`);
for (const r of rows) console.log(`${r.firstName ?? ""} …${r.phone.slice(-4)} | «${r.address}» | ${r.t1} (${r.rooms1} комн.) ↔ ${r.t2} (${r.rooms2} комн.) | ${r.id1.slice(0,8)} ${r.id2.slice(0,8)}`);
