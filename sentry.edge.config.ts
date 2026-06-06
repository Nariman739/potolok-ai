// Sentry для edge runtime (middleware, edge functions).
// У нас сейчас edge не используется активно (middleware есть, но minimal).
// Конфиг на будущее — если перейдём на edge, ошибки будут собираться.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || "development",
  });
}
