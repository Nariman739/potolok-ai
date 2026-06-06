// Next.js instrumentation hook — здесь Sentry стартует на сервере
// в правильный момент жизненного цикла (до первого запроса).
//
// Конфиги лежат в sentry.{server,edge}.config.ts.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// onRequestError автоматически подхватывается Next.js + Sentry SDK,
// дополнительный экспорт здесь не нужен в актуальной версии.
