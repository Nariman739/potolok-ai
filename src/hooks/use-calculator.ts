"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import type { RoomInput, CalculationResult, ExtraItem } from "@/lib/types";
import { ensureDraftOwner, onDraftsCleared, touchCalculatorDraft, calculatorDraftIsFresh, DRAFT_CLIENT_TTL_MS } from "@/lib/draft-owner";

const AUTOSAVE_KEY = "calculator-rooms-draft";
const EXTRA_ITEMS_KEY = "calculator-extra-items-draft";
const DRAFT_SOURCE_KEY = "calculator-draft-source";
/** Клиент замера, из которого собран черновик: на нём встаёт окно «Сохранить КП». */
const DRAFT_CLIENT_KEY = "calculator-draft-client";
const RESULT_KEY = "calculator-result-draft";

/**
 * Происхождение черновика: из какого объекта замера он собран, чей это клиент и какие комнаты
 * пришли оттуда (13.11.2026). Пока в черновике есть хоть одна из этих комнат — это всё ещё КП
 * того же объекта и того же клиента. Убрали все (и набрали другие) — это уже чужой расчёт,
 * происхождение забываем. Раньше клиент сбрасывался только кнопкой «Новый расчёт», и КП клиента
 * Б могло сохраниться на А; а id объекта при сохранении не передавался вовсе, и КП, созданное
 * из замера, оставалось без объекта (не видно в карточке объекта и в приложении, наряд его
 * не видит).
 * Свои комнаты, добавленные мастером, происхождение не меняют: это вариант КП того же объекта.
 * Ключ и старый формат прежние: id клиента строкой (без комнат и объекта) — живёт до пустого
 * черновика.
 */
type DraftOrigin = { clientId: string | null; objectId: string | null; roomIds: string[] | null };

function readDraftOrigin(): DraftOrigin | null {
  try {
    const raw = localStorage.getItem(DRAFT_CLIENT_KEY);
    if (!raw) return null;
    if (!raw.startsWith("{")) return { clientId: raw, objectId: null, roomIds: null };
    const parsed = JSON.parse(raw) as { id?: unknown; objectId?: unknown; roomIds?: unknown };
    const clientId = typeof parsed.id === "string" && parsed.id ? parsed.id : null;
    const objectId = typeof parsed.objectId === "string" && parsed.objectId ? parsed.objectId : null;
    if (!clientId && !objectId) return null;
    return { clientId, objectId, roomIds: Array.isArray(parsed.roomIds) ? parsed.roomIds.filter((x): x is string => typeof x === "string") : null };
  } catch {
    return null;
  }
}

function setDraftOrigin(origin: { clientId?: string | null; objectId?: string | null } | null, roomIds: string[] | null = []) {
  try {
    const clientId = origin?.clientId || null;
    const objectId = origin?.objectId || null;
    if (clientId || objectId) localStorage.setItem(DRAFT_CLIENT_KEY, JSON.stringify({ id: clientId, objectId, roomIds }));
    else localStorage.removeItem(DRAFT_CLIENT_KEY);
  } catch {}
}

/** Состав комнат изменился: происхождение остаётся, только пока жива хоть одна его комната. */
function dropDraftOriginIfRoomsGone(rooms: RoomInput[]) {
  const origin = readDraftOrigin();
  if (!origin) return;
  const alive = origin.roomIds ? rooms.some((r) => origin.roomIds!.includes(r.id)) : rooms.length > 0;
  if (!alive) setDraftOrigin(null);
}

/**
 * Клиент для окна «Сохранить КП».
 * Черновик привязан к объекту замера — клиент этого объекта подставляется всегда, без срока:
 * КП всё равно уйдёт в этот объект, и если через сутки окно откроется пустым, мастер впишет
 * другое имя — в одном объекте окажутся КП двух клиентов (замечание живой проверки 13.11.2026).
 * Клиент БЕЗ объекта (КП без объекта, старый формат) через сутки без изменений черновика не
 * подставляется — как раньше.
 */
export function draftClientId(): string | null {
  ensureDraftOwner();
  const origin = readDraftOrigin();
  if (!origin?.clientId) return null;
  if (!origin.objectId && !calculatorDraftIsFresh(DRAFT_CLIENT_TTL_MS)) {
    setDraftOrigin(null);
    return null;
  }
  return origin.clientId;
}

/** Объект замера, к которому привяжется КП при сохранении (fromMeasurementId), или null. */
export function draftObjectId(): string | null {
  ensureDraftOwner();
  return readDraftOrigin()?.objectId ?? null;
}

