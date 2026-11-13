import { normalizePhone as normalizeE164 } from "@/lib/phone";

/**
 * Номер к виду 7ХХХХХХХХХХ (11 цифр): «8 701 333 00 78» и «+7 701…» → 77013330078,
 * десятизначный «701 333 00 78» → 77013330078. Иное (короткое, зарубежное) — null.
 * Одна нормализация на показ и на wa.me, чтобы они не расходились.
 *
 * Десять цифр — это номер без «+7», только если он начинается как номер Казахстана или России:
 * 7 (моб. КЗ), 9 (моб. РФ), 3, 4, 8 (города РФ). До 13.11.2026 «7» приписывалась ЛЮБЫМ десяти
 * цифрам, и киргизский «0700 123 456» становился «+7 070 012 34 56» со ссылкой в никуда.
 */
export function isPlus7National(digits: string): boolean {
  return digits.length === 10 && /^[34789]/.test(digits);
}

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && /^[78]/.test(digits)) return "7" + digits.slice(1);
  if (isPlus7National(digits)) return "7" + digits;
  return null;
}

/** «87013330078» → «+7 701 333 00 78» для глаз менеджера; всё остальное — как ввели. */
export function formatPhone(phone: string): string {
  const n = normalizePhone(phone);
  if (!n) return phone;
  return `+7 ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}`;
}

/**
 * Цифры номера для wa.me (международный вид без «+») или null, если номер для ссылки не годится.
 * +7 — нормализуем («8 701…» → 7701…); зарубежный с кодом страны (от 10 цифр) — как есть;
 * местная запись с нулём впереди («0700 123 456») — null: без кода страны WhatsApp её не откроет.
 * Все кнопки «Написать в WhatsApp» строят ссылку через эту функцию, а не из сырых цифр:
 * сырой «8 701 333 00 78» давал wa.me/8701… — ссылку на несуществующий номер.
 */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const n = normalizePhone(phone);
  if (n) return n;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && !digits.startsWith("0") ? digits : null;
}

/** Ссылка wa.me без «+», как в приложении. */
export function whatsappUrl(phone: string): string | null {
  const digits = whatsappDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * Телефон мастера из формы профиля → вид для базы. Это ЛОГИН: портить нельзя.
 * Номер с кодом страны (любой: +7, +996, +375…) сохраняется как есть в E.164;
 * «8 701…» и десять цифр КЗ/РФ получают «+7»; задвоенный код «+7 7 701…» (инцидент 06.07)
 * схлопывается. Всё остальное — как ввели. До 13.11.2026 брались последние 10 цифр и
 * приписывалось «+7» всем: «+996 700 123 456» при сохранении профиля превращался в
 * «+7 670 012 34 56», и мастер терял вход.
 */
export function normalizeProfilePhone(value: string): string {
  const e164 = normalizeE164(value);
  if (e164) return e164;
  const digits = (value || "").replace(/\D/g, "");
  if (/^[78]/.test(digits) && (digits.length === 11 || digits.length === 12)) return "+7" + digits.slice(-10);
  if (isPlus7National(digits)) return "+7" + digits;
  return value;
}
