// Откат следов QA-агента на реальном объекте «Толе би 26» (946fcb39-…): запись «в цех» от 20.09 ~20:17 (Asia/Almaty),
// событие клиента WORKSHOP_SENT по ней, ручной этап — в авто. Только этот объект, только записи за сегодня.
import { config } from "dotenv"; config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL.replace("-pooler", ""));
const OBJ = "946fcb39-e7c2-4938-9963-bbf906427d31";
const orders = await sql`SELECT id, "sentAt", "roomsCount" FROM "WorkshopOrder" WHERE "measurementObjectId" = ${OBJ} AND "sentAt" > now() - interval '6 hours'`;
console.log("записи в цех за 6 ч:", orders);
for (const o of orders) {
  const ev = await sql`DELETE FROM "ClientEvent" WHERE type = 'WORKSHOP_SENT' AND metadata->>'workshopOrderId' = ${o.id} RETURNING id`;
  const del = await sql`DELETE FROM "WorkshopOrder" WHERE id = ${o.id} RETURNING id`;
  console.log("удалено: order", del.length, "events", ev.length);
}
const st = await sql`UPDATE "MeasurementObject" SET "manualStage" = NULL WHERE id = ${OBJ} RETURNING "manualStage"`;
console.log("manualStage сброшен:", st.length === 1);
const left = await sql`SELECT count(*)::int AS n FROM "WorkshopOrder" WHERE "measurementObjectId" = ${OBJ}`;
console.log("осталось записей в цех у объекта:", left[0].n);
