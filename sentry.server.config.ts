// Sentry для server-side: API routes, server components, cron jobs.
// Это самое критичное место для prod-наблюдения — здесь ловятся:
//   - 500 в API роутах (включая cron-задачи)
//   - Prisma ошибки (P2025, P1001 и т.д.)
//   - Падения rate-limit / ai-cost-cap (fail-open сейчас молчит — Sentry увидит)
//   - Cron job failures (backup-data, instagram-publish, tg-reminders, tg-followups)
//
// SENTRY_DSN отдельный от клиентского (NEXT_PUBLIC_*) — на сервер пускаем
// детальные ошибки, в браузере минимум.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || "development",
  });
}
