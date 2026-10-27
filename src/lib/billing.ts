/**
 * Единый рубильник монетизации + правила доступа.
 *
 * Пока BILLING_ENABLED выключен — сервис бесплатный для всех, доступ никому
 * не режем; оплата по желанию (PAYMENTS_OPEN).
 *
 * Когда включим (BILLING_ENABLED=true в Vercel) — правила одни для всех
 * (решение Наримана 25.10.2026, заменило «старым до 23 ноября»):
 *  - объекты считаем с дня запуска BILLING_LAUNCH_AT — у всех с нуля;
 *  - первые FREE_OBJECTS_LIMIT объектов бесплатно (считаем только реальные:
 *    с адресом или с КП; черновики и пробы не в счёт — см.
 *    countObjectsSinceLaunch);
 *  - потом один объект «в долг» (FREE_GRACE_OBJECTS): мастер у клиента не
 *    остаётся без замера, платит вечером; дальше — только PRO;
 *  - на 8-м и 10-м объекте предупреждаем, при упоре шлём ссылку на оплату
 *    с автовходом (Telegram + пуш) — см. pay-link.ts;
 *  - если флаг включён, а день запуска впереди — ничего не режем, только
 *    плашка «с <дата> первые 10 объектов бесплатно, дальше PRO»;
 *  - PRO у тех, у кого paidUntil в будущем (или owner);
 *  - старые объекты/КП/договоры открыты всегда;
 *  - стартовая цена (1 990 вместо 4 990) — на каждую оплату до LAUNCH_PRICE_UNTIL
 *    (31 декабря 2026), только помесячно; после — обычная цена для всех.
 */
import { prisma } from "@/lib/prisma";
import { currencyFor } from "@/lib/company";
import { asCurrency, type CurrencyCode } from "@/lib/currency";

export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
/**
 * Принимаем ли оплату (кнопки «Оплатить» на /pricing). Отдельно от лимитов:
 * Нариман хочет видеть первые оплаты раньше, чем включит ограничение в 10
 * объектов (14.10.2026). BILLING_ENABLED подразумевает PAYMENTS_OPEN.
 */
export const PAYMENTS_OPEN = BILLING_ENABLED || process.env.PAYMENTS_OPEN === "true";

export { BILLING_ENABLED_CLIENT } from "@/lib/billing-client";
export type { BillingPeriod, BillingStatus } from "@/lib/billing-client";
import type { BillingStatus } from "@/lib/billing-client";

// ── Цены (₸). Через env, чтобы менять без деплоя кода ────────────────────
export const PRICE_MONTH = Number(process.env.STANDARD_PRICE ?? 4990);
export const PRICE_YEAR = Number(process.env.YEAR_PRICE ?? 39900);
/** Стартовая цена за месяц — действует на оплаты до LAUNCH_PRICE_UNTIL. */
export const LAUNCH_PRICE_MONTH = Number(process.env.LAUNCH_PRICE ?? 1990);

// ── Цены в рублях для мастеров из России (27.10.2026). Рынок РФ: «Потолочник»
// (callrec) PRO 390 ₽/мес помесячно, 249 ₽/мес при оплате за год (2 990 ₽),
// Business 990 ₽/мес. Наш старт 390 ₽ — паритет с их помесячной ценой;
// стандарт 790 ₽ — в два раза дороже их помесячной, но у нас 3D, ИИ,
// договоры и наряд; год 6 900 ₽ (≈ −27%). Меняются через env без деплоя.
export const PRICE_MONTH_RUB = Number(process.env.STANDARD_PRICE_RUB ?? 790);
export const PRICE_YEAR_RUB = Number(process.env.YEAR_PRICE_RUB ?? 6900);
export const LAUNCH_PRICE_MONTH_RUB = Number(process.env.LAUNCH_PRICE_RUB ?? 390);

export type BillingPrices = { month: number; year: number; launchMonth: number };

