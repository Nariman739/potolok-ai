// Sentry для браузерного кода (page.tsx client components, dashboard).
// Конфиг загружается автоматически Next.js при наличии файла.
//
// Если NEXT_PUBLIC_SENTRY_DSN не задан — Sentry no-op'ит, build/dev работают.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // 10% сэмплов прозрачно — этого достаточно чтобы видеть тренды
    // без раздутия квоты на бесплатном плане.
    tracesSampleRate: 0.1,
    // Захватываем replay только для сессий с ошибками — на проде
    // нет PII в кадре (мастер видит свои данные, не клиентские).
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  });
}
