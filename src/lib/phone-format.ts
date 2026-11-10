/**
 * Номер к виду 7ХХХХХХХХХХ (11 цифр): «8 701 333 00 78» и «+7 701…» → 77013330078,
 * десятизначный «701 333 00 78» → 77013330078. Иное (короткое, зарубежное) — null.
 * Одна нормализация на показ и на wa.me, чтобы они не расходились.
 */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && /^[78]/.test(digits)) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return null;
}

/** «87013330078» → «+7 701 333 00 78» для глаз менеджера; всё остальное — как ввели. */
export function formatPhone(phone: string): string {
  const n = normalizePhone(phone);
  if (!n) return phone;
  return `+7 ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}`;
}

/** Ссылка wa.me без «+», как в приложении. Зарубежный номер от 10 цифр — как есть. */
export function whatsappUrl(phone: string): string | null {
  const n = normalizePhone(phone);
  if (n) return `https://wa.me/${n}`;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}
