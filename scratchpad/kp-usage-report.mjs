// Отчёт «как работают КП»: сколько делают, кто, открывают ли клиенты, подтверждают ли.
// Только чтение. Запуск: node --env-file=.env.local scratchpad/kp-usage-report.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const QA = "+77000000077";
const REDESIGN = "2026-10-26T19:00:00+05:00";

const f = (rows, fmt) => rows.map(fmt).join(" | ");

// 1. По неделям: КП, людей, открыто клиентом, подтверждено
const weeks = await sql`
  select to_char(date_trunc('week', e."createdAt" at time zone 'Asia/Almaty'), 'DD.MM') wk,
    count(*)::int kp, count(distinct e."masterId")::int people,
    count(*) filter (where e.status in ('VIEWED','CONFIRMED'))::int viewed,
    count(*) filter (where e.status = 'CONFIRMED')::int confirmed,
    count(*) filter (where e."contractSignedAt" is not null)::int signed,
    count(*) filter (where e."deletedAt" is not null)::int deleted
  from "Estimate" e join "Master" m on m.id = e."masterId"
  where e."createdAt" > now() - interval '8 weeks' and m.phone <> ${QA} and e.status <> 'REVISED'
  group by 1 order by 1`;
console.log("ПО НЕДЕЛЯМ (неделя с): кп | людей | открыто клиентом | подтверждено | договор | удалено");
for (const r of weeks) console.log(`  ${r.wk}: ${r.kp} | ${r.people} | ${r.viewed} (${Math.round(100*r.viewed/r.kp)}%) | ${r.confirmed} | ${r.signed} | ${r.deleted}`);

// 2. До/после редизайна 26.10 (одинаковое окно дней)
const cmp = await sql`
  with a as (select * from "Estimate" e where e."createdAt" >= ${REDESIGN}::timestamptz and e.status <> 'REVISED'
             and e."masterId" in (select id from "Master" where phone <> ${QA})),
       b as (select * from "Estimate" e where e."createdAt" >= ${REDESIGN}::timestamptz - (now() - ${REDESIGN}::timestamptz) and e."createdAt" < ${REDESIGN}::timestamptz and e.status <> 'REVISED'
             and e."masterId" in (select id from "Master" where phone <> ${QA}))
  select 'после' p, count(*)::int kp, count(distinct "masterId")::int people,
    count(*) filter (where status in ('VIEWED','CONFIRMED'))::int viewed, count(*) filter (where status='CONFIRMED')::int confirmed from a
  union all
  select 'до', count(*)::int, count(distinct "masterId")::int,
    count(*) filter (where status in ('VIEWED','CONFIRMED'))::int, count(*) filter (where status='CONFIRMED')::int from b`;
const hours = Math.round((Date.now() - new Date(REDESIGN).getTime()) / 36e5);
console.log(`\nДО/ПОСЛЕ РЕДИЗАЙНА (окно ${hours} ч):`, f(cmp, r => `${r.p}: ${r.kp} КП, ${r.people} чел., открыто ${r.viewed}, подтв. ${r.confirmed}`));

// 3. Статусы за 30 дней
const st = await sql`select status, count(*)::int n from "Estimate" e join "Master" m on m.id=e."masterId"
  where e."createdAt" > now() - interval '30 days' and m.phone<>${QA} group by 1 order by 2 desc`;
console.log("\nСТАТУСЫ 30 дней:", f(st, r => `${r.status} ${r.n}`));

// 4. Что внутри КП за 30 дней: обложка, план, имя клиента, формат
const inside = await sql`select count(*)::int n,
  count(*) filter (where "coverPhotoUrl" is not null)::int cover,
  count(*) filter (where "clientName" is not null and "clientName"<>'')::int named,
  count(*) filter (where "roomsData" is not null)::int rooms,
  count(*) filter (where "priceView"='summary')::int summary,
  count(*) filter (where "measurementObjectId" is not null)::int from_measure,
  count(*) filter (where "pdfUrl" is not null)::int pdf
  from "Estimate" e join "Master" m on m.id=e."masterId" where e."createdAt" > now() - interval '30 days' and m.phone<>${QA}`;
