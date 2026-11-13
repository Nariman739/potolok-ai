/**
 * Настоящий адрес объекта для наряда монтажнику (12.11.2026, «Ваш Потолок»).
 * Мастер вписал имя клиента в «Адрес объекта», а настоящий адрес — в карточку
 * клиента. Монтажник видел в наряде «Валентина» вместо «Мира 129 кв 33».
 *
 * Адрес объекта берём, если это адрес: не пусто, не «Без адреса» и не имя клиента.
 * Иначе берём адрес клиента. Нет ни того ни другого → null (имя адресом не показываем).
 * Исключение: адрес объекта совпал с именем, но в нём есть цифра («Улица 9») и
 * другого адреса нет — мастер вписал адрес в имя клиента, показываем его.
 * Цифра — ещё не адрес (13.11.2026): в имя клиента часто вписывают телефон («77012107246»,
 * «+7 747 614 8020»), просто число («167») или служебную метку («КП 630»). Их адресом не
 * показываем. Всё остальное с цифрой остаётся адресом, в том числе спорное «Иван 2»: по тексту
 * его не отличить от «Абая 2», а спрятать настоящий адрес от монтажника хуже, чем показать имя.
 *
 * ФАЙЛ-БЛИЗНЕЦ, байт-в-байт в двух репо: potolok-ai/src/lib/object-address.ts (сайт)
 * и potolok-integration/src/lib/object-address.ts (приложение). Сверка — twins.sh.
 */
const NO_ADDRESS = "без адреса";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Похоже на «нет адреса»: пусто, «Без адреса» или совпадает с именем клиента. */
export function isPlaceholderAddress(address: string | null | undefined, clientName?: string | null): boolean {
  const a = norm(address);
  if (!a || a === NO_ADDRESS) return true;
  const n = norm(clientName);
  return !!n && a === n;
}

/** Знаки, которые не делают строку адресом: пробелы, «+», скобки, дефисы, точки, невидимые метки направления. */
const PHONE_NOISE = /[\s()+.\-\u2010-\u2015\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
/** Служебная метка с номером: «КП 630», «Договор №12», «заказ 5». */
const LABEL_WITH_NUMBER = /^(кп|договор|дог|заказ|замер|сч[её]т|акт|объект)?[\s.:#№]*\d+$/i;

/** Строка с цифрой похожа на адрес: не телефон, не голое число и не служебная метка с номером. */
export function looksLikeAddress(text: string | null | undefined): boolean {
  const s = (text ?? "").trim();
  if (!/\d/.test(s)) return false;
  // Голое число («167») — по исходной строке; телефон — когда после чистки осталось 7+ цифр.
  // Короткое с дефисом или пробелом («10-87», «45 12» — дом и квартира) остаётся адресом.
  if (/^\d+$/.test(s)) return false;
  if (/^\d{7,}$/.test(s.replace(PHONE_NOISE, ""))) return false;
  return !LABEL_WITH_NUMBER.test(s);
}

export function realObjectAddress(
  objectAddress: string | null | undefined,
  client?: { name?: string | null; address?: string | null } | null,
): string | null {
  if (!isPlaceholderAddress(objectAddress, client?.name)) return objectAddress!.trim();
  if (!isPlaceholderAddress(client?.address, client?.name)) return client!.address!.trim();
  // Имя клиента с цифрой — это адрес, вписанный не в то поле
  const own = (objectAddress ?? "").trim();
  if (!isPlaceholderAddress(own) && looksLikeAddress(own)) return own;
  return null;
}
