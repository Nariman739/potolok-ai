/**
 * Настоящий адрес объекта для наряда монтажнику (12.11.2026, «Ваш Потолок»).
 * Мастер вписал имя клиента в «Адрес объекта», а настоящий адрес — в карточку
 * клиента. Монтажник видел в наряде «Валентина» вместо «Мира 129 кв 33».
 *
 * Адрес объекта берём, если это адрес: не пусто, не «Без адреса» и не имя клиента.
 * Иначе берём адрес клиента. Нет ни того ни другого → null (имя адресом не показываем).
 * Файл-близнец: в приложении src/lib/object-address.ts — тот же код.
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

export function realObjectAddress(
  objectAddress: string | null | undefined,
  client?: { name?: string | null; address?: string | null } | null,
): string | null {
  if (!isPlaceholderAddress(objectAddress, client?.name)) return objectAddress!.trim();
  if (!isPlaceholderAddress(client?.address, client?.name)) return client!.address!.trim();
  return null;
}
