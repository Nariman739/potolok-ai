/**
 * Ручные правки сохранённого КП, которые должны пережить пересборку строк из комнат
 * (fe, 13.11.2026: удалил «Вставку» на экране КП → «Открыть в дизайнере» → «Готово» —
 * строка вернулась). Экран расчёта собирает строки заново (calcRoom), а удаления и
 * ручные количество/цены жили только в его локальном состоянии и при updateId
 * начинались с нуля. Теперь отметки хранятся в calculationData.manual (ключ — id
 * комнаты в roomResults) и читаются экраном расчёта при updateId.
 *
 * На суммы сайта и PDF отметки не влияют: источник строк — по-прежнему
 * calculationData.roomResults[].items, сервер при пересчёте делает { ...calc }.
 *
 * Строка узнаётся по коду позиции + варианту прайса (itemCode = code || pickerKey ||
 * category, см. buildSavePayload), а не по имени: имя локализовано (ru/kk) и меняется
 * вместе с вариантом. Если в комнате несколько строк с тем же кодом и вариантом
 * (редко: два своих багета без variantId) — дополнительно сверяем имя, чтобы не
 * скрыть обе.
 */

export type LineRef = { code: string; variantId?: string; name: string };
/** autoQty — количество по чертежу на момент правки: если чертёж потом изменился, ручное
 *  количество не применяем молча (см. seedFor). Нет autoQty (ранние отметки) — применяем как есть. */
export type ManualLine = LineRef & { qty?: number; price?: number; installerPrice?: number; autoQty?: number };
export type KpManualRoom = {
  /** Строки, удалённые мастером из этого КП. */
  hidden?: LineRef[];
  /** Ручные количество/цена/цена монтажнику по строкам. */
  overrides?: ManualLine[];
  /** Тип подшторника комнаты (podshtornik_plastic | podshtornik_ldsp | podshtornik_aluminum). */
  podshtornik?: string;
};
export type KpManual = Record<string, KpManualRoom>;

/** Строка расчёта (LineItem экрана /estimate). */
export type CalcLineLike = { code?: string; pickerKey?: string; category?: string; variantId?: string; name: string };
/** Строка сохранённого КП (calculationData.roomResults[].items). */
export type SavedLineLike = { itemCode?: string; variantId?: string; itemName: string };

export function codeOfLine(it: CalcLineLike): string {
  return it.code || it.pickerKey || it.category || "custom";
}

export function refOfLine(it: CalcLineLike): LineRef {
  return { code: codeOfLine(it), ...(it.variantId ? { variantId: it.variantId } : {}), name: it.name };
}

export function refOfSaved(it: SavedLineLike): LineRef {
  return { code: it.itemCode || "custom", ...(it.variantId ? { variantId: it.variantId } : {}), name: it.itemName };
}

const baseKey = (r: { code: string; variantId?: string }) => `${r.code}#${r.variantId ?? ""}`;

export function sameRef(a: LineRef, b: LineRef): boolean {
  return baseKey(a) === baseKey(b) && a.name === b.name;
}

/**
 * Какая отметка относится к строке `line` среди строк комнаты `all`: сначала точное
 * совпадение кода+варианта+имени; если имя не совпало (другой язык, переименованный
 * вариант) — по коду+варианту, но только когда такая строка в комнате одна.
 */
export function findRef<T extends LineRef>(refs: T[] | undefined, line: CalcLineLike, all: CalcLineLike[]): T | undefined {
  if (!refs || refs.length === 0) return undefined;
  const key = baseKey(refOfLine(line));
  const exact = refs.find((r) => baseKey(r) === key && r.name === line.name);
  if (exact) return exact;
  const twins = all.filter((l) => baseKey(refOfLine(l)) === key).length;
  return twins <= 1 ? refs.find((r) => baseKey(r) === key) : undefined;
}

/** Ключ комнаты в manual: id комнаты из roomResults, без него — позиция. */
export function roomKeyOf(rr: { roomId?: string }, idx: number): string {
  return rr.roomId || `idx:${idx}`;
}

