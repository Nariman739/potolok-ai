/**
 * Человеческие сообщения об ошибках AI.
 *
 * OpenRouter в ответе присылает свои технические тексты — вплоть до ссылки на
 * панель управления ключами («403 Key limit exceeded ... openrouter.ai/keys/...»).
 * Мастер видел это прямо в форме и, понятно, пугался. Наружу отдаём короткое
 * объяснение на человеческом языке, а подробности оставляем в логах.
 */

export type UserFacingAiError = {
  message: string;
  /** 503 — «это не вы, это мы»: сервис временно недоступен. */
  status: number;
};

/** Не даём утечь ключам и внутренним ссылкам, даже если текст ошибки попадёт в лог-агрегатор. */
function redact(raw: string): string {
  return raw
    .replace(/sk-[a-zA-Z0-9-_]{8,}/g, "sk-***")
    .replace(/https?:\/\/\S*(keys|workspaces)\S*/g, "[ссылка вырезана]");
}

export function userFacingAiError(err: unknown): UserFacingAiError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const low = raw.toLowerCase();

  // Кончились деньги/лимит ключа — виноваты мы, а не мастер.
  if (
    low.includes("limit exceeded") ||
    low.includes("insufficient credits") ||
    low.includes("quota") ||
    low.includes("402") ||
    (low.includes("403") && low.includes("key"))
  ) {
    return {
      message:
        "AI сейчас недоступен — мы уже занимаемся этим. Попробуйте через час, всё остальное работает как обычно.",
      status: 503,
    };
  }

  // Слишком много запросов — просто подождать.
  if (low.includes("rate limit") || low.includes("429") || low.includes("too many")) {
    return {
      message: "AI сейчас перегружен. Подождите минуту и попробуйте снова.",
      status: 503,
    };
  }

  // Не дождались ответа модели.
  if (
    low.includes("timeout") ||
    low.includes("timed out") ||
    low.includes("aborted") ||
    low.includes("load failed") ||
    low.includes("fetch failed")
  ) {
    return {
      message: "AI не успел ответить. Попробуйте ещё раз — обычно со второго раза получается.",
      status: 504,
    };
  }

  return {
    message: "Не получилось. Попробуйте ещё раз, а если повторится — напишите нам.",
    status: 500,
  };
}

/** Для console.error: техническая суть без секретов. */
export function safeAiErrorLog(err: unknown): string {
  return redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? ""));
}
