/** «77011234567» → «+7 701 123 45 67» для глаз менеджера; всё остальное — как ввели. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return /^\+?[\d\s()-]+$/.test(phone) ? `+${digits}` : phone;
}
