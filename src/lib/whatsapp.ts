/**
 * Отправка сообщений в WhatsApp (24.09.2026).
 *
 * Зачем: код восстановления пароля уходит только в Telegram, а бота знают
 * 32 мастера из 357 — остальные, забыв пароль, теряют доступ к своим замерам
 * и клиентской базе навсегда. WhatsApp есть у всех.
 *
 * Канал — официальный WhatsApp Cloud API от Meta: коды подтверждения
 * разрешены там явным типом шаблона «authentication», номер не банят.
 * Посредники вроде Wazzup работают через обычный аккаунт, и рассылка кодов
 * с него — прямой путь к блокировке номера.
 *
 * Пока переменные не заданы, модуль молчит и говорит «не настроено»: сервер
 * от этого не падает, просто канал недоступен.
 */

const TOKEN = process.env.WHATSAPP_TOKEN ?? "";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? "";
/** Имя шаблона authentication, одобренного Meta. */
const OTP_TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE ?? "otp_code";
/** Язык шаблона — ровно тот, что выбран при создании (ru, ru_RU, en_US…). */
const OTP_LANG = process.env.WHATSAPP_OTP_LANG ?? "ru";
const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return TOKEN.length > 20 && PHONE_ID.length > 5;
}

/** Номер для Meta: только цифры, казахстанские 8XXX → 7XXX. */
function toWaNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) return `7${d.slice(1)}`;
  return d;
}

type SendResult = { ok: boolean; error?: string };

/**
 * Код подтверждения шаблоном authentication. У такого шаблона ровно одна
 * переменная — сам код, и кнопка «Скопировать», поэтому текст задаёт Meta,
 * а не мы. Копию кода передаём и в кнопку: этого требует формат.
 */
export async function sendWhatsappOtp(phone: string, code: string): Promise<SendResult> {
  if (!whatsappConfigured()) return { ok: false, error: "not_configured" };
  const to = toWaNumber(phone);
  if (to.length < 10) return { ok: false, error: "bad_phone" };

  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: OTP_TEMPLATE,
          language: { code: OTP_LANG },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      }),
      // Восстановление пароля не должно висеть: не ответили за 10 секунд —
      // считаем канал недоступным и отвечаем мастеру честно.
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) return { ok: true };
    const body = await res.text();
    // Тело Meta содержит номер телефона — в лог кладём только код ошибки.
    let reason = `http_${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: { code?: number; error_subcode?: number } };
      if (parsed.error?.code) reason = `meta_${parsed.error.code}${parsed.error.error_subcode ? `_${parsed.error.error_subcode}` : ""}`;
    } catch {
      /* нечитаемый ответ — остаётся http_код */
    }
    console.error("[whatsapp] send failed", reason);
    return { ok: false, error: reason };
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    console.error("[whatsapp] send error", reason);
    return { ok: false, error: reason };
  }
}
