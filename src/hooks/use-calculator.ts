"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
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

let cachedRooms: RoomInput[] | null = null;
const listeners = new Set<() => void>();

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
  // Тот же массив, что и в кэше: новый `[]` на каждый вызов React считал сменой снимка
  // («getServerSnapshot should be cached») при открытии калькулятора
  cachedRooms = [];
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
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): RoomInput[] {
  return getRooms();
}

// ── Hook ──

export function useCalculator() {
  // useSyncExternalStore: React-recommended way to sync with external store
  const rooms = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [result, setResultState] = useState<CalculationResult | null>(() => {
    try {
      ensureDraftOwner();
      const saved = localStorage.getItem(RESULT_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // Wrapper that persists result to localStorage
  const setResult = useCallback((r: CalculationResult | null) => {
    setResultState(r);
    try {
      if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
      else localStorage.removeItem(RESULT_KEY);
    } catch {}
  }, []);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Итог сменился из-за прайса, а не правок мастера: страница показывает «было → стало». */
  const [pricesChanged, setPricesChanged] = useState<{ was: number; now: number } | null>(null);

  /** Свежий расчёт сервера вместо показанного. Итог другой — запоминаем «было → стало». */
  const applyFreshResult = useCallback((fresh: CalculationResult, shownTotal: number) => {
    setResult(fresh);
    if (fresh.total !== shownTotal) setPricesChanged({ was: shownTotal, now: fresh.total });
  }, [setResult]);

  // Результат, поднятый из браузера, мог быть посчитан по старому прайсу (13.11.2026):
  // при открытии калькулятора тихо пересчитываем. Не вышло (нет сети) — оставляем как есть,
  // сервер всё равно сверит итог при сохранении.
  const restoredResult = useRef(result);
  useEffect(() => {
    const shown = restoredResult.current;
    const current = getRooms();
    if (!shown || current.length === 0) return;
    let cancelled = false;
    fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: current, extraItems }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh: CalculationResult | null) => {
        // За время запроса мастер мог изменить комнаты — тогда результат уже сброшен, не возвращаем.
        if (cancelled || !fresh || typeof fresh.total !== "number" || localStorage.getItem(RESULT_KEY) === null) return;
        applyFreshResult(fresh, shown.total);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Один раз при открытии: extraItems и комнаты берём как были в браузере.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const restoredDraft = rooms.length > 0;

  // Доп. работы (общий блок «Дополнительно» в КП)
  const [extraItems, setExtraItemsState] = useState<ExtraItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      ensureDraftOwner();
      const raw = localStorage.getItem(EXTRA_ITEMS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const setExtraItems = useCallback((next: ExtraItem[]) => {
    setExtraItemsState(next);
    try {
      localStorage.removeItem(DRAFT_SOURCE_KEY);
      if (next.length > 0) localStorage.setItem(EXTRA_ITEMS_KEY, JSON.stringify(next));
      else localStorage.removeItem(EXTRA_ITEMS_KEY);
    } catch {}
    touchCalculatorDraft();
  }, []);

  // Очистка результата при смене extraItems (так же как при изменении комнат)
  // Только при реальной смене: на монтировании эффект стирал сохранённый результат,
  // и после перезагрузки страницы «Сохранить КП» пропадало до нового «Рассчитать».
  const extraItemsSeen = useRef(extraItems);
  useEffect(() => {
    if (extraItemsSeen.current === extraItems) return;
    extraItemsSeen.current = extraItems;
    if (result) setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraItems]);

  const addRoom = useCallback((room: RoomInput) => {
    const current = getRooms();
    setRoomsStore([...current, room]);
    setResult(null);
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    const current = getRooms();
    setRoomsStore(current.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setResult(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    const current = getRooms();
    setRoomsStore(current.filter((r) => r.id !== id));
    setResult(null);
  }, []);

  const duplicateRoom = useCallback((id: string) => {
    const current = getRooms();
    const room = current.find((r) => r.id === id);
    if (!room) return;
    setRoomsStore([
      ...current,
      { ...room, id: crypto.randomUUID(), name: room.name + " (копия)" },
    ]);
    setResult(null);
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
        body: JSON.stringify({ rooms: current, extraItems }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка расчёта");
        return;
      }

      setResult(data);
      setPricesChanged(null);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setIsCalculating(false);
    }
  }, [extraItems, setResult]);

  const loadRooms = useCallback((importedRooms: RoomInput[]) => {
    setRoomsStore(importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() })));
    setResult(null);
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
    setResult(null);
    setError(null);
    setExtraItems([]);
    try { localStorage.setItem(DRAFT_SOURCE_KEY, sourceId); } catch {}
  }, [setExtraItems, setResult]);

  const reset = useCallback(() => {
    setRoomsStore([]);
    setResult(null);
    setError(null);
    setExtraItems([]);
    setDraftClient(null);
  }, [setExtraItems, setResult]);

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
    setExtraItems,
    pricesChanged,
    dismissPricesChanged: () => setPricesChanged(null),
    applyFreshResult,
  };
}