// ── localStorage as the single source of truth ──
//
// Комнаты, допы и результат читаются через useSyncExternalStore с ПУСТЫМ серверным снимком
// (13.11.2026). Раньше результат и допы поднимались в инициализаторах useState, а у комнат
// серверный снимок был тем же чтением localStorage: с черновиком в браузере первый клиентский
// рендер не совпадал с серверной разметкой — React #418. Теперь гидратация идёт на пустом
// состоянии, и React сам перерисовывает с черновиком сразу после неё, до отрисовки кадра.

const NO_ROOMS: RoomInput[] = [];
const NO_EXTRAS: ExtraItem[] = [];

let cachedRooms: RoomInput[] | null = null;
/** undefined — из браузера ещё не читали. */
let cachedResult: CalculationResult | null | undefined;
let cachedExtras: ExtraItem[] | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// Аккаунт сменился без перезагрузки страницы (сессия истекла → вход → переход внутри сайта):
// черновик прежнего мастера стёрт из браузера — забываем его и в памяти. Поэтому же каждое
// чтение ниже начинается со сверки владельца, а не только первое.
onDraftsCleared(() => {
  cachedRooms = null;
  cachedResult = undefined;
  cachedExtras = null;
});

function getRooms(): RoomInput[] {
  // Черновик другого аккаунта на этом компьютере стирается до чтения (и из памяти тоже).
  ensureDraftOwner();
  if (cachedRooms !== null) return cachedRooms;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedRooms = parsed;
        return parsed;
      }
    }
  } catch {}
  // Один и тот же массив на каждый вызов: новый `[]` React считал сменой снимка
  // («getServerSnapshot should be cached») при открытии калькулятора
  cachedRooms = NO_ROOMS;
  return cachedRooms;
}