console.log("СОСТАВ 30 дней:", inside[0]);

// 5. Настройки мастеров: тема, стиль плана, галерея/портфолио
const cfg = await sql`select "kpConfig" from "Master" where "kpConfig" is not null and phone<>${QA}`;
const themes = {}, plans = {}, gal = { on: 0, off: 0, none: 0 }, port = { on: 0, off: 0, none: 0 };
for (const { kpConfig: c } of cfg) {
  themes[c.template ?? "—"] = (themes[c.template ?? "—"] ?? 0) + 1;
  plans[c.planStyle ?? "default"] = (plans[c.planStyle ?? "default"] ?? 0) + 1;
  const g = (c.sections ?? []).find(s => s.type === "gallery"); gal[g ? (g.enabled ? "on" : "off") : "none"]++;
  const p = (c.sections ?? []).find(s => s.type === "portfolio"); port[p ? (p.enabled ? "on" : "off") : "none"]++;
}
const total = (await sql`select count(*)::int n from "Master" where phone<>${QA}`)[0].n;
const activeNoCfg = await sql`select count(distinct e."masterId")::int n from "Estimate" e join "Master" m on m.id=e."masterId"
  where e."createdAt" > now() - interval '30 days' and m."kpConfig" is null and m.phone<>${QA}`;
console.log(`\nНАСТРОЙКИ КП: с kpConfig ${cfg.length} из ${total} мастеров; активных за 30 дней без настроек: ${activeNoCfg[0].n}`);
console.log("  темы:", Object.entries(themes).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("  стиль плана:", Object.entries(plans).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("  галерея:", JSON.stringify(gal), " портфолио:", JSON.stringify(port));

// 6. Кто меняет настройки после редизайна
const touched = await sql`select count(*)::int n from "Master" where "kpConfig" is not null and "updatedAt" >= ${REDESIGN}::timestamptz and phone<>${QA}`;
console.log("  мастеров с обновлённым профилем после 26.10 (грубо):", touched[0].n);

// 7. Топ мастеров по КП за 14 дней + их открываемость
const top = await sql`select coalesce(m."companyName", m."firstName") as name, m.phone, count(*)::int kp,
  count(*) filter (where e.status in ('VIEWED','CONFIRMED'))::int viewed,
  count(*) filter (where e.status='CONFIRMED')::int conf
  from "Estimate" e join "Master" m on m.id=e."masterId"
  where e."createdAt" > now() - interval '14 days' and m.phone<>${QA} and e.status<>'REVISED'
  group by m.id order by 3 desc limit 10`;
console.log("\nТОП за 14 дней (кп | открыто | подтв.):");
for (const r of top) console.log(`  ${r.name ?? "—"} (${r.phone.slice(0,6)}…): ${r.kp} | ${r.viewed} | ${r.conf}`);

// 8. События CRM: просмотр КП по дням за 14 дней
const ev = await sql`select to_char(("createdAt" at time zone 'Asia/Almaty')::date,'DD.MM') d, count(*)::int n
  from "ClientEvent" where type='KP_VIEWED' and "createdAt" > now() - interval '14 days' group by 1 order by 1`;
console.log("\nКЛИЕНТ ОТКРЫЛ КП по дням:", f(ev, r => `${r.d} ${r.n}`));

// 8b. События мобилки за 14 дней
const ae = await sql`select name, count(*)::int n, count(distinct "masterId")::int people from "AppEvent"
  where "createdAt" > now() - interval '14 days' group by 1 order by 2 desc limit 25`;
console.log("\nСОБЫТИЯ МОБИЛКИ 14 дней:", f(ae, r => `${r.name} ${r.n}/${r.people}`));

// 9. Отзывы мастеров о приложении (если есть таблица фидбека)
try {
  const fb = await sql`select "createdAt", text from "Feedback" where "createdAt" > now() - interval '30 days' order by 1 desc limit 10`;
  console.log("\nФИДБЕК:", fb.length ? fb.map(r => `${r.createdAt.toISOString().slice(0,10)}: ${r.text}`).join("\n  ") : "нет");
} catch { /* нет таблицы */ }
