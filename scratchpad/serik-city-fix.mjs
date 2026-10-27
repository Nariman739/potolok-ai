// Разовая правка КП Серика …1327 (адрес «Астана», ИИ написал «по Алматы и области»), 27.10.2026.
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const [m] = await sql`select id, phone, "kpConfig"::text as cfg from "Master" where id = '8cc47b56-de23-45b2-b327-c1ae92dd3032'`;
writeFileSync(new URL("./serik-kpconfig-backup-2026-10-27.json", import.meta.url), m.cfg);
const next = m.cfg.replaceAll("по Алматы и области", "по Астане и области").replaceAll("в Алматы", "в Астане").replaceAll("по Алматы", "по Астане");
if (next === m.cfg) { console.log("нечего менять"); process.exit(0); }
await sql`update "Master" set "kpConfig" = ${next}::jsonb where id = ${m.id}`;
const [a] = await sql`select "kpConfig"::text ilike '%Алматы%' as still from "Master" where id = ${m.id}`;
console.log("ГОТОВО, Алматы осталось:", a.still);