/**
 * Отметки для комнаты на столе. «Открыть в дизайнере» даёт комнате id
 * `${сохранённый}-edit-${время}-${idx}` (normalizeSavedRoom) — ищем по префиксу;
 * если id не сошлись, а комнат столько же — по позиции.
 */
export function manualForDeskRoom(
  manual: KpManual | undefined,
  roomKeysInOrder: string[],
  deskRoomId: string,
  deskIdx: number,
  deskCount: number,
): KpManualRoom | undefined {
  if (!manual) return undefined;
  const byId = Object.keys(manual).find((k) => deskRoomId === k || deskRoomId.startsWith(`${k}-edit-`));
  if (byId) return manual[byId];
  if (roomKeysInOrder.length === deskCount) {
    const k = roomKeysInOrder[deskIdx];
    return k ? manual[k] : undefined;
  }
  return undefined;
}

export function addHidden(manual: KpManual | undefined, roomKey: string, ref: LineRef): KpManual {
  const room = manual?.[roomKey] ?? {};
  const hidden = (room.hidden ?? []).filter((h) => !sameRef(h, ref));
  return { ...(manual ?? {}), [roomKey]: { ...room, hidden: [...hidden, ref] } };
}

export function upsertOverride(manual: KpManual | undefined, roomKey: string, line: ManualLine): KpManual {
  const room = manual?.[roomKey] ?? {};
  const overrides = (room.overrides ?? []).filter((o) => !sameRef(o, line));
  return { ...(manual ?? {}), [roomKey]: { ...room, overrides: [...overrides, line] } };
}

/** Допуск на округление площади/метража (0,1 м² / 0,1 м): мелкий пересчёт правку не снимает. */
export const AUTO_QTY_TOL = 0.1;

/**
 * Как применить правку из сохранённого КП к строке, которую чертёж сейчас даёт с
 * количеством `autoQty` и ценой `autoPrice`.
 * - чертёж не изменился (или в пределах допуска, или отметка без autoQty) → ручное количество;
 * - изменился → количество по чертежу, stale = ручное число, чтобы показать «Чертёж
 *   изменился — ваше 13 м² снято» и «Вернуть 13». Цена от размеров не зависит — остаётся.
 * Возвращает null, если применять нечего (цена и количество совпадают с чертежом).
 */
export function seedFor(
  seed: ManualLine,
  autoQty: number,
  autoPrice: number,
): { qty?: number; price?: number; installerPrice?: number; stale?: number } | null {
  const changed = seed.autoQty != null && Math.abs(autoQty - seed.autoQty) > AUTO_QTY_TOL + 1e-9;
  // Количество правили руками, только если оно отличалось от чертежа на момент правки:
  // правка одной цены тоже несёт qty (= тогдашний чертёж) — это не ручное количество.
  const qtyManual = seed.qty != null && (seed.autoQty == null || Math.abs(seed.qty - seed.autoQty) > 1e-9);
  const qty = qtyManual && !changed && seed.qty !== autoQty ? seed.qty : undefined;
  const price = seed.price != null && seed.price !== autoPrice ? seed.price : undefined;
  const installerPrice = seed.installerPrice;
  const stale = changed && qtyManual && seed.qty !== autoQty ? seed.qty : undefined;
  if (qty == null && price == null && installerPrice == null && stale == null) return null;
  return {
    ...(qty != null && { qty }),
    ...(price != null && { price }),
    ...(installerPrice != null && { installerPrice }),
    ...(stale != null && { stale }),
  };
}

const PODSHTORNIK_TYPES = new Set(["podshtornik_plastic", "podshtornik_ldsp", "podshtornik_aluminum"]);
export function podshtornikOf(room: KpManualRoom | undefined): string | undefined {
  return room?.podshtornik && PODSHTORNIK_TYPES.has(room.podshtornik) ? room.podshtornik : undefined;
}
