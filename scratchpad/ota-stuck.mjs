// READ-ONLY: кто сидит на встроенном бандле (OTA не доехал) — по мастерам за N дней.
// Запуск: node scratchpad/ota-stuck.mjs [дней=7] [--all]   (--all: печатать всех, а не только embedded)
// Поля updateId/embedded в AppEvent пишутся с 04.11.2026 (track.ts + /api/events);
// события старых клиентов — null («?»). Россия = телефон +79… (ещё +78… — стационарные, редко).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]);
const DAYS = Number(process.argv[2] ?? 7) || 7;
const ALL = process.argv.includes("--all");
const QA = ["+77000000077", "+79990000077"];

// Последнее событие каждого мастера (платформа/версия/updateId/embedded) + запуски.
const rows = await sql`
  with last as (
    select distinct on (e."masterId") e."masterId", e.platform, e."appVersion", e."updateId", e.embedded, e."createdAt"
    from "AppEvent" e
    where e."createdAt" > now() - make_interval(days => ${DAYS})
    order by e."masterId", e."createdAt" desc
  ),
  launches as (
    select "masterId", count(*)::int n
    from "AppEvent"
    where name = 'push_registered' and "createdAt" > now() - make_interval(days => ${DAYS})
    group by 1
  ),
  known as (
    -- последнее событие, где поле embedded вообще пришло (новый клиент)
    select distinct on (e."masterId") e."masterId", e."updateId", e.embedded, e."createdAt"
    from "AppEvent" e
    where e."createdAt" > now() - make_interval(days => ${DAYS}) and e.embedded is not null
    order by e."masterId", e."createdAt" desc
  )
  select m.phone, coalesce(nullif(m."companyName",''), nullif(m."firstName",''), '—') name,
         l.platform, l."appVersion", k."updateId", k.embedded, k."createdAt" known_at, l."createdAt" last_at,
         coalesce(la.n, 0) launches,
         (m.phone like '+79%' or m.phone like '+78%') ru
  from last l
  join "Master" m on m.id = l."masterId"
  left join launches la on la."masterId" = l."masterId"
  left join known k on k."masterId" = l."masterId"
  where m.phone <> all(${QA})
  order by ru desc, k.embedded desc nulls last, l."createdAt" desc`;

const fmt = (d) => (d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }) : "—");
const total = rows.length;
const known = rows.filter((r) => r.embedded !== null);
const emb = known.filter((r) => r.embedded === true);
const ru = rows.filter((r) => r.ru);
const ruKnown = ru.filter((r) => r.embedded !== null);
const ruEmb = ruKnown.filter((r) => r.embedded === true);

console.log(`Активных мастеров за ${DAYS} дн: ${total}; с новым клиентом (поле embedded пришло): ${known.length}; на ВСТРОЕННОМ бандле: ${emb.length}`);
console.log(`Россия (+79/+78): ${ru.length}; с новым клиентом ${ruKnown.length}; на встроенном: ${ruEmb.length}`);
const byVer = {};
for (const r of emb) byVer[`${r.platform} ${r.appVersion}`] = (byVer[`${r.platform} ${r.appVersion}`] ?? 0) + 1;
if (emb.length) console.log("embedded по сборкам:", Object.entries(byVer).map(([k, v]) => `${k}: ${v}`).join(" · "));
const byUpd = {};
for (const r of known) byUpd[`${r.updateId ?? "null"}${r.embedded ? " (emb)" : ""}`] = (byUpd[`${r.updateId ?? "null"}${r.embedded ? " (emb)" : ""}`] ?? 0) + 1;
console.log("updateId у новых клиентов:", Object.entries(byUpd).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—");

const list = ALL ? rows : rows.filter((r) => r.embedded === true || r.ru);
console.log(`\n${ALL ? "Все" : "Застрявшие и Россия"} (${list.length}):`);
console.log("флаг  телефон        платф   версия        update   emb  запуски  последнее         имя");
for (const r of list) {
  const e = r.embedded === null ? "?" : r.embedded ? "ДА" : "нет";
  console.log(
    `${r.ru ? "🇷🇺" : "  "}  ${r.phone.padEnd(14)} ${String(r.platform ?? "—").padEnd(7)} ${String(r.appVersion ?? "—").padEnd(13)} ${String(r.updateId ?? "—").padEnd(8)} ${e.padEnd(4)} ${String(r.launches).padStart(4)}     ${fmt(r.last_at)}  ${r.name}`,
  );
}
