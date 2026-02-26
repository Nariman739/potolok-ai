"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { CalculationResult, RoomResult } from "@/lib/types";

interface ConfirmSectionProps {
  estimateId: string;
  calc: CalculationResult;
  total: number;
  initialConfirmed: boolean;
  brandColor: string;
}

export function ConfirmSection({
  estimateId,
  calc,
  total,
  initialConfirmed,
  brandColor,
}: ConfirmSectionProps) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);

  // Support both new (roomResults) and old (variants) format
  const roomResults: RoomResult[] = calc.roomResults
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? ((calc as any).variants?.find((v: any) => v.type === "standard")?.rooms as RoomResult[])
    ?? [];

  const minOrderApplied = calc.minOrderApplied
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (calc as any).variants?.find((v: any) => v.type === "standard")?.minOrderApplied
    ?? false;

  async function handleConfirm() {
    if (confirmed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) setConfirmed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4">
      {/* Success banner */}
      {confirmed && (
        <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
          <p className="text-emerald-700 font-semibold text-base">
            Предложение принято!
          </p>
          <p className="text-emerald-600 text-sm mt-1">
            Мастер свяжется с вами для уточнения деталей.
          </p>
        </div>
      )}

      {/* Single price card */}
      <div
        className="rounded-2xl border-2 bg-white overflow-hidden shadow-lg"
        style={{ borderColor: brandColor }}
      >
        {/* Header */}
        <div className="p-5" style={{ background: `${brandColor}12` }}>
          <p className="text-sm font-semibold" style={{ color: brandColor }}>
            Стоимость работ
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {formatPrice(total)}
          </p>
          {calc.totalArea > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {formatPrice(Math.round(total / calc.totalArea))}/м²
            </p>
          )}
        </div>

        {/* Line items */}
        <div className="p-4 space-y-3">
          {roomResults.map((rr) => (
            <div key={rr.roomId}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {rr.roomName}
              </p>
              {rr.items.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between items-start text-xs text-gray-600 py-0.5"
                >
                  <div className="leading-tight">
                    <span>{item.itemName}</span>
                    <span className="text-gray-400 ml-1">
                      {item.quantity} {item.unit} × {formatPrice(item.unitPrice)}
                    </span>
                  </div>
                  <span className="font-medium ml-2 shrink-0">
                    {formatPrice(item.total)}
                  </span>
                </div>
              ))}
              {rr.heightMultiplied && (
                <p className="text-[10px] text-orange-500 mt-0.5">
                  x 1.3 (высота &gt;3м)
                </p>
              )}
            </div>
          ))}
          {minOrderApplied && (
            <p className="text-[10px] text-gray-400 italic">
              * Применён минимальный заказ
            </p>
          )}
        </div>

        {/* Action */}
        <div className="p-4 pt-0">
          {confirmed ? (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 font-semibold py-3 rounded-xl text-sm">
              Принято
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all"
              style={{ backgroundColor: brandColor }}
            >
              {loading ? "Подтверждаем..." : "Принять предложение"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
