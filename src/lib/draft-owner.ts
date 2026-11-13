/**
 * Черновики в браузере принадлежат аккаунту (13.11.2026).
 *
 * Калькулятор и замер держат незаконченную работу в localStorage. Раньше у неё не было
 * владельца: на общем компьютере следующий вошедший видел чужой расчёт и мог сохранить его
 * себе, а запасная копия замера поднималась у другого мастера.
 *
 * Теперь рядом с черновиками лежит штамп «мастер:компания». Layout кабинета кладёт текущий
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

/** Все ключи незаконченной работы. Новый ключ черновика — добавить сюда, иначе он переживёт смену аккаунта. */
export const DRAFT_KEYS = [
  // калькулятор
  "calculator-rooms-draft",
  "calculator-extra-items-draft",
  "calculator-result-draft",
  "calculator-draft-source",
  "calculator-draft-client",
  CALC_TOUCHED_KEY,
  // замер: запасная копия и передача комнат в калькулятор
  "zamery-rooms",
  "zamery-object",
  "zamery-objectId",
  "zamery-saved",
  "vision-rooms",
  "vision-rooms-source",
  "vision-rooms-client",
  "vision-edit-room",
] as const;

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

function removeDrafts(ls: Storage) {
  for (const key of DRAFT_KEYS) ls.removeItem(key);
}

let checkedFor: string | null = null;

/**
 * Сверить владельца черновиков с текущим аккаунтом. Чужие — стереть, ничьи — взять себе.
 * Звать перед чтением любого черновика. Возвращает true, если черновики были стёрты.
 */
export function ensureDraftOwner(): boolean {
  const ls = storage();
  const owner = currentOwner();
  // Кто вошёл — неизвестно (страница вне кабинета): не трогаем.
  if (!ls || !owner || checkedFor === owner) return false;
  try {
    const stored = ls.getItem(OWNER_KEY);
    const foreign = !!stored && stored !== owner;
    if (foreign) removeDrafts(ls);
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
