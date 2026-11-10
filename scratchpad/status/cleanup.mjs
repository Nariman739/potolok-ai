// Уборка по id: все объекты тестового клиента и сам клиент — мягко и навсегда; проверка GET → 404.
import { neon } from "@neondatabase/serverless";
import { open, BASE, state } from "./lib.mjs";
const { browser, api } = await open(390);
const sql = neon(process.env.DATABASE_URL);
const id = state.created.clientId;
const objects = await sql`SELECT id FROM "MeasurementObject" WHERE "clientId" = ${id}`;
for (const o of objects) {
  const r1 = await api.delete(`${BASE}/api/measurements/${o.id}`);
  const r2 = await api.post(`${BASE}/api/measurements/${o.id}/permanent-delete`);
  console.log(`object ${o.id}: ${r1.status()}/${r2.status()}`);
}
const r1 = await api.delete(`${BASE}/api/clients/${id}`);
const r2 = await api.post(`${BASE}/api/clients/${id}/permanent-delete`);
console.log(`client ${id}: ${r1.status()}/${r2.status()}`);
const left = await sql`SELECT count(*)::int AS n FROM "MeasurementObject" WHERE "clientId" = ${id}`;
const rc = await api.get(`${BASE}/api/clients/${id}`);
console.log("после уборки: клиент", rc.status(), "объектов в базе:", left[0].n);
await browser.close();
