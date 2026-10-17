/**
 * Ошибки из catch-блоков API — в консоль И в Sentry (17.10.2026).
 *
 * Sentry сам ловит только необработанные исключения, а почти каждый роут
 * ловит ошибку, пишет console.error и отдаёт 500 — в Sentry такие не попадали,
 * и 132 дня сайт выглядел «здоровым» при живых 5xx. Теперь в критичных
 * роутах вместо console.error — reportError(e, "feature").
 */
import * as Sentry from "@sentry/nextjs";
import { safeAiErrorLog } from "@/lib/ai-errors";

export function reportError(e: unknown, feature: string, message?: string, extra?: Record<string, unknown>): void {
  console.error(`[${feature}]${message ? ` ${message}` : ""}`, e);
  try {
    Sentry.captureException(e, { tags: { feature }, extra: { message, ...extra } });
  } catch {
    /* Sentry выключен или недоступен — лог в консоли уже есть */
  }
}

/** Ошибки ИИ: в консоль без секретов (ключи, ссылки OpenRouter), в Sentry с тегом ai, чтобы фильтровать. */
export function reportAiError(e: unknown, feature: string, message?: string): void {
  const safe = safeAiErrorLog(e);
  console.error(`[${feature}]${message ? ` ${message}` : ""}`, safe);
  try {
    Sentry.captureException(e, { tags: { feature, ai: "true" }, extra: { message, safe } });
  } catch {
    /* см. выше */
  }
}
