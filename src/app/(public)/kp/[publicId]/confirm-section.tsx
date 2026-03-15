"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { CalculationResult, RoomResult } from "@/lib/types";
import { ChevronDown } from "lucide-react";

interface ConfirmSectionProps {
  estimateId: string;
  calc: CalculationResult;
  total: number;
  discountPercent: number;
  initialConfirmed: boolean;
  isRevised?: boolean;
  brandColor: string;
}

export function ConfirmSection({
  estimateId,
  calc,
  total,
  discountPercent,
  initialConfirmed,
  isRevised,
  brandColor,
}: ConfirmSectionProps) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  // Support both new (roomResults) and old (variants) format
  const roomResults: RoomResult[] = calc.roomResults
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? ((calc as any).variants?.find((v: any) => v.type === "standard")?.rooms as RoomResult[])
    ?? [];

  const minOrderApplied = calc.minOrderApplied
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (calc as any).variants?.find((v: any) => v.type === "standard")?.minOrderApplied
    ?? false;

  function toggleRoom(roomId: string) {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

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

      <div
        className="rounded-2xl border-2 bg-white overflow-hidden shadow-lg"
        style={{ borderColor: brandColor }}
      >
        {/* Header — total price */}
        <div className="p-5" style={{ background: `${brandColor}12` }}>
          <p className="text-sm font-semibold" style={{ color: brandColor }}>
            Стоимость работ
          </p>
          {discountPercent > 0 && (
            <p className="text-sm text-gray-400 line-through mt-1">
              {formatPrice(calc.total)}
            </p>
          )}
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {formatPrice(total)}
          </p>
          {discountPercent > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              Скидка {discountPercent}%
            </p>
          )}
          {calc.totalArea > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {calc.totalArea.toFixed(1)} м² · {formatPrice(Math.round(total / calc.totalArea))}/м²
            </p>
          )}
        </div>

        {/* Rooms — each with subtotal + collapsible items */}
        {roomResults.length > 0 && (
          <div className="divide-y divide-gray-100">
            {roomResults.map((rr) => {
              const isOpen = expandedRooms.has(rr.roomId);
              const subtotal = rr.heightMultiplied ? rr.subtotalAfterHeight : rr.subtotal;
              return (
                <div key={rr.roomId}>
                  {/* Room header — always visible */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => toggleRoom(rr.roomId)}
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-900">
                        {rr.roomName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rr.area.toFixed(1)} м²
                        {rr.items.length > 0 && ` · ${rr.items.length} позиций`}
                        {rr.heightMultiplied && (
                          <span className="text-orange-500 ml-1">· высота &gt;3м</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="font-bold text-sm" style={{ color: brandColor }}>
                        {formatPrice(subtotal)}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 text-gray-400 transition-transform"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </div>
                  </button>

                  {/* Collapsible items */}
                  {isOpen && (
                    <div className="bg-gray-50/70 px-4 pb-3 space-y-1.5">
                      {rr.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-start text-xs text-gray-600 py-0.5"
                        >
                          <div className="leading-tight">
                            <span className="text-gray-700">{item.itemName}</span>
                            <span className="text-gray-400 ml-1.5">
                              {item.quantity} {item.unit} × {formatPrice(item.unitPrice)}
                            </span>
                          </div>
                          <span className="font-medium ml-2 shrink-0 text-gray-800">
                            {formatPrice(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {minOrderApplied && (
          <p className="text-[10px] text-gray-400 italic px-4 pb-3">
            * Применён минимальный заказ
          </p>
        )}

        {/* Hint to expand */}
        {roomResults.length > 0 && expandedRooms.size === 0 && (
          <p className="text-[11px] text-gray-400 text-center pb-3">
            Нажмите на комнату, чтобы увидеть детальный состав
          </p>
        )}

        {/* Action */}
        <div className="p-4 pt-2">
          {isRevised ? (
            <div className="flex items-center justify-center gap-2 bg-orange-50 text-orange-600 font-semibold py-3 rounded-xl text-sm border border-orange-200">
              Предложение пересмотрено
            </div>
          ) : confirmed ? (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 font-semibold py-3 rounded-xl text-sm">
              ✓ Принято
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
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
