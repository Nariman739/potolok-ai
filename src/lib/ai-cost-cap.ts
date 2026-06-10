// AI cost-cap per master per day (USD-based).
//
// Защита от drain'а OpenRouter-бюджета. После Феста ожидается наплыв
// мастеров на trial-PRO, без USD-cap один абуз может стоить тысячи $
// за час. Этот модуль:
//   1) считает реальную стоимость каждого вызова из response.usage,
//   2) хранит накопленную сумму $ за день в Upstash Redis,
//   3) блокирует новые вызовы при превышении дневного лимита.
//
// Использование в роуте:
//   const budget = await checkAiBudget(master.id, masterRole(master));
//   if (!budget.allowed) return NextResponse.json(
//     { error: "AI daily limit reached", remainingUsd: 0, resetAt: budget.resetAt },
//     { status: 429 },
//   );
//   const completion = await openai.chat.completions.create({...});
//   await recordAiUsage(master.id, computeCostFromUsage(completion.usage, AI_MODEL));
//
// Для стримов (usage не приходит без stream_options.include_usage):
//   передавать stream_options в create и собирать usage из последнего chunk,
//   либо использовать estimateCostUsd() как fallback по max_tokens.
//
// check и record разделены — не списываем стоимость неудачных запросов
// (network error, abort клиентом и т.п.).

import { Redis } from "@upstash/redis";

export type AiRole = "TRIAL" | "PRO" | "PROPLUS" | "OWNER";

// Дневные лимиты в USD. Намеренно жёсткие — лучше юзер пожалуется
// «упёрся в лимит» чем мы получим $5000 счёт за ночь.
//   TRIAL  ($0.20) ≈ 4-10 средних КП с AI-подсказками
//   PRO    ($1.00) ≈ 20-50 КП
//   PROPLUS($3.00) ≈ 60-150 КП
const ROLE_LIMITS_USD: Record<AiRole, number> = {
  TRIAL: 0.2,
  PRO: 1.0,
  PROPLUS: 3.0,
  OWNER: Number.POSITIVE_INFINITY,
};

// Прайс OpenRouter (USD per 1M tokens) на 2026-06-10. Источник:
// openrouter.ai/models — verify quarterly. Если модель отсутствует
// в списке, используется DEFAULT_PRICE (консервативно завышен).
const DEFAULT_PRICE = { input: 3.0, output: 15.0 };
const MODEL_PRICES_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-opus-4": { input: 15.0, output: 75.0 },
  "anthropic/claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
};

// Image input для Claude Vision: cap ~1500 tokens на картинку
// (длинная сторона ≤1568px, формула w×h/750). Используем как
// fixed-cost-per-image при оценке.
const TOKENS_PER_IMAGE = 1500;

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redis = null;
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

function todayKey(masterId: string): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `aicap:${masterId}:${yyyy}-${mm}-${dd}`;
}

function nextUtcMidnight(): Date {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0),
  );
}

export type SubscriptionTier = "FREE" | "PRO" | "PROPLUS";

export function masterRole(master: {
  isOwner?: boolean;
  subscriptionTier?: SubscriptionTier | string | null;
}): AiRole {
  if (master.isOwner) return "OWNER";
  if (master.subscriptionTier === "PROPLUS") return "PROPLUS";
  if (master.subscriptionTier === "PRO") return "PRO";
  return "TRIAL";
}

export type OpenAiUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

// Точная стоимость в USD из usage ответа OpenRouter/OpenAI.
// Возвращает 0 если usage отсутствует (например стрим без include_usage).
export function computeCostFromUsage(
  usage: OpenAiUsage | null | undefined,
  model: string,
): number {
  if (!usage) return 0;
  const price = MODEL_PRICES_PER_M_TOKENS[model] ?? DEFAULT_PRICE;
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  return (inTok * price.input + outTok * price.output) / 1_000_000;
}

// Upper-bound оценка стоимости ДО вызова — для случаев когда usage
// недоступен (стрим без include_usage) или нужно проверить «влезет ли»
// крупный батч (Instagram pipeline из 5 агентов).
export function estimateCostUsd(args: {
  model: string;
  inputTokens?: number;
  maxOutputTokens: number;
  imageCount?: number;
}): number {
  const price = MODEL_PRICES_PER_M_TOKENS[args.model] ?? DEFAULT_PRICE;
  const inTok = (args.inputTokens ?? 0) + (args.imageCount ?? 0) * TOKENS_PER_IMAGE;
  const outTok = args.maxOutputTokens;
  return (inTok * price.input + outTok * price.output) / 1_000_000;
}

export async function checkAiBudget(
  masterId: string,
  role: AiRole,
): Promise<{ allowed: boolean; remainingUsd: number; resetAt: Date }> {
  const limit = ROLE_LIMITS_USD[role];
  const resetAt = nextUtcMidnight();

  if (!Number.isFinite(limit)) {
    return { allowed: true, remainingUsd: Number.POSITIVE_INFINITY, resetAt };
  }

  const r = getRedis();
  if (!r) {
    // Fail-open: библиотека не сконфигурирована — лучше пропустить
    // запрос, чем заблокировать всех мастеров. Логируем при init.
    return { allowed: true, remainingUsd: limit, resetAt };
  }

  try {
    const raw = await r.get<number | string | null>(todayKey(masterId));
    const spent = typeof raw === "string" ? Number(raw) : (raw ?? 0);
    const remainingUsd = Math.max(0, limit - spent);
    return { allowed: spent < limit, remainingUsd, resetAt };
  } catch (err) {
    console.error("[ai-cost-cap] Upstash error in checkAiBudget, failing open:", err);
    return { allowed: true, remainingUsd: limit, resetAt };
  }
}

const TTL_SECONDS = 25 * 60 * 60; // 25h — пережить смену суток с запасом.

// Записать реальную стоимость вызова в USD. Поддерживает дробные суммы
// через Redis INCRBYFLOAT. costUsd === 0 пропускаем чтобы не зашумлять
// TTL'ы и не делать лишних round-trip'ов.
export async function recordAiUsage(masterId: string, costUsd: number): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  const r = getRedis();
  if (!r) return;
  const key = todayKey(masterId);
  try {
    const pipe = r.pipeline();
    pipe.incrbyfloat(key, costUsd);
    pipe.expire(key, TTL_SECONDS);
    await pipe.exec();
  } catch (err) {
    console.error("[ai-cost-cap] Upstash error in recordAiUsage:", err);
  }
}
