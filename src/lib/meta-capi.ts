import { createHash } from "node:crypto";

/**
 * Meta Conversions API (08.11.2026): события «Регистрация» и «Оплата» с сервера.
 *
 * Зачем: регистрация происходит в мобильном приложении, браузерный пиксель
 * (src/components/meta-pixel.tsx) её не видит, и кампания месяц оптимизировалась
 * на «просмотр страницы» — Meta искала тех, кто дёшево откроет сайт, а не тех,
 * кто поставит приложение. Серверное событие с хэшем телефона Meta сопоставляет
 * с человеком, которому показывала объявление, после чего группу объявлений
 * можно переключить на цель «регистрации».
 *
 * Правила: никогда не роняем вызывающий код (всё в try/catch, таймаут 3 с),
 * телефон уходит только SHA-256-хэшем, тестовые аккаунты (QA, +7700000007x /
 * +7999000007x) не отправляем. Без META_CAPI_TOKEN — тихо ничего не делаем.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1102421516036437";
const TOKEN = process.env.META_CAPI_TOKEN;
const API = "https://graph.facebook.com/v21.0";

export type MetaEventName = "CompleteRegistration" | "Purchase";

export type MetaEventInput = {
  event: MetaEventName;
  /** Нормализованный телефон вида +7705…; хэшируется, в Meta не уходит открытым. */
  phone: string;
  /** Стабильный id мастера — хэшируется как external_id. */
  masterId: string;
  firstName?: string | null;
  /** Уникальный ключ события для дедупликации (id мастера / id платежа). */
  eventId: string;
  /** IP и User-Agent запроса — повышают качество сопоставления. */
  ip?: string | null;
  userAgent?: string | null;
  /** Для Purchase. */
  value?: number;
  currency?: "KZT" | "RUB";
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function countryOf(phone: string): string | null {
  if (phone.startsWith("+7")) {
    // +77… — Казахстан, +79…/+78… — Россия.
    return phone.startsWith("+77") ? "kz" : "ru";
  }
  if (phone.startsWith("+998")) return "uz";
  if (phone.startsWith("+996")) return "kg";
  if (phone.startsWith("+375")) return "by";
  return null;
}

export function isTestAccount(phone: string, firstName?: string | null): boolean {
  if (firstName && /^QA/i.test(firstName)) return true;
  return /^\+7(700|999)000007\d$/.test(phone);
}

/**
 * Отправляет событие. Возвращает true, если Meta ответила events_received.
 * Вызывать с await (Vercel убивает функцию после ответа — fire-and-forget теряется),
 * но результат можно игнорировать.
 */
export async function sendMetaEvent(input: MetaEventInput): Promise<boolean> {
  if (!TOKEN) return false;
  if (isTestAccount(input.phone, input.firstName)) return false;
  try {
    const digits = input.phone.replace(/\D/g, "");
    const country = countryOf(input.phone);
    const userData: Record<string, unknown> = {
      ph: [sha256(digits)],
      external_id: [sha256(input.masterId)],
    };
    if (country) userData.country = [sha256(country)];
    if (input.firstName?.trim()) userData.fn = [sha256(input.firstName.trim().toLowerCase())];
    if (input.ip && input.ip !== "unknown") userData.client_ip_address = input.ip;
    if (input.userAgent) userData.client_user_agent = input.userAgent;

    const event: Record<string, unknown> = {
      event_name: input.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: `${input.event}:${input.eventId}`,
      // Регистрация идёт из приложения, но без Facebook SDK в нём источник «app»
      // Meta не принимает (нужны app_data) — отправляем как website с URL сайта.
      action_source: "website",
      event_source_url: "https://potolok.ai/app",
      user_data: userData,
    };
    if (input.event === "Purchase") {
      event.custom_data = { value: input.value ?? 0, currency: input.currency ?? "KZT" };
    }

    const body = new URLSearchParams({ access_token: TOKEN, data: JSON.stringify([event]) });
    const res = await fetch(`${API}/${PIXEL_ID}/events`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn("meta-capi:", input.event, res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("meta-capi:", input.event, e instanceof Error ? e.message : e);
    return false;
  }
}
