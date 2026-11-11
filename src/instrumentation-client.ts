// Sentry для браузерного кода (client components, dashboard).
// Next 16 (Turbopack) подхватывает только src/instrumentation-client.ts —
// старый sentry.client.config.ts в корне не загружался (перенесён 16.10.2026).
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
    // Мусор встроенного браузера Instagram на Android (с рекламы на /app заходят
    // именно оттуда): внутренний логгер app://navigation_performance_logger_android,
    // не наш код — иначе квота уйдёт на него (17.10.2026).
    // «Connection closed.» — обрыв RSC-потока, когда человек ушёл со страницы
    // раньше, чем она дотекла (Sentry POTOLOK-AI-WEB-A, 11.11.2026, страница 404
    // по склеенной ссылке). Сервер при этом отработал — шум ухода со страницы.
    ignoreErrors: ["Java object is gone", /navigation_performance_logger/, "Connection closed."],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
