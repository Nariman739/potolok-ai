// READ-ONLY: статистика лендинга /app — просмотры и нажатия на кнопку стора (из рекламы)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]);
const days = await sql`
  SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Almaty','MM-DD') d,
    COUNT(*) FILTER (WHERE event='view') views,
    COUNT(*) FILTER (WHERE event='click') clicks,
    COUNT(*) FILTER (WHERE event='click' AND platform='ios') ios,
    COUNT(*) FILTER (WHERE event='click' AND platform='android') android,
    COUNT(*) FILTER (WHERE source='instagram') from_ads,
    COUNT(*) FILTER (WHERE event='wa_group') wa
  FROM "AppLinkClick" WHERE source IS DISTINCT FROM 'selftest' AND source IS DISTINCT FROM 'localtest'
  GROUP BY 1 ORDER BY 1`;
console.log("день   просм  клики  ios  android  из_рекламы  в_группу_WA");
for (const r of days) console.log(`${r.d}   ${String(r.views).padStart(5)}  ${String(r.clicks).padStart(5)}  ${String(r.ios).padStart(3)}  ${String(r.android).padStart(7)}  ${String(r.from_ads).padStart(10)}  ${String(r.wa).padStart(11)}`);
const test = await sql`SELECT event, platform, source, to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Almaty','HH24:MI') t FROM "AppLinkClick" WHERE source IN ('selftest','localtest') ORDER BY "createdAt" DESC LIMIT 5`;
console.log("тестовые записи:", test.map(r => `${r.t} ${r.event}/${r.platform}/${r.source}`).join(", ") || "нет");
