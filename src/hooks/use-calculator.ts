"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { RoomInput, CalculationResult, ExtraItem } from "@/lib/types";

const AUTOSAVE_KEY = "calculator-rooms-draft";
const EXTRA_ITEMS_KEY = "calculator-extra-items-draft";
const DRAFT_SOURCE_KEY = "calculator-draft-source";
/** Клиент замера, из которого собран черновик: на нём встаёт окно «Сохранить КП». */
const DRAFT_CLIENT_KEY = "calculator-draft-client";

function setDraftClient(clientId: string | null) {
  try {
    if (clientId) localStorage.setItem(DRAFT_CLIENT_KEY, clientId);
    else localStorage.removeItem(DRAFT_CLIENT_KEY);
  } catch {}
}

export function draftClientId(): string | null {
  try { return localStorage.getItem(DRAFT_CLIENT_KEY) || null; } catch { return null; }
}

// ── localStorage as the single source of truth ──

let cachedRooms: RoomInput[] | null = null;
const listeners = new Set<() => void>();

function getRooms(): RoomInput[] {
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
      const saved = localStorage.getItem("calculator-result-draft");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // Wrapper that persists result to localStorage
  const setResult = useCallback((r: CalculationResult | null) => {
    setResultState(r);
    try {
      if (r) localStorage.setItem("calculator-result-draft", JSON.stringify(r));
      else localStorage.removeItem("calculator-result-draft");
    } catch {}
  }, []);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredDraft = rooms.length > 0;

  // Доп. работы (общий блок «Дополнительно» в КП)
  const [extraItems, setExtraItemsState] = useState<ExtraItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
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
    setRoomsStore(importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() })));
    setResult(null);
    setError(null);
    setExtraItems([]);
    setDraftClient(clientId);
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
  };
}
