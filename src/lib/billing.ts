/**
 * Единый рубильник монетизации + правила доступа (решения Наримана 12.10.2026).
 *
 * Пока BILLING_ENABLED выключен — сервис бесплатный для всех, доступ никому
 * не режем. Всё платное (баннеры, кнопка оплаты, лимит объектов) прячется за
 * этим флагом, чтобы не путать мастеров, которые пришли просто работать.
 *
 * Когда включим (BILLING_ENABLED=true и NEXT_PUBLIC_BILLING_ENABLED=true в
 * Vercel), правила такие:
 *  - старые мастера (зарегистрированы до BILLING_LAUNCH_AT) до FREE_UNTIL
 *    (23 ноября 2026) работают как PRO — без рассылки, просто плашка;
 *  - новые (с рекламы) — сразу по правилам: первые FREE_OBJECTS_LIMIT объектов
 *    бесплатно, дальше PRO. По ним и смотрим настоящую конверсию;
 *  - PRO у тех, у кого paidUntil в будущем (или owner);
 *  - бесплатный тариф: первые FREE_OBJECTS_LIMIT объектов за всё время (считаем
 *    созданные, включая удалённые — иначе удалением можно обнулять счётчик),
 *    старые объекты/КП/договоры открыты всегда;
 *  - стартовая цена (1 990 вместо 4 990) — на каждую оплату до LAUNCH_PRICE_UNTIL
 *    (31 декабря 2026), только помесячно. Ничего на год не фиксируем
 *    (решение Наримана 14.10): после даты — обычная цена для всех.
 */
import { prisma } from "@/lib/prisma";

export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

export { BILLING_ENABLED_CLIENT } from "@/lib/billing-client";
export type { BillingPeriod, BillingStatus } from "@/lib/billing-client";
import type { BillingStatus } from "@/lib/billing-client";

// ── Цены (₸). Через env, чтобы менять без деплоя кода ────────────────────
export const PRICE_MONTH = Number(process.env.STANDARD_PRICE ?? 4990);
export const PRICE_YEAR = Number(process.env.YEAR_PRICE ?? 39900);
/** Стартовая цена за месяц — действует на оплаты до LAUNCH_PRICE_UNTIL. */
export const LAUNCH_PRICE_MONTH = Number(process.env.LAUNCH_PRICE ?? 1990);

// ── Даты ─────────────────────────────────────────────────────────────────
/**
 * День включения оплаты. Кто зарегистрировался раньше — «старый», ему
 * бесплатно до FREE_UNTIL. Кто позже — сразу по правилам бесплатного тарифа.
 * Ставим в Vercel в день включения флага.
 */
export const BILLING_LAUNCH_AT = new Date(process.env.BILLING_LAUNCH_AT ?? "2026-10-20T00:00:00+05:00");
/** До этой даты старым мастерам бесплатно (пишем в плашке). */
export const FREE_UNTIL = new Date(process.env.FREE_UNTIL ?? "2026-11-23T00:00:00+05:00");
/** До этой даты (не включая) каждая оплата — по стартовой цене. */
export const LAUNCH_PRICE_UNTIL = new Date(process.env.LAUNCH_PRICE_UNTIL ?? "2027-01-01T00:00:00+05:00");

export function isLaunchPriceOpen(now = new Date()): boolean {
  return now < LAUNCH_PRICE_UNTIL;
}

/** Бесплатный тариф: первые N объектов за всё время. */
export const FREE_OBJECTS_LIMIT = Number(process.env.FREE_OBJECTS_LIMIT ?? 10);

export function daysUntil(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** Сколько объектов мастер создал за всё время (включая удалённые). */
export async function countObjectsEver(masterId: string): Promise<number> {
  return prisma.measurementObject.count({ where: { masterId } });
}

/**
 * Статус подписки мастера — одна функция для сайта, API и мобилки.
 * Не бросает: при любой ошибке считаем, что доступ есть (замер важнее биллинга).
 */
export async function getBillingStatus(masterId: string): Promise<BillingStatus> {
  const now = new Date();
  const prices = {
    month: PRICE_MONTH,
    year: PRICE_YEAR,
    launchMonth: LAUNCH_PRICE_MONTH,
  };
  const base = {
    launchPrice: isLaunchPriceOpen(now),
    launchPriceUntil: LAUNCH_PRICE_UNTIL.toISOString(),
    freeUntil: FREE_UNTIL.toISOString(),
    objectsLimit: FREE_OBJECTS_LIMIT,
    prices,
  };

  try {
    const [m, objectsUsed] = await Promise.all([
      prisma.master.findUnique({
        where: { id: masterId },
        select: { isOwner: true, paidUntil: true, createdAt: true },
      }),
      countObjectsEver(masterId),
    ]);
    const paidUntil = m?.paidUntil ?? null;
    const paid = !!paidUntil && paidUntil > now;
    const isNewMaster = !!m && m.createdAt >= BILLING_LAUNCH_AT;
    const enforced = BILLING_ENABLED && (isNewMaster || now >= FREE_UNTIL);

    let proReason: BillingStatus["proReason"] = null;
    if (m?.isOwner) proReason = "owner";
    else if (paid) proReason = "paid";
    else if (!enforced) proReason = "free_period";

    const isPro = proReason !== null;
    return {
      ...base,
      enforced,
      freePeriod: BILLING_ENABLED && !enforced && !m?.isOwner && !paid,
      isPro,
      proReason,
      paidUntil: paidUntil ? paidUntil.toISOString() : null,
      daysLeft: daysUntil(paidUntil, now),
      objectsUsed,
      canCreateObject: isPro || objectsUsed < FREE_OBJECTS_LIMIT,
    };
  } catch (err) {
    console.error("getBillingStatus failed, allowing access:", err);
    return {
      ...base,
      enforced: false,
      freePeriod: false,
      isPro: true,
      proReason: "free_period",
      paidUntil: null,
      daysLeft: null,
      objectsUsed: 0,
      canCreateObject: true,
    };
  }
}

/**
 * Проверка перед созданием объекта. Возвращает null, если можно, иначе —
 * готовый JSON для ответа 402 (мобилка показывает текст как есть).
 */
export async function checkObjectLimit(masterId: string): Promise<null | {
  status: 402;
  body: { error: string; code: "OBJECT_LIMIT"; used: number; limit: number };
}> {
  const s = await getBillingStatus(masterId);
  if (s.canCreateObject) return null;
  return {
    status: 402,
    body: {
      error: `Бесплатные ${s.objectsLimit} объектов использованы. Старые замеры и КП открыты, а для новых нужен тариф PRO — оформить можно на сайте potolok.ai.`,
      code: "OBJECT_LIMIT",
      used: s.objectsUsed,
      limit: s.objectsLimit,
    },
  };
}
