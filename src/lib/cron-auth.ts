/**
 * Доступ к кронам (13.11.2026). Vercel Cron шлёт `Authorization: Bearer <CRON_SECRET>`,
 * если переменная CRON_SECRET задана в проекте. Раньше каждый крон сравнивал заголовок
 * с `Bearer ${process.env.CRON_SECRET}` — при пустой переменной это строка «Bearer undefined»,
 * и такой заголовок открывал крон кому угодно (аудит В4). Теперь: нет секрета — 401.
 * При заданном секрете поведение прежнее (точное сравнение).
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
