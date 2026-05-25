"use client";

// Простой drag-based "до/после" слайдер без сторонних зависимостей.
// Левая часть — beforeUrl (исходный план/фото), правая — afterUrl (AI-рендер).

import { useCallback, useRef, useState } from "react";

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  sourceLabel: string;
}

export function CompareSlider({ beforeUrl, afterUrl, sourceLabel }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(50); // %

  const handleMove = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-slate-200 select-none"
      onMouseMove={(e) => {
        if (e.buttons === 1) handleMove(e.clientX);
      }}
      onTouchMove={(e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX);
      }}
    >
      {/* AFTER — фон */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt="AI-визуализация"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* BEFORE — поверх, клипается ширина */}
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl}
          alt={sourceLabel}
          className="absolute inset-0 h-full object-cover"
          style={{ width: containerRef.current?.clientWidth ?? "100%" }}
          draggable={false}
        />
      </div>

      {/* Drag handle */}
      <div
        className="absolute inset-y-0 w-1 bg-white shadow-lg"
        style={{ left: `calc(${position}% - 2px)` }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
          <span className="text-slate-700">⇆</span>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {sourceLabel}
      </div>
      <div className="absolute right-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
        AI-рендер
      </div>
    </div>
  );
}
