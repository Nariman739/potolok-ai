/**
 * Черновики в браузере принадлежат аккаунту (13.11.2026).
 *
 * Калькулятор и замер держат незаконченную работу в localStorage. Раньше у неё не было
 * владельца: на общем компьютере следующий вошедший видел чужой расчёт и мог сохранить его
 * себе, а запасная копия замера поднималась у другого мастера.
 *
 * Теперь рядом с черновиками лежит штамп «мастер:компания» (расчёт и клиент сверяются по
 * обоим, черновик замера — только по мастеру). Layout кабинета кладёт текущий
 * штамп в разметку (`data-draft-owner`); перед любым чтением черновика зовём
 * `ensureDraftOwner()` — при несовпадении всё стирается. Черновик без штампа (сделан до
 * выката) достаётся первому вошедшему: работу мастера посреди расчёта не теряем, а цены
 * сервер всё равно пересчитает при сохранении.
 *
 * Только для браузера; на сервере все функции ничего не делают.
 */

const OWNER_KEY = "draft-owner";
/** Когда черновик калькулятора меняли в последний раз (мс). */
const CALC_TOUCHED_KEY = "calculator-draft-at";

/**
 * Черновики, привязанные к мастеру И компании: расчёт посчитан по прайсу компании, клиент —
 * её клиент. Сменил активную компанию — они стираются.
 * Новый ключ черновика — добавить в один из двух списков, иначе он переживёт смену аккаунта.
 */
const COMPANY_DRAFT_KEYS = [
  // калькулятор
  "calculator-rooms-draft",
  "calculator-extra-items-draft",
  "calculator-result-draft",
  "calculator-draft-source",
  "calculator-draft-client",
  CALC_TOUCHED_KEY,
  // передача комнат из замера в калькулятор (вместе с клиентом замера)
  "vision-rooms",
  "vision-rooms-source",
  "vision-rooms-client",
  "vision-edit-room",
] as const;

/**
 * Черновик страницы замера — только к мастеру: это его несохранённая работа (страница пишет
 * копию при каждой правке), цен и клиентов в ней нет. Смена активной компании не должна
 * молча её стирать; чужой мастер её не получает.
 */
const MASTER_DRAFT_KEYS = ["zamery-rooms", "zamery-object", "zamery-objectId", "zamery-saved"] as const;

/** Все ключи незаконченной работы. */
export const DRAFT_KEYS = [...COMPANY_DRAFT_KEYS, ...MASTER_DRAFT_KEYS] as const;

/** Запомненный клиент замера подставляется в окно «Сохранить КП» не дольше суток. */
export const DRAFT_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Штамп текущего аккаунта из разметки кабинета; null — не в кабинете или не вошёл. */
function currentOwner(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-draft-owner]")?.getAttribute("data-draft-owner") || null;
}

/** Штамп для разметки: мастер и его активная компания (у компании свой прайс и свои клиенты). */
export function draftOwnerStamp(masterId: string, activeCompanyId?: string | null): string {
  return `${masterId}:${activeCompanyId ?? ""}`;
}

function removeDrafts(ls: Storage, keys: readonly string[] = DRAFT_KEYS) {
  for (const key of keys) ls.removeItem(key);
}

/** Мастер из штампа «мастер:компания»; штамп без двоеточия читается как один мастер. */
function masterOf(stamp: string): string {
  const i = stamp.indexOf(":");
  return i === -1 ? stamp : stamp.slice(0, i);
}

let checkedFor: string | null = null;

/**
 * Сверить владельца черновиков с текущим аккаунтом. Звать перед чтением любого черновика.
 *  - штампа нет (черновик сделан до выката) — взять себе, ничего не стирая;
 *  - другой мастер — стереть всё;
 *  - тот же мастер, другая компания — стереть расчёт и клиента, черновик замера оставить.
 * Возвращает true, если что-то было стёрто.
 */
export function ensureDraftOwner(): boolean {
  const ls = storage();
  const owner = currentOwner();
  // Кто вошёл — неизвестно (страница вне кабинета): не трогаем.
  if (!ls || !owner || checkedFor === owner) return false;
  try {
    const stored = ls.getItem(OWNER_KEY);
    const foreign = !!stored && stored !== owner;
    if (foreign) removeDrafts(ls, masterOf(stored) === masterOf(owner) ? COMPANY_DRAFT_KEYS : DRAFT_KEYS);
    if (stored !== owner) ls.setItem(OWNER_KEY, owner);
    checkedFor = owner;
    return foreign;
  } catch {
    return false;
  }
}

/** Выход из аккаунта: в браузере не остаётся ни черновиков, ни штампа. */
export function clearDraftsOnLogout() {
  const ls = storage();
  if (!ls) return;
  try {
    removeDrafts(ls);
    ls.removeItem(OWNER_KEY);
    checkedFor = null;
  } catch {}
}

/** Черновик калькулятора изменился — запомнить время. */
export function touchCalculatorDraft(now: number = Date.now()) {
  try {
    storage()?.setItem(CALC_TOUCHED_KEY, String(now));
  } catch {}
}

/**
 * Черновик калькулятора меняли не позже `ttlMs` назад. Черновик без отметки времени
 * (сделан до выката) считается свежим и получает отметку сейчас.
 */
export function calculatorDraftIsFresh(ttlMs: number, now: number = Date.now()): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    const at = Number(ls.getItem(CALC_TOUCHED_KEY));
    if (!Number.isFinite(at) || at <= 0) {
      ls.setItem(CALC_TOUCHED_KEY, String(now));
      return true;
    }
    return now - at <= ttlMs;
  } catch {
    return false;
  }
}