/** Цены подписки в валюте мастера: ₸ — как было, ₽ — рублёвые. */
export function pricesFor(currency: CurrencyCode | string | null | undefined): BillingPrices {
  return asCurrency(currency) === "RUB"
    ? { month: PRICE_MONTH_RUB, year: PRICE_YEAR_RUB, launchMonth: LAUNCH_PRICE_MONTH_RUB }
    : { month: PRICE_MONTH, year: PRICE_YEAR, launchMonth: LAUNCH_PRICE_MONTH };
}

// ── Даты ─────────────────────────────────────────────────────────────────
/**
 * День запуска лимита: объекты считаем с него, у всех с нуля. Задать в Vercel
 * тем же днём, что и BILLING_ENABLED=true. Пока дата впереди — только плашка.
 */
export const BILLING_LAUNCH_AT = new Date(process.env.BILLING_LAUNCH_AT ?? "2026-10-28T00:00:00+05:00");
/** До этой даты (не включая) каждая оплата — по стартовой цене. */
export const LAUNCH_PRICE_UNTIL = new Date(process.env.LAUNCH_PRICE_UNTIL ?? "2027-01-01T00:00:00+05:00");

export function isLaunchPriceOpen(now = new Date()): boolean {
  return now < LAUNCH_PRICE_UNTIL;
}

/** Бесплатный тариф: первые N объектов с дня запуска. */
export const FREE_OBJECTS_LIMIT = Number(process.env.FREE_OBJECTS_LIMIT ?? 10);
/** Сверх лимита — столько объектов «в долг», чтобы не бросать мастера у клиента. */
export const FREE_GRACE_OBJECTS = Number(process.env.FREE_GRACE_OBJECTS ?? 1);

