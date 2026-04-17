"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import type { RoomInput, CalculationResult } from "@/lib/types";

const AUTOSAVE_KEY = "calculator-rooms-draft";

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
  cachedRooms = [];
  return [];
}

function setRoomsStore(next: RoomInput[]) {
  cachedRooms = next;
  try {
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
        body: JSON.stringify({ rooms: current }),
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
  }, []);

  const loadRooms = useCallback((importedRooms: RoomInput[]) => {
    setRoomsStore(importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() })));
    setResult(null);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setRoomsStore([]);
    setResult(null);
    setError(null);
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
  };
}
