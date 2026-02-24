"use client";

import { useState, useCallback } from "react";
import type { RoomInput, CalculationResult } from "@/lib/types";

export function useCalculator() {
  const [rooms, setRooms] = useState<RoomInput[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRoom = useCallback((room: RoomInput) => {
    setRooms((prev) => [...prev, room]);
    setResult(null);
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
    setResult(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setResult(null);
  }, []);

  const duplicateRoom = useCallback((id: string) => {
    setRooms((prev) => {
      const room = prev.find((r) => r.id === id);
      if (!room) return prev;
      return [
        ...prev,
        {
          ...room,
          id: crypto.randomUUID(),
          name: room.name + " (копия)",
        },
      ];
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

  const reset = useCallback(() => {
    setRooms([]);
    setResult(null);
    setError(null);
  }, []);

  return {
    rooms,
    result,
    isCalculating,
    error,
    addRoom,
    updateRoom,
    removeRoom,
    duplicateRoom,
    calculate,
    reset,
  };
}
