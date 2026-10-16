// Next.js instrumentation hook — здесь Sentry стартует на сервере и edge
// в правильный момент жизненного цикла (до первого запроса).
//
// ⚠️ Файл обязан лежать в src/ (а не в корне), потому что приложение в src/:
// с 06.06 по 16.10.2026 он лежал в корне, Next его не подхватывал, и сервер
// 132 дня не отправлял в Sentry ни одной ошибки.
//
// Конфиги лежат в корне: sentry.{server,edge}.config.ts.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Необработанные ошибки в route handlers / server components → Sentry.
export const onRequestError = Sentry.captureRequestError;
