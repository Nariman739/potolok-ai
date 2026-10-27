// Сверка счётчика лимита «было» (все объекты с запуска) / «стало» (реальные:
// живые объекты с адресом ИЛИ с живым КП) по всем мастерам с запуска. 27.10.2026.
// Запуск: node scratchpad/billing-real-objects-compare.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const LAUNCH = process.env.BILLING_LAUNCH_AT ?? "2026-10-25T17:35:00+05:00";
const f = (d) => (d ? new Date(d).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", hour12: false }).slice(0, 17) : "-");

const rows = await sql`
  with o as (
    select o.id, o."masterId", o."deletedAt", o.address,
      exists(select 1 from "Estimate" e where e."measurementObjectId" = o.id and e."deletedAt" is null) as has_kp
    from "MeasurementObject" o
    where o."createdAt" >= ${LAUNCH}::timestamptz
  )
  select m."firstName", m."companyName", m.phone, m."paidUntil", m."isOwner",
    count(*)::int as was,
    count(*) filter (where o."deletedAt" is null and (o.address <> '' or o.has_kp))::int as now,
    count(*) filter (where o."deletedAt" is not null)::int as deleted,
    count(*) filter (where o."deletedAt" is null and o.address = '' and not o.has_kp)::int as drafts,
    count(*) filter (where o.has_kp)::int as with_kp,
    count(*) filter (where o."deletedAt" is not null and o.has_kp)::int as deleted_with_kp
  from o join "Master" m on m.id = o."masterId"
  where m.phone <> '+77000000077'
  group by m.id order by was desc, m."firstName"`;

console.log(`с запуска ${LAUNCH} (без QA): было | стало | удалено | черновики без адреса/КП | с живым КП | удалённые с КП`);
let sumWas = 0, sumNow = 0;
for (const r of rows) {
  sumWas += r.was; sumNow += r.now;
  const mark = r.was !== r.now ? "←" : " ";
  console.log(
    " ", String(r.was).padStart(2), "|", String(r.now).padStart(2), mark, "|", String(r.deleted).padStart(2), "|",
    String(r.drafts).padStart(2), "|", String(r.with_kp).padStart(2), "|", String(r.deleted_with_kp).padStart(2), "|",
    r.paidUntil ? "PRO до " + f(r.paidUntil).slice(0, 10) : "   -  ", "|", r.firstName, r.companyName || "", "…" + r.phone.slice(-4),
  );
}
console.log(`мастеров: ${rows.length}; объектов было ${sumWas} → стало ${sumNow}`);
// Разбивка KZ/RU по номеру (27.10.2026): реклама только на Казахстан, Россия приходит сама.
const ru = rows.filter((r) => /^\+79\d{9}$/.test(r.phone));
const kz = rows.filter((r) => !/^\+79\d{9}$/.test(r.phone));
const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
console.log(`KZ: ${kz.length} мастеров, объектов ${sum(kz, "was")} → ${sum(kz, "now")}; RU (+79): ${ru.length} мастеров, ${sum(ru, "was")} → ${sum(ru, "now")}`);
const atLimit = rows.filter((r) => r.was >= 10);
console.log("упирались в лимит по-старому (≥10):", atLimit.map((r) => `${r.firstName} ${r.was}→${r.now}`).join(", ") || "никто");