export function daysUntil(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Сколько РЕАЛЬНЫХ объектов мастер завёл с дня запуска (27.10.2026).
 *
 * Первый упёршийся в лимит (Максим, 25.10) имел 11 объектов: 5 удалил, 4 —
 * черновики без адреса (приложение заводит объект, как только мастер начал
 * замер и бросил). Настоящих квартир было 3, а доступ мы закрыли. Решение
 * Наримана: пробы и черновики лимит не тратят. Считаем объект, если он живой
 * (не удалён) и у него есть адрес ИЛИ живое КП (быстрое КП заводит объект без
 * адреса). Удалённые не считаем вовсе — у того же Максима на удалённых
 * объектах были КП, но учебные: считать их значило бы снова закрыть доступ
 * тому, кто пробует. Дырка «удалил старые — освободил места» принята
 * осознанно.
 */
export async function countObjectsSinceLaunch(masterId: string): Promise<number> {
  return prisma.measurementObject.count({
    where: {
      masterId,
      createdAt: { gte: BILLING_LAUNCH_AT },
      deletedAt: null,
      OR: [{ address: { not: "" } }, { estimates: { some: { deletedAt: null } } }],
    },
  });
}

/**
 * Статус подписки мастера — одна функция для сайта, API и мобилки.
 * Не бросает: при любой ошибке считаем, что доступ есть (замер важнее биллинга).
 */
export async function getBillingStatus(masterId: string): Promise<BillingStatus> {
  const now = new Date();
  const base = {
    launchAt: BILLING_LAUNCH_AT.toISOString(),
    launchPrice: isLaunchPriceOpen(now),
    launchPriceUntil: LAUNCH_PRICE_UNTIL.toISOString(),
    objectsLimit: FREE_OBJECTS_LIMIT,
    graceObjects: FREE_GRACE_OBJECTS,
    currency: "KZT" as CurrencyCode,
    prices: pricesFor("KZT"),
  };
  const launched = now >= BILLING_LAUNCH_AT;
  const enforced = BILLING_ENABLED && launched;
  const announce = BILLING_ENABLED && !launched;

  try {
    const [m, objectsUsed, currency] = await Promise.all([
      prisma.master.findUnique({
        where: { id: masterId },
        select: { isOwner: true, paidUntil: true },
      }),
      countObjectsSinceLaunch(masterId),
      // Валюта компании (у участника — владельца): цены подписки в ₽ для России (27.10.2026).
      currencyFor(masterId).catch(() => "KZT" as CurrencyCode),
    ]);
    base.currency = currency;
    base.prices = pricesFor(currency);
    const paidUntil = m?.paidUntil ?? null;
    const paid = !!paidUntil && paidUntil > now;

    let proReason: BillingStatus["proReason"] = null;
    if (m?.isOwner) proReason = "owner";
    else if (paid) proReason = "paid";
    else if (!enforced) proReason = "free_period";
    const isPro = proReason !== null;

    const freeLeft = Math.max(0, FREE_OBJECTS_LIMIT - objectsUsed);
    const hardLimit = FREE_OBJECTS_LIMIT + FREE_GRACE_OBJECTS;
    return {
      ...base,
      enforced,
      announce,
      isPro,
      proReason,
      paidUntil: paidUntil ? paidUntil.toISOString() : null,
      daysLeft: daysUntil(paidUntil, now),
      objectsUsed,
      freeLeft,
      inGrace: !isPro && objectsUsed >= FREE_OBJECTS_LIMIT && objectsUsed < hardLimit,
      graceUsed: !isPro && objectsUsed >= hardLimit,
      canCreateObject: isPro || objectsUsed < hardLimit,
    };
  } catch (err) {
    console.error("getBillingStatus failed, allowing access:", err);
    return {
      ...base,
      enforced: false,
      announce: false,
      isPro: true,
      proReason: "free_period",
      paidUntil: null,
      daysLeft: null,
      objectsUsed: 0,
      freeLeft: FREE_OBJECTS_LIMIT,
      inGrace: false,
      graceUsed: false,
      canCreateObject: true,
    };
  }
}

export type ObjectLimitResponse = {
  status: 402;
  body: {
    error: string;
    code: "OBJECT_LIMIT";
    used: number;
    limit: number;
    /** Ссылка на оплату с автовходом (сутки, одноразовая). Android открывает её; iOS — не показывает. */
    payUrl: string | null;
  };
};

/**
 * Проверка перед созданием объекта. null — можно (в т.ч. объект «в долг»),
 * иначе готовый JSON для ответа 402 (мобилка показывает текст как есть).
 * Заодно шлёт мастеру ссылку на оплату (Telegram + пуш), когда бесплатные
 * кончились — не чаще раза в 3 дня. Импорт ленивый, чтобы не тянуть
 * Telegram/пуши в каждый роут, которому нужен только статус.
 */
export async function checkObjectLimit(masterId: string): Promise<null | ObjectLimitResponse> {
  const s = await getBillingStatus(masterId);
  if (s.isPro) return null;

  const { sendPayNudge, mintPayLink, payChannels } = await import("@/lib/pay-link");

  if (s.canCreateObject) {
    if (s.inGrace) {
      // Этот объект — последний, «в долг». Ссылку шлём сейчас, пока он у клиента.
      await sendPayNudge(masterId, "grace").catch((err) => console.error("pay nudge (grace) failed:", err));
    }
    return null;
  }

  await sendPayNudge(masterId, "blocked").catch((err) => console.error("pay nudge (blocked) failed:", err));
  const [payUrl, ch] = await Promise.all([
    mintPayLink(masterId).catch(() => null),
    payChannels(masterId).catch(() => ({ telegram: false, push: false })),
  ]);
  // Текст показывает мобилка как есть (Alert), в т.ч. на iPhone — без цены и
  // ссылки. Обещаем только тот канал, который у мастера реально есть.
  const rf = s.currency === "RUB" ? " Из России — переводом, за 5 минут." : "";
  const where =
    ch.telegram && ch.push
      ? `Ссылку на оплату отправили вам в Telegram и уведомлением.${rf}`
      : ch.telegram
        ? `Ссылку на оплату отправили вам в Telegram.${rf}`
        : ch.push
          ? `Ссылку на оплату отправили вам уведомлением.${rf}`
          : `Оформить PRO можно на сайте potolok.ai, раздел «Тарифы» — вход по вашему номеру телефона.${rf}`;
  return {
    status: 402,
    body: {
      error: `Бесплатные ${s.objectsLimit} объектов использованы. Этот замер сохранён на телефоне и отправится на сервер после подключения PRO; старые замеры и КП открыты. ${where}`,
      code: "OBJECT_LIMIT",
      used: s.objectsUsed,
      limit: s.objectsLimit,
      payUrl,
    },
  };
}