function setRoomsStore(next: RoomInput[]) {
  cachedRooms = next;
  try {
    // Любое изменение: черновик больше не точная копия замера, его нельзя заменять молча.
    localStorage.removeItem(DRAFT_SOURCE_KEY);
    if (next.length > 0) {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  } catch {}
  dropDraftOriginIfRoomsGone(next);
  touchCalculatorDraft();
  // Notify all subscribers (triggers React re-render)
  notify();
}

function getResult(): CalculationResult | null {
  ensureDraftOwner();
  if (cachedResult !== undefined) return cachedResult;
  cachedResult = null;
  try {
    const saved = localStorage.getItem(RESULT_KEY);
    if (saved) cachedResult = JSON.parse(saved) as CalculationResult;
  } catch {}
  return cachedResult;
}

function setResultStore(r: CalculationResult | null) {
  if (r === null && getResult() === null) return;
  cachedResult = r;
  try {
    if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
    else localStorage.removeItem(RESULT_KEY);
  } catch {}
  notify();
}

function getExtras(): ExtraItem[] {
  ensureDraftOwner();
  if (cachedExtras !== null) return cachedExtras;
  cachedExtras = NO_EXTRAS;
  try {
    const raw = localStorage.getItem(EXTRA_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cachedExtras = parsed;
    }
  } catch {}
  return cachedExtras;
}

/**
 * Допы изменил мастер (или код страницы): расчёт по прежним допам больше не верен — сбрасываем,
 * как при изменении комнат. Подъём допов из браузера сюда не попадает (это getExtras), поэтому
 * после перезагрузки страницы сохранённый результат и кнопка «Сохранить КП» остаются.
 */
function setExtrasStore(next: ExtraItem[]) {
  cachedExtras = next;
  try {
    localStorage.removeItem(DRAFT_SOURCE_KEY);
    if (next.length > 0) localStorage.setItem(EXTRA_ITEMS_KEY, JSON.stringify(next));
    else localStorage.removeItem(EXTRA_ITEMS_KEY);
  } catch {}
  touchCalculatorDraft();
  if (getResult() !== null) setResultStore(null);
  else notify();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): RoomInput[] {
  return getRooms();
}

// Снимки для сервера и для гидратации: черновика «ещё нет».
const serverRooms = () => NO_ROOMS;
const serverResult = () => null;
const serverExtras = () => NO_EXTRAS;
const isHydrated = () => true;
const notHydrated = () => false;

/** В черновике нет ни комнат, ни допов. Из стора, а не из рендера: эффект первой загрузки
 *  страницы видит ещё «пустой» рендер гидратации. */
export function calculatorDraftIsEmpty(): boolean {
  return getRooms().length === 0 && getExtras().length === 0;
}

// ── Hook ──

export function useCalculator() {
  // useSyncExternalStore: React-recommended way to sync with external store
  const rooms = useSyncExternalStore(subscribe, getSnapshot, serverRooms);
  const result = useSyncExternalStore(subscribe, getResult, serverResult);
  // Доп. работы (общий блок «Дополнительно» в КП)
  const extraItems = useSyncExternalStore(subscribe, getExtras, serverExtras);
  /** false на сервере и на время гидратации: черновик из браузера ещё не поднят, страница
   *  показывает загрузку, а не пустую форму «Добавить комнату». */
  const hydrated = useSyncExternalStore(subscribe, isHydrated, notHydrated);

  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Итог сменился из-за прайса, а не правок мастера: страница показывает «было → стало». */
  const [pricesChanged, setPricesChanged] = useState<{ was: number; now: number } | null>(null);

  /** Свежий расчёт сервера вместо показанного. Итог другой — запоминаем «было → стало». */
  const applyFreshResult = useCallback((fresh: CalculationResult, shownTotal: number) => {
    setResultStore(fresh);
    if (fresh.total !== shownTotal) setPricesChanged({ was: shownTotal, now: fresh.total });
  }, []);

  // Результат, поднятый из браузера, мог быть посчитан по старому прайсу (13.11.2026):
  // при открытии калькулятора тихо пересчитываем. Не вышло (нет сети) — оставляем как есть,
  // сервер всё равно сверит итог при сохранении.
  useEffect(() => {
    // Читаем из стора, а не из первого рендера: на гидратации результат ещё пуст.
    const shown = getResult();
    const current = getRooms();
    if (!shown || current.length === 0) return;
    let cancelled = false;
    fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: current, extraItems: getExtras() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh: CalculationResult | null) => {
        // За время запроса мастер мог изменить комнаты — тогда результат уже сброшен, не возвращаем.
        if (cancelled || !fresh || typeof fresh.total !== "number" || getResult() === null) return;
        applyFreshResult(fresh, shown.total);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Один раз при открытии: extraItems и комнаты берём как были в браузере.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const restoredDraft = rooms.length > 0;

  const addRoom = useCallback((room: RoomInput) => {
    const current = getRooms();
    setRoomsStore([...current, room]);
    setResultStore(null);
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    const current = getRooms();
    setRoomsStore(current.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setResultStore(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    const current = getRooms();
    setRoomsStore(current.filter((r) => r.id !== id));
    setResultStore(null);
  }, []);

  const duplicateRoom = useCallback((id: string) => {
    const current = getRooms();
    const room = current.find((r) => r.id === id);
    if (!room) return;
    setRoomsStore([
      ...current,
      { ...room, id: crypto.randomUUID(), name: room.name + " (копия)" },
    ]);
    setResultStore(null);
  }, []);

  const calculate = useCallback(async () => {
    const current = getRooms();
    if (current.length === 0) {
      setError("Добавьте хотя бы одну комнату");
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: current, extraItems: getExtras() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка расчёта");
        return;
      }

      setResultStore(data);
      setPricesChanged(null);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setIsCalculating(false);
    }
  }, []);

  /** Комнаты существующего КП («Редактировать как новое»): новое КП — того же объекта и клиента. */
  const loadRooms = useCallback((importedRooms: RoomInput[], origin: { objectId?: string | null; clientId?: string | null } | null = null) => {
    const next = importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() }));
    // Сначала происхождение с новыми комнатами, потом сами комнаты (см. replaceWithMeasurement).
    setDraftOrigin(origin, next.map((r) => r.id));
    setRoomsStore(next);
    setResultStore(null);
    setError(null);
  }, []);

  /** Весь замер в калькулятор: заменяет черновик вместе с доп. работами и клиентом прошлого замера. */
  const replaceWithMeasurement = useCallback((importedRooms: RoomInput[], sourceId: string, clientId: string | null = null) => {
    const next = importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() }));
    // Сначала происхождение с комнатами этого замера, потом сами комнаты: иначе запись комнат
    // сверила бы их с происхождением прошлого черновика.
    setDraftOrigin({ clientId, objectId: sourceId || null }, next.map((r) => r.id));
    setRoomsStore(next);
    setResultStore(null);
    setError(null);
    setExtrasStore([]);
    try { localStorage.setItem(DRAFT_SOURCE_KEY, sourceId); } catch {}
  }, []);

  const reset = useCallback(() => {
    setRoomsStore([]);
    setResultStore(null);
    setError(null);
    setExtrasStore([]);
    setDraftOrigin(null);
  }, []);

  return {
    rooms,
    result,
    isCalculating,
    error,
    restoredDraft,
    addRoom,
    updateRoom,
    removeRoom,
    duplicateRoom,
    calculate,
    reset,
    loadRooms,
    replaceWithMeasurement,
    extraItems,
    setExtraItems: setExtrasStore,
    hydrated,
    pricesChanged,
    dismissPricesChanged: () => setPricesChanged(null),
    applyFreshResult,
  };
}
