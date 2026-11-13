/**
 * Тело запроса как JSON-объект (13.11.2026). Пустое, обрезанное («{») или не-JSON тело
 * раньше роняло auth-роуты в 500 «Unexpected end of JSON input» и будило сторожа прода
 * (сработал на наш же стендовый скрипт). Это ошибка клиента — отвечаем 400 и в
 * Sentry/console не шлём.
 *
 * null — тело не прочитать или это не объект (null, массив, число, строка: раньше
 * деструктуризация такого тоже давала 500). Для валидного объекта поведение прежнее.
 */
export const BAD_JSON_TEXT = "Не удалось прочитать запрос. Обновите приложение или страницу и попробуйте ещё раз.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- роуты читали тело как any, поведение сохраняем
export async function readJsonObject(request: Request): Promise<Record<string, any> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
