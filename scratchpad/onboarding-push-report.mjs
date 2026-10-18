// READ-ONLY: отчёт по пуш-цепочке новичку «не замерил» (крон onboarding-pushes).
// По дням (Алматы) и шагам: сколько пушей ушло и сколько получателей сделали
// первый объект в течение 24 ч после пуша — конверсия цепочки.
// Запуск: node scratchpad/onboarding-push-report.mjs [дней=14]
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]);
const days = Number(process.argv[2] ?? 14);

const rows = await sql`
with p as (
  select "masterId", step, "sentAt",
    (("sentAt" at time zone 'UTC') at time zone 'Asia/Almaty')::date as d
  from "OnboardingPush"
  where "sentAt" > now() - make_interval(days => ${days})),
f as (select "masterId", min("createdAt") first from "MeasurementObject" group by 1)
select to_char(p.d, 'MM-DD') as day, p.step,
  count(*)::int as sent,
  count(*) filter (where f.first > p."sentAt" and f.first < p."sentAt" + interval '24 hours')::int as measured_24h,
  count(*) filter (where f.first > p."sentAt")::int as measured_later
from p left join f on f."masterId" = p."masterId"
group by 1, 2 order by 1, 2`;

if (rows.length === 0) {
  console.log(`За ${days} дн. цепочка ничего не отправляла.`);
} else {
  console.table(rows.map((r) => ({
    день: r.day, шаг: r.step, отправлено: r.sent,
    "замер ≤24ч": r.measured_24h, "замер позже": r.measured_later,
    "конверсия 24ч": r.sent ? Math.round((r.measured_24h / r.sent) * 100) + "%" : "—",
  })));
}

const totals = await sql`
with p as (select "masterId", step, "sentAt" from "OnboardingPush" where "sentAt" > now() - make_interval(days => ${days})),
f as (select "masterId", min("createdAt") first from "MeasurementObject" group by 1)
select p.step, count(*)::int sent,
  count(*) filter (where f.first > p."sentAt" and f.first < p."sentAt" + interval '24 hours')::int measured_24h
from p left join f on f."masterId" = p."masterId" group by 1 order by 1`;
console.log("Итого по шагам:", totals.map((t) => `${t.step}: ${t.sent} → ${t.measured_24h} (${t.sent ? Math.round((t.measured_24h / t.sent) * 100) : 0}%)`).join(" · ") || "пусто");
