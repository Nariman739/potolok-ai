/**
 * Ручные правки КП (calculationData.manual) после правки строк на САЙТЕ (14.11.2026).
 *
 * Приложение хранит в manual отметки по комнатам: удалённые строки (hidden) и ручные
 * количество/цены (overrides) — и накладывает их при «Открыть в дизайнере → Готово».
 * Сайт их не показывает и раньше не трогал, поэтому правка строки на сайте жила до
 * первой пересборки в приложении: старая отметка перебивала свежую цену сайта, а
 * удалённая на сайте строка возвращалась.
 *
 * Здесь — сверка «строки комнаты до» с «строками после» (редактор КП шлёт комнаты
 * целиком, без id строк):
 * - строку изменили (количество или цена) → снимаем её override: приложение больше не
 *   подставит старую ручную цену;
 * - строку удалили → в hidden, чтобы приложение её не вернуло (и её override снимаем);
 * - строку добавили и она была в hidden → снимаем из hidden («вернули»).
 * Суммы КП не трогаем: источник сумм — roomResults[].items, manual на них не влияет.
 *
 * Ключ строки — ровно как в приложении: kp-manual-key.ts — файл-близнец
 * potolok-ai-app/src/lib/kp-manual.ts (побайтно, scratchpad/parity/twins.manifest).
 */
import {
  addHidden,
  refOfSaved,
  roomKeyOf,
  sameRef,
  type KpManual,
  type KpManualRoom,
  type LineRef,
} from "./kp-manual-key";

export type SiteLine = { itemCode?: string; variantId?: string; itemName: string; quantity: number; unitPrice: number };
export type SiteRoom = { roomId?: string; items?: SiteLine[] };

const baseKey = (r: { code: string; variantId?: string }) => `${r.code}#${r.variantId ?? ""}`;
const ref = (it: SiteLine): LineRef => refOfSaved(it);

/** Отметка `refs`, относящаяся к строке: точно по код+вариант+имя; иначе по код+вариант, если такая строка в комнате одна (как findRef приложения). */
function matchRef<T extends LineRef>(refs: T[] | undefined, line: LineRef, all: LineRef[]): T | undefined {
  if (!refs?.length) return undefined;
  const exact = refs.find((r) => sameRef(r, line));
  if (exact) return exact;
  const key = baseKey(line);
  const twins = all.filter((l) => baseKey(l) === key).length;
  return twins <= 1 ? refs.find((r) => baseKey(r) === key) : undefined;
}

function dropOverride(room: KpManualRoom, line: LineRef, all: LineRef[]): KpManualRoom {
  const hit = matchRef(room.overrides, line, all);
  return hit ? { ...room, overrides: room.overrides!.filter((o) => o !== hit) } : room;
}

function dropHidden(room: KpManualRoom, line: LineRef, all: LineRef[]): KpManualRoom {
  let hit = matchRef(room.hidden, line, all);
  // На сайте строку возвращают из каталога — без варианта прайса. Скрытая в приложении
  // могла быть с вариантом: снимаем её, если с этим кодом скрыта ровно одна.
  if (!hit && !line.variantId) {
    const sameCode = (room.hidden ?? []).filter((h) => h.code === line.code);
    if (sameCode.length === 1) hit = sameCode[0];
  }
  return hit ? { ...room, hidden: room.hidden!.filter((h) => h !== hit) } : room;
}

/**
 * Пары «было → стало» внутри комнаты: сначала по код+вариант+имя (порядок сохраняется),
 * затем по код+вариант (мастер переименовал строку). Остальное — удалено / добавлено.
 */
function pairLines(before: SiteLine[], after: SiteLine[]) {
  const usedB = new Set<number>();
  const pairOfA = new Map<number, number>();
  const pass = (eq: (b: LineRef, a: LineRef) => boolean) => {
    after.forEach((a, ai) => {
      if (pairOfA.has(ai)) return;
      const bi = before.findIndex((b, i) => !usedB.has(i) && eq(ref(b), ref(a)));
      if (bi >= 0) { usedB.add(bi); pairOfA.set(ai, bi); }
    });
  };
  pass((b, a) => sameRef(b, a));
  pass((b, a) => baseKey(b) === baseKey(a));
  const removed = before.filter((_, i) => !usedB.has(i));
  const added = after.filter((_, i) => !pairOfA.has(i));
  const changed = [...pairOfA].filter(([ai, bi]) => {
    const a = after[ai], b = before[bi];
    return Number(a.quantity) !== Number(b.quantity) || Number(a.unitPrice) !== Number(b.unitPrice);
  }).map(([, bi]) => before[bi]);
  return { removed, added, changed };
}

/**
 * Новый manual после того, как строки комнат `before` стали `after` (правка на сайте).
 * Комнаты сопоставляются по roomId, без него — по позиции (если комнат столько же).
 * Ключ комнаты в manual — по комнате «до» (roomKeyOf приложения).
 * Возвращает прежний объект, если менять нечего (в т. ч. undefined без manual и удалений).
 */
export function syncManualAfterSiteEdit(
  manual: KpManual | undefined,
  before: SiteRoom[] | undefined,
  after: SiteRoom[] | undefined,
): KpManual | undefined {
  const prevRooms = before ?? [];
  const nextRooms = after ?? [];
  let out = manual;
  nextRooms.forEach((nextRoom, ni) => {
    let pi = nextRoom.roomId ? prevRooms.findIndex((r) => r.roomId === nextRoom.roomId) : -1;
    if (pi < 0 && prevRooms.length === nextRooms.length && !(nextRoom.roomId && prevRooms[ni]?.roomId)) pi = ni;
    if (pi < 0) return;
    const prevRoom = prevRooms[pi];
    const key = roomKeyOf(prevRoom, pi);
    const beforeLines = prevRoom.items ?? [];
    const afterLines = nextRoom.items ?? [];
    const { removed, added, changed } = pairLines(beforeLines, afterLines);
    if (!removed.length && !added.length && !changed.length) return;

    const beforeRefs = beforeLines.map(ref);
    const afterRefs = afterLines.map(ref);
    let room: KpManualRoom = out?.[key] ?? {};
    for (const b of changed) room = dropOverride(room, ref(b), beforeRefs);
    for (const b of removed) room = dropOverride(room, ref(b), beforeRefs);
    for (const a of added) room = dropHidden(room, ref(a), afterRefs);
    let next: KpManual = { ...(out ?? {}), [key]: room };
    for (const b of removed) {
      // В комнате осталась строка с тем же кодом+вариантом — скрывать нельзя: приложение
      // при несовпадении имени ищет отметку по коду+варианту (findRef) и убрало бы оставшуюся.
      // Пример (8d): в КП «Софит GX53» (spot) + добавленный с сайта «Светильник GX53» (spot);
      // удалили светильник → hidden {spot, «Светильник GX53»} скрыл бы настоящие софиты.
      const r = ref(b);
      if (afterRefs.some((a) => baseKey(a) === baseKey(r))) continue;
      next = addHidden(next, key, r);
    }
    const nr = next[key];
    const empty = !nr.hidden?.length && !nr.overrides?.length && !nr.podshtornik;
    if (empty && !out?.[key]) return; // нечего записывать — комнату в manual не заводим
    out = next;
  });
  return out;
}
