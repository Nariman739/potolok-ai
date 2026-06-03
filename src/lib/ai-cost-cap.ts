// AI cost-cap per master per day.
//
// Защита от drain'а OpenRouter-бюджета. Особенно критично в trial-PRO
// (7 дней бесплатно после Феста) — один абуз без cap'а может стоить
// тысячи долларов за час.
//
// Использование в роуте:
//   const budget = await checkAiBudget(master.id, masterRole(master));
//   if (!budget.allowed) return NextResponse.json(
//     { error: "AI daily limit reached", remaining: 0, resetAt: budget.resetAt },
//     { status: 429 },
//   );
//   const result = await callOpenRouter(...);
//   await recordAiUsage(master.id);
//
// check и record намеренно разделены — не хотим списывать неудачные
// запросы (network error к OpenRouter, абор клиентом и т.п.).

import { Redis } from "@upstash/redis";

export type AiRole = "TRIAL" | "PRO" | "OWNER";

const ROLE_LIMITS: Record<AiRole, number> = {
  TRIAL: 50,
  PRO: 500,
  OWNER: Number.POSITIVE_INFINITY,
};

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
  // UTC дата чтобы все инстансы Vercel сошлись на одном «дне», независимо
  // от их таймзоны и от таймзоны юзера.
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

// Resolve role из master-профиля. isOwner → OWNER, PRO/PROPLUS → PRO,
// иначе TRIAL (включая FREE и любые непредвиденные значения).
export function masterRole(master: {
  isOwner?: boolean;
  subscriptionTier?: SubscriptionTier | string | null;
}): AiRole {
  if (master.isOwner) return "OWNER";
  if (master.subscriptionTier === "PRO" || master.subscriptionTier === "PROPLUS") {
    return "PRO";
  }
  return "TRIAL";
}

export async function checkAiBudget(
  masterId: string,
  role: AiRole,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const limit = ROLE_LIMITS[role];
  const resetAt = nextUtcMidnight();

  if (!Number.isFinite(limit)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, resetAt };
  }

  const r = getRedis();
  if (!r) {
    // Fail-open: lib не сконфигурирована — лучше пропустить запрос,
    // чем рисковать заблокировать всех мастеров. Логируем уровнем выше
    // (при инициализации).
    return { allowed: true, remaining: limit, resetAt };
  }

  try {
    const raw = await r.get<number | string | null>(todayKey(masterId));
    const count = typeof raw === "string" ? Number(raw) : (raw ?? 0);
    const remaining = Math.max(0, limit - count);
    return { allowed: count < limit, remaining, resetAt };
  } catch (err) {
    console.error("[ai-cost-cap] Upstash error in checkAiBudget, failing open:", err);
    return { allowed: true, remaining: limit, resetAt };
  }
}

const TTL_SECONDS = 25 * 60 * 60; // 25h — пережить смену суток с запасом.

export async function recordAiUsage(masterId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const key = todayKey(masterId);
  try {
    const pipe = r.pipeline();
    pipe.incr(key);
    pipe.expire(key, TTL_SECONDS);
    await pipe.exec();
  } catch (err) {
    console.error("[ai-cost-cap] Upstash error in recordAiUsage:", err);
  }
}
