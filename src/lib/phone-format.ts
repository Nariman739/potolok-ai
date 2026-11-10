/** «77011234567» → «+7 701 123 45 67» для глаз менеджера; всё остальное — как ввели. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return /^\+?[\d\s()-]+$/.test(phone) ? `+${digits}` : phone;
}

/** Ссылка wa.me без «+», как в приложении: «8 701…» и «701…» → 7701… */
export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const intl = digits.length === 10 ? "7" + digits : digits.replace(/^8/, "7");
  return `https://wa.me/${intl}`;
}
