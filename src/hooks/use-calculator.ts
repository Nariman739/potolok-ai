"use client";

import { useState, useCallback, useEffect } from "react";
import type { RoomInput, CalculationResult } from "@/lib/types";

const AUTOSAVE_KEY = "calculator-rooms-draft";

function saveToStorage(rooms: RoomInput[]) {
  try {
    if (rooms.length > 0) {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(rooms));
    } else {
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  } catch {}
}

export function useCalculator() {
  const [rooms, setRooms] = useState<RoomInput[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);

  // Restore draft on first mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed: RoomInput[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setRooms(parsed);
          setRestoredDraft(true);
        }
      }
    } catch {}
  }, []);

  const addRoom = useCallback((room: RoomInput) => {
    setRooms((prev) => {
      const next = [...prev, room];
      saveToStorage(next);
      return next;
    });
    setResult(null);
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    setRooms((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
      saveToStorage(next);
      return next;
    });
    setResult(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveToStorage(next);
      return next;
    });
    setResult(null);
  }, []);

  const duplicateRoom = useCallback((id: string) => {
    setRooms((prev) => {
      const room = prev.find((r) => r.id === id);
      if (!room) return prev;
      const next = [
        ...prev,
        {
          ...room,
          id: crypto.randomUUID(),
          name: room.name + " (копия)",
        },
      ];
      saveToStorage(next);
      return next;
    });
    setResult(null);
  }, []);

  const calculate = useCallback(async () => {
    if (rooms.length === 0) {
      setError("Добавьте хотя бы одну комнату");
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms }),
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
  }, [rooms]);

  const loadRooms = useCallback((importedRooms: RoomInput[]) => {
    // Give fresh IDs to avoid collisions
    const fresh = importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() }));
    setRooms(fresh);
    saveToStorage(fresh);
    setResult(null);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setRooms([]);
    saveToStorage([]);
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
