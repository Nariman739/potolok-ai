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

export type BillingStatus = {
  /** Платные правила действуют для этого мастера (новый — сразу, старый — после FREE_UNTIL). */
  enforced: boolean;
  /** Старый мастер в бесплатном периоде: показываем плашку «до 23 ноября бесплатно». */
  freePeriod: boolean;
  /** Сейчас есть полный доступ (PRO): оплачено, owner или бесплатный период. */
  isPro: boolean;
  /** Почему PRO: "owner" | "paid" | "free_period" | null (бесплатный тариф). */
  proReason: "owner" | "paid" | "free_period" | null;
  paidUntil: string | null;
  /** Дней до конца оплаты (отрицательное = просрочено). null — нет даты. */
  daysLeft: number | null;
  /** Сейчас действует стартовая цена (оплата до launchPriceUntil — по prices.launchMonth). */
  launchPrice: boolean;
  launchPriceUntil: string;
  freeUntil: string;
  objectsUsed: number;
  objectsLimit: number;
  /** Можно ли создать новый объект прямо сейчас. */
  canCreateObject: boolean;
  prices: {
    month: number;
    year: number;
    launchMonth: number;
  };
};
