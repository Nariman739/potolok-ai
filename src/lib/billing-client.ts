/**
 * Клиентская часть биллинга — без импортов сервера (prisma), чтобы
 * «use client»-компоненты не тянули node-модули в браузерный бандл
 * (деплой 12.10.2026 упал именно на этом).
 *
 * В браузер попадают только NEXT_PUBLIC_*-переменные, поэтому флаг отдельный.
 * Держать в одном значении с BILLING_ENABLED (оба задаём в Vercel).
 */
export const BILLING_ENABLED_CLIENT =
  process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";

export type BillingPeriod = "month" | "year";

/**
 * Статус подписки (решение Наримана 25.10.2026): с дня включения
 * (launchAt) у ВСЕХ счётчик с нуля — objectsLimit объектов бесплатно, потом
 * один объект «в долг» (graceObjects), дальше только PRO.
 */
export type BillingStatus = {
  /** Лимит действует прямо сейчас (флаг включён и день запуска наступил). */
  enforced: boolean;
  /** Флаг включён, но день запуска ещё впереди — показываем «с <дата> …». */
  announce: boolean;
  /** День запуска: объекты считаем с него. ISO. */
  launchAt: string;
  /** Сейчас есть полный доступ (PRO): оплачено, owner или лимит не действует. */
  isPro: boolean;
  /** Почему PRO: "owner" | "paid" | "free_period" | null (бесплатный тариф). */
  proReason: "owner" | "paid" | "free_period" | null;
  paidUntil: string | null;
  /** Дней до конца оплаты (отрицательное = просрочено). null — нет даты. */
  daysLeft: number | null;
  /** Сейчас действует стартовая цена (оплата до launchPriceUntil — по prices.launchMonth). */
  launchPrice: boolean;
  launchPriceUntil: string;
  /** Объектов создано с launchAt. */
  objectsUsed: number;
  objectsLimit: number;
  /** Сколько объектов можно сделать сверх лимита «в долг» (обычно 1). */
  graceObjects: number;
  /** Сколько бесплатных ещё осталось (без учёта долга). */
  freeLeft: number;
  /** Бесплатные кончились, следующий объект — «в долг» (ещё можно). */
  inGrace: boolean;
  /** И долг использован — новые объекты только с PRO. */
  graceUsed: boolean;
  /** Можно ли создать новый объект прямо сейчас. */
  canCreateObject: boolean;
  prices: {
    month: number;
    year: number;
    launchMonth: number;
  };
};
