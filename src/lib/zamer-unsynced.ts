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

/** Копия без id объекта пристёгивается к открытому объекту, только если она свежая. */
export const BACKUP_FRESH_MS = 10 * 60 * 1000;

/**
 * Комнаты из запасной копии, которых нет на сервере и которые надо показать и дослать.
 *  - только с пометкой `unsynced` (копии без пометки — старые, как раньше уступают серверу);
 *  - копия должна относиться к этому же объекту. Объект в ней ещё не записан (перезагрузка
 *    застала момент между созданием объекта и записью его id в копию) — только если копию
 *    писали не больше 10 минут назад: старая копия «без объекта» — это другой, давний
 *    черновик, к сегодняшнему открытому объекту его не пристёгиваем;
 *  - комната с id, который уже есть на сервере, не берётся.
 */
export function pendingRoomsFromBackup<R extends { id: string; unsynced?: boolean }>(args: {
  serverRoomIds: string[];
  serverObjectId: string;
  backupRooms: unknown;
  backupObjectId: string | null;
  /** Когда копию писали в последний раз (мс), null — отметки нет. */
  backupSavedAt: number | null;
  now: number;
}): R[] {
  const { serverRoomIds, serverObjectId, backupRooms, backupObjectId, backupSavedAt, now } = args;
  if (!Array.isArray(backupRooms)) return [];
  if (backupObjectId && backupObjectId !== serverObjectId) return [];
  if (!backupObjectId) {
    const age = backupSavedAt === null ? Infinity : now - backupSavedAt;
    if (!(age >= 0 && age <= BACKUP_FRESH_MS)) return [];
  }
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

/**
 * Комната, которую мастер удалил, пока её отправка была в пути (или исход отправки неизвестен).
 * Если перезагрузка случится до ответа, комната может остаться на сервере — а её серверный id
 * мы так и не узнали. Поэтому запоминаем локальный id, объект и тело запроса: на старте тот же
 * запрос с тем же X-Op-Id вернёт серверный id (или создаст комнату, если первый не дошёл),
 * и комната удаляется уже по нему.
 */
export type RemovedRoom = { id: string; objectId: string; at: number; body: unknown };

/** Дольше суток пометки не живут: сервер к этому времени мог забыть X-Op-Id — не трогаем. */
export const REMOVED_TTL_MS = 24 * 60 * 60 * 1000;

/** Годные пометки из браузера: правильной формы и не старше суток. */
export function parseRemovedRooms(raw: string | null | undefined, now: number): RemovedRoom[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: RemovedRoom[] = [];
  for (const e of list as (Partial<RemovedRoom> | null)[]) {
    if (!e || typeof e.id !== "string" || typeof e.objectId !== "string" || typeof e.at !== "number") continue;
    if (!e.id || !e.objectId || !e.body || typeof e.body !== "object") continue;
    if (!(now - e.at >= 0 && now - e.at <= REMOVED_TTL_MS) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, objectId: e.objectId, at: e.at, body: e.body });
  }
  return out;
}

/**
 * Одна отправка на ключ: если она уже в пути, второй вызов получает ТОТ ЖЕ промис и ждёт тот же
 * исход — а не пропускает работу, считая её сделанной. Иначе «Сохранить», нажатое во время
 * стартовой досылки, закрыло бы объект, не дождавшись комнаты.
 */
export function shareInFlight<T>(inFlight: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const started = run().finally(() => {
    if (inFlight.get(key) === started) inFlight.delete(key);
  });
  inFlight.set(key, started);
  return started;
}

/**
 * Открытого объекта на сервере нет. Заводить ли его самим под комнаты из запасной копии?
 * Да — только если копия целиком состоит из комнат, которые сервер ещё не получил, и объект в
 * ней не записан: это замер, чей объект так и не создался. Если в копии записан объект (он за
 * это время сохранён, закрыт или удалён) или есть уже подтверждённые комнаты — нет: новый объект
 * получил бы только часть комнат с экрана, остальные остались бы в прежнем.
 * Срока здесь нет: комната, нарисованная без сети, может ждать и час — спутать её не с чем,
 * открытого объекта нет.
 */
export function shouldCreateObjectForBackup(rooms: { unsynced?: boolean }[], backupObjectId: string | null | undefined): boolean {
  return !backupObjectId && rooms.length > 0 && rooms.every((r) => r.unsynced === true);
}

/**
 * Названия комнат для вопроса мастеру. Одинаковые названия на экране («Помещение», «Помещение»)
 * получают номер по порядку — «Помещение 1», «Помещение 2»; уникальные остаются как есть.
 * Только для текста вопроса: сами комнаты не переименовываются.
 */
export function roomLabelsForQuestion(allRooms: { id: string; name?: string | null }[], ids: string[]): string[] {
  const nameOf = (r: { name?: string | null }) => (r.name ?? "").trim() || "Без названия";
  const total = new Map<string, number>();
  for (const r of allRooms) total.set(nameOf(r), (total.get(nameOf(r)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const label = new Map<string, string>();
  for (const r of allRooms) {
    const name = nameOf(r);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    label.set(r.id, (total.get(name) ?? 0) > 1 ? `${name} ${n}` : name);
  }
  return ids.map((id) => label.get(id) ?? "Без названия");
}
