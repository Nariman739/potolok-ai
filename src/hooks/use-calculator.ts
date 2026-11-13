"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import type { RoomInput, CalculationResult, ExtraItem } from "@/lib/types";
import { ensureDraftOwner, touchCalculatorDraft, calculatorDraftIsFresh, DRAFT_CLIENT_TTL_MS } from "@/lib/draft-owner";

const AUTOSAVE_KEY = "calculator-rooms-draft";
const EXTRA_ITEMS_KEY = "calculator-extra-items-draft";
const DRAFT_SOURCE_KEY = "calculator-draft-source";
/** Клиент замера, из которого собран черновик: на нём встаёт окно «Сохранить КП». */
const DRAFT_CLIENT_KEY = "calculator-draft-client";
const RESULT_KEY = "calculator-result-draft";

/**
 * Клиент замера помнится вместе с комнатами этого замера (13.11.2026): пока в черновике
 * есть хоть одна из них — это всё ещё КП того же клиента. Убрали все (и набрали другие) —
 * это уже чужой расчёт, клиента забываем. Раньше он сбрасывался только кнопкой «Новый
 * расчёт», и КП клиента Б могло сохраниться на А.
 * Старый формат — просто id строкой (без комнат): живёт до пустого черновика.
 */
type DraftClient = { id: string; roomIds: string[] | null };

function readDraftClient(): DraftClient | null {
  try {
    const raw = localStorage.getItem(DRAFT_CLIENT_KEY);
    if (!raw) return null;
    if (!raw.startsWith("{")) return { id: raw, roomIds: null };
    const parsed = JSON.parse(raw) as { id?: unknown; roomIds?: unknown };
    if (typeof parsed.id !== "string" || !parsed.id) return null;
    return { id: parsed.id, roomIds: Array.isArray(parsed.roomIds) ? parsed.roomIds.filter((x): x is string => typeof x === "string") : null };
  } catch {
    return null;
  }
}

function setDraftClient(clientId: string | null, roomIds: string[] = []) {
  try {
    if (clientId) localStorage.setItem(DRAFT_CLIENT_KEY, JSON.stringify({ id: clientId, roomIds }));
    else localStorage.removeItem(DRAFT_CLIENT_KEY);
  } catch {}
}

/** Состав комнат изменился: клиент замера остаётся, только пока жива хоть одна его комната. */
function dropDraftClientIfRoomsGone(rooms: RoomInput[]) {
  const client = readDraftClient();
  if (!client) return;
  const alive = client.roomIds ? rooms.some((r) => client.roomIds!.includes(r.id)) : rooms.length > 0;
  if (!alive) setDraftClient(null);
}

/** Клиент для окна «Сохранить КП». Через сутки без изменений черновика не подставляется. */
export function draftClientId(): string | null {
  ensureDraftOwner();
  const client = readDraftClient();
  if (!client) return null;
  if (!calculatorDraftIsFresh(DRAFT_CLIENT_TTL_MS)) {
    setDraftClient(null);
    return null;
  }
  return client.id;
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

function getRooms(): RoomInput[] {
  if (cachedRooms !== null) return cachedRooms;
  // Черновик другого аккаунта на этом компьютере стирается до первого чтения.
  ensureDraftOwner();
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
  dropDraftClientIfRoomsGone(next);
  touchCalculatorDraft();
  // Notify all subscribers (triggers React re-render)
  notify();
}

function getResult(): CalculationResult | null {
  if (cachedResult !== undefined) return cachedResult;
  ensureDraftOwner();
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
  if (cachedExtras !== null) return cachedExtras;
  ensureDraftOwner();
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

  const loadRooms = useCallback((importedRooms: RoomInput[]) => {
    setRoomsStore(importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() })));
    setResultStore(null);
    setError(null);
    setDraftClient(null);
  }, []);

  /** Весь замер в калькулятор: заменяет черновик вместе с доп. работами и клиентом прошлого замера. */
  const replaceWithMeasurement = useCallback((importedRooms: RoomInput[], sourceId: string, clientId: string | null = null) => {
    const next = importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() }));
    // Сначала клиент с комнатами этого замера, потом сами комнаты: иначе запись комнат
    // сверила бы их с клиентом прошлого замера.
    setDraftClient(clientId, next.map((r) => r.id));
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
    setDraftClient(null);
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
