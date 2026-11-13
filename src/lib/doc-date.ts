/**
 * Дата и время события документа (создан, подписан) для карточки КП — «13.11.2026, 18:55».
 *
 * Пояс задан явно. Клиентский компонент сначала рисуется на сервере (Vercel, UTC), потом в
 * браузере мастера: `toLocaleString("ru-RU")` без пояса давал разный текст и React #418 в
 * карточке КП с договором (прод 13.11.2026). Пояс — Asia/Almaty, как на публичных страницах
 * договора и акта и в уведомлениях; пояса мастера или компании в базе нет.
 */
export function formatDocDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
