// Distributed rate-limiter backed by Upstash Redis (REST).
//
// API surface compatible с предыдущей in-memory версией:
//   checkRateLimit(key, maxAttempts?, windowMs?) → {allowed, retryAfterMs}
//   clearRateLimit(key)
// — но теперь async (Upstash REST). Все call-sites обёрнуты `await`.
//
// In-memory счётчики не работали корректно на Vercel: каждая лямбда — свой
// инстанс, защита расходилась в 5-10× в зависимости от scale-out. Здесь
// атомарный INCR + EXPIRE в Redis даёт единый счётчик для всего флота.
//
// Fail-open: если UPSTASH_* env не сконфигурированы ИЛИ Upstash недоступен
// (network error / 5xx), запрос разрешается. Лучше пропустить чем уронить
// весь API — log в console.error для алертинга.

import { Redis } from "@upstash/redis";

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

export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const r = getRedis();
  if (!r) return { allowed: true, retryAfterMs: 0 };

  const fullKey = `ratelimit:${key}`;
  try {
    const pipe = r.pipeline();
    pipe.incr(fullKey);
    pipe.pttl(fullKey);
    const result = (await pipe.exec()) as [number, number];
    const count = Number(result[0]);
    const pttl = Number(result[1]);

    // -1 = no TTL set (first hit or expired key racing with incr).
    if (count === 1 || pttl < 0) {
      await r.pexpire(fullKey, windowMs);
      return { allowed: true, retryAfterMs: 0 };
    }

    if (count > maxAttempts) {
      return { allowed: false, retryAfterMs: pttl };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    console.error("[rate-limit] Upstash error, failing open:", err);
    return { allowed: true, retryAfterMs: 0 };
  }
}

export async function clearRateLimit(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`ratelimit:${key}`);
  } catch (err) {
    console.error("[rate-limit] Upstash error in clearRateLimit:", err);
  }
}
