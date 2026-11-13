/**
 * «Замер» на сайте: комната, которую сервер ещё не подтвердил (13.11.2026).
 *
 * Комната после «Готово» сразу попадает в запасную копию в браузере (zamery-rooms), а на
 * сервер уходит двумя запросами подряд: сначала создаётся открытый объект без комнат, потом
 * сама комната. Перезагрузка страницы между ними обрывала второй запрос; при старте страница
 * брала с сервера пустой объект, копию не читала и затирала её пустым списком — нарисованное
 * пропадало. То же при любом сбое отправки комнаты.
 *
 * Теперь неподтверждённая комната помечена `unsynced`. При старте такие комнаты из копии
 * добавляются к серверным и досылаются. Дублей нет: POST комнаты идёт с X-Op-Id = её локальный
 * id, и повтор запроса, который на самом деле дошёл, возвращает ту же комнату.
 */

/** X-Op-Id для отправки комнаты; сервер принимает до 80 символов. */
export function roomOpId(localRoomId: string): string {
  return `wr-${localRoomId}`.slice(0, 80);
}

/**
 * Комнаты из запасной копии, которых нет на сервере и которые надо показать и дослать.
 *  - только с пометкой `unsynced` (копии без пометки — старые, как раньше уступают серверу);
 *  - копия должна относиться к этому же объекту (или объект в ней ещё не записан: перезагрузка
 *    застала момент между созданием объекта и записью его id в копию);
 *  - комната с id, который уже есть на сервере, не берётся.
 */
export function pendingRoomsFromBackup<R extends { id: string; unsynced?: boolean }>(args: {
  serverRoomIds: string[];
  serverObjectId: string;
  backupRooms: unknown;
  backupObjectId: string | null;
}): R[] {
  const { serverRoomIds, serverObjectId, backupRooms, backupObjectId } = args;
  if (!Array.isArray(backupRooms)) return [];
  if (backupObjectId && backupObjectId !== serverObjectId) return [];
  const onServer = new Set(serverRoomIds);
  const seen = new Set<string>();
  const pending: R[] = [];
  for (const r of backupRooms as (R | null)[]) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || r.unsynced !== true) continue;
    if (!Array.isArray((r as { walls?: unknown }).walls)) continue;
    if (onServer.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    pending.push(r);
  }
  return pending;
}

/**
 * Сервер подтвердил комнату: локальный id меняется на серверный, пометка снимается.
 * Если комната с этим серверным id уже в списке (запрос дошёл ещё до перезагрузки и она
 * пришла с сервера, или её дослала другая вкладка) — локальный двойник просто убирается.
 */
export function confirmRoom<R extends { id: string; unsynced?: boolean }>(rooms: R[], localId: string, serverId: string): R[] {
  if (rooms.some((r) => r.id === serverId)) return rooms.filter((r) => r.id !== localId);
  return rooms.map((r) => (r.id === localId ? { ...r, id: serverId, unsynced: undefined } : r));
}
