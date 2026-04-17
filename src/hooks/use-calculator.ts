"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { RoomInput, CalculationResult } from "@/lib/types";

const AUTOSAVE_KEY = "calculator-rooms-draft";

function readFromStorage(): RoomInput[] {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      const parsed: RoomInput[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

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
  // Lazy init: read from localStorage IMMEDIATELY (no useEffect race)
  const [rooms, setRooms] = useState<RoomInput[]>(readFromStorage);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoredDraft] = useState(() => readFromStorage().length > 0);

  // Ref always holds latest rooms — used in callbacks to avoid stale closures
  const roomsRef = useRef<RoomInput[]>(rooms);

  // Sync ref + localStorage on every rooms change
  useEffect(() => {
    roomsRef.current = rooms;
    saveToStorage(rooms);
  }, [rooms]);

  const addRoom = useCallback((room: RoomInput) => {
    // Use ref to guarantee latest value (belt + suspenders with functional updater)
    const next = [...roomsRef.current, room];
    roomsRef.current = next;
    setRooms(next);
    setResult(null);
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    const next = roomsRef.current.map((r) => (r.id === id ? { ...r, ...updates } : r));
    roomsRef.current = next;
    setRooms(next);
    setResult(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    const next = roomsRef.current.filter((r) => r.id !== id);
    roomsRef.current = next;
    setRooms(next);
    setResult(null);
  }, []);

  const duplicateRoom = useCallback((id: string) => {
    const room = roomsRef.current.find((r) => r.id === id);
    if (!room) return;
    const next = [
      ...roomsRef.current,
      { ...room, id: crypto.randomUUID(), name: room.name + " (копия)" },
    ];
    roomsRef.current = next;
    setRooms(next);
    setResult(null);
  }, []);

  const calculate = useCallback(async () => {
    if (roomsRef.current.length === 0) {
      setError("Добавьте хотя бы одну комнату");
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: roomsRef.current }),
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
    const fresh = importedRooms.map((r) => ({ ...r, id: crypto.randomUUID() }));
    roomsRef.current = fresh;
    setRooms(fresh);
    setResult(null);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    roomsRef.current = [];
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
