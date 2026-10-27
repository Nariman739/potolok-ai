// Объекты одного мастера с запуска поштучно: node --env-file=.env.local scratchpad/billing-master-objects.mjs 2517
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const tail = process.argv[2] ?? "2517";
const LAUNCH = process.env.BILLING_LAUNCH_AT ?? "2026-10-25T17:35:00+05:00";
const f = (d) => (d ? new Date(d).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", hour12: false }).slice(0, 17) : "-");
const rows = await sql`select o.id, o.address, o."createdAt", o."deletedAt", o."totalArea",
   (select count(*) from "MeasurementRoom" r where r."objectId"=o.id)::int rooms,
   (select string_agg(e.status || (case when e."deletedAt" is null then '' else ' (удалено)' end) || ' ' || coalesce(e.total,0)::text || ' ' || to_char(e."createdAt" at time zone 'Asia/Almaty','DD.MM HH24:MI'), '; ') from "Estimate" e where e."measurementObjectId"=o.id) kps
  from "MeasurementObject" o join "Master" m on m.id=o."masterId"
  where m.phone like ${"%" + tail} and o."createdAt" >= ${LAUNCH}::timestamptz order by o."createdAt"`;
for (const r of rows) console.log(f(r.createdAt), "|", r.deletedAt ? "УДАЛЁН " + f(r.deletedAt) : "живой", "|", r.rooms, "комн", r.totalArea, "м²", "| адрес:", JSON.stringify(r.address), "| КП:", r.kps ?? "-");
