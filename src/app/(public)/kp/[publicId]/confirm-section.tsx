"use client";

import { useState } from "react";
import { useCurrency } from "@/components/currency-provider";
import type { CalculationResult, RoomResult } from "@/lib/types";
import { ChevronDown } from "lucide-react";

/** Подписи краткого вида — с сервера на языке страницы (ru/kk). */
export type SummaryLabels = {
  room: string;
  name: string;
  total: string;
  extra: string;
  heightExtra: string;
  subtotal: string;
  discount: string;
  toPay: string;
};

interface ConfirmSectionProps {
  publicId: string;
  calc: CalculationResult;
  total: number;
  discountPercent: number;
  discountAmount?: number;
  initialConfirmed: boolean;
  isRevised?: boolean;
  brandColor: string;
  /**
   * summary — таблица «Помещение | Наименование | Итого» без количества и цен
   * за единицу (16.10.2026). Сервер в этом режиме уже вырезал числа из calc,
   * поэтому итог «Дополнительно» приходит отдельно.
   */
  priceView?: "detailed" | "summary";
  extrasTotal?: number;
  summaryLabels?: SummaryLabels;
}

export function ConfirmSection({
  publicId,
  calc,
  total,
  discountPercent,
  discountAmount = 0,
  initialConfirmed,
  isRevised,
  brandColor,
  priceView = "detailed",
  extrasTotal = 0,
  summaryLabels,
}: ConfirmSectionProps) {
  const summary = priceView === "summary";
  // Валюта владельца КП приходит из CurrencyProvider на серверной странице (07.10.2026)
  const { format: formatPrice } = useCurrency();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  // Отказ сервера надо показать: раньше при ошибке спиннер просто гас, клиент
  // считал, что принял, а мастер видел молчание (аудит 24.09.2026).
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch(`/api/estimates/by-public/${publicId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setConfirmed(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        res.status === 429
          ? "Слишком много попыток подряд. Подождите минуту и нажмите снова."
          : body?.error || "Не получилось принять. Позвоните мастеру — он отметит вручную.",
      );
    } catch {
      setError("Нет связи. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4">
      {error && !confirmed && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

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
          {discountAmount > 0 && (
            <p className="text-sm text-gray-400 line-through mt-1">
              {formatPrice(total + discountAmount)}
            </p>
          )}
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {formatPrice(total)}
          </p>
          {discountAmount > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              {discountPercent > 0
                ? `Скидка ${discountPercent}% · −${formatPrice(discountAmount)}`
                : `Скидка −${formatPrice(discountAmount)}`}
            </p>
          )}
          {calc.totalArea > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {calc.totalArea.toFixed(1)} м²
              {/* Цена за м² — тоже цена за единицу, в кратком виде её нет */}
              {!summary && ` · ${formatPrice(Math.round(total / calc.totalArea))}/м²`}
            </p>
          )}
        </div>

        {/* Кратко: таблица как в смете «от руки» — помещение, что входит, итог.
            Без количества и цен за единицу, чтобы смету не пересылали
            конкурентам «для кастинга» (16.10.2026). */}
        {summary && roomResults.length > 0 && summaryLabels && (
          <SummaryTable
            roomResults={roomResults}
            extraItems={calc.extraItems ?? []}
            extrasTotal={extrasTotal}
            total={total}
            discountAmount={discountAmount}
            discountPercent={discountPercent}
            labels={summaryLabels}
            brandColor={brandColor}
            formatPrice={formatPrice}
          />
        )}

        {/* Rooms — each with subtotal + collapsible items */}
        {!summary && roomResults.length > 0 && (
          <div className="divide-y divide-gray-100">
            {/* Доп. работы — отдельный блок «Дополнительно» */}
            {calc.extraItems && calc.extraItems.length > 0 && (() => {
              const isOpen = expandedRooms.has("__extras__");
              const extrasSubtotal = calc.extraItems.reduce((s, it) => s + it.total, 0);
              return (
                <div>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => toggleRoom("__extras__")}
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Дополнительно</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {calc.extraItems.length} {calc.extraItems.length === 1 ? "позиция" : "позиций"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="font-bold text-sm" style={{ color: brandColor }}>
                        {formatPrice(extrasSubtotal)}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 text-gray-400 transition-transform"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-gray-50/70 px-4 pb-3 space-y-1.5">
                      {calc.extraItems.map((item, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-start text-xs text-gray-600 py-0.5"
                        >
                          <div className="leading-tight">
                            <span className="text-gray-700">{item.itemName}</span>
                            <span className="text-gray-400 ml-1.5">
                              {item.itemCode === "min_order" ? "" : `${item.quantity} ${item.unit} × ${formatPrice(item.unitPrice)}`}
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
            })()}

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
                        {rr.area > 0 && `${rr.area.toFixed(1)} м²`}
                        {rr.items.length > 0 && `${rr.area > 0 ? " · " : ""}${rr.items.length} позиций`}
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
                          className="flex justify-between items-start text-xs text-gray-600 py-1 gap-2"
                        >
                          {item.photoUrl && (
                            <a
                              href={item.photoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 block w-12 h-12 rounded overflow-hidden bg-gray-100 border border-gray-200 hover:border-orange-400 transition-colors"
                              aria-label={`Фото: ${item.itemName}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.photoUrl}
                                alt={item.itemName}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          )}
                          <div className="leading-tight flex-1 min-w-0">
                            <span className="text-gray-700">{item.itemName}</span>
                            <span className="text-gray-400 ml-1.5">
                              {item.itemCode === "min_order" ? "" : `${item.quantity} ${item.unit} × ${formatPrice(item.unitPrice)}`}
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
        {!summary && roomResults.length > 0 && expandedRooms.size === 0 && (
          <p className="text-[11px] text-gray-400 text-center pb-3">
            Нажмите на раздел, чтобы увидеть детальный состав
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

function SummaryTable({
  roomResults,
  extraItems,
  extrasTotal,
  total,
  discountAmount,
  discountPercent,
  labels,
  brandColor,
  formatPrice,
}: {
  roomResults: RoomResult[];
  extraItems: NonNullable<CalculationResult["extraItems"]>;
  extrasTotal: number;
  total: number;
  discountAmount: number;
  discountPercent: number;
  labels: SummaryLabels;
  brandColor: string;
  formatPrice: (n: number) => string;
}) {
  const rows: { title: string; names: string[]; sum: number }[] = roomResults.map((rr) => ({
    title: rr.roomName,
    names: [
      ...rr.items.map((it) => it.itemName),
      // Надбавка за высоту сидит в итоге комнаты, а в позициях её нет —
      // без строки клиент не поймёт, откуда разница.
      ...(rr.heightMultiplied ? [labels.heightExtra] : []),
    ],
    sum: rr.heightMultiplied ? rr.subtotalAfterHeight : rr.subtotal,
  }));
  if (extraItems.length > 0) {
    rows.push({ title: labels.extra, names: extraItems.map((it) => it.itemName), sum: extrasTotal });
  }
  const subtotal = total + discountAmount;

  return (
    <div className="px-2 pt-3 pb-1">
      {/* table-fixed: на ширине iPhone колонки иначе разъезжались за карточку */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          {/* 34%: «Дополнительно» на iPhone должно влезать целиком, не ломаясь посреди слова */}
          <col className="w-[34%]" />
          <col />
          <col className="w-[28%]" />
        </colgroup>
        <thead>
          <tr className="text-white text-[10px] uppercase tracking-wide" style={{ backgroundColor: brandColor }}>
            <th className="text-left font-semibold px-2 py-2.5 rounded-l-lg">{labels.room}</th>
            <th className="text-left font-semibold px-2 py-2.5">{labels.name}</th>
            <th className="text-right font-semibold px-2 py-2.5 rounded-r-lg">{labels.total}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="px-2 py-3 font-semibold text-gray-900 text-[12px] leading-snug break-words border-b border-gray-100">{r.title}</td>
              <td className="px-2 py-3 text-gray-600 text-[13px] leading-snug break-words border-b border-gray-100">
                <ul className="space-y-1">
                  {r.names.map((n, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="shrink-0" style={{ color: brandColor }}>•</span>
                      <span className="min-w-0">{n}</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-2 py-3 text-right font-bold text-[13px] whitespace-nowrap border-b border-gray-100" style={{ color: brandColor }}>
                {formatPrice(r.sum)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {discountAmount > 0 && (
            <>
              <tr>
                <td colSpan={2} className="px-2 pt-3 pb-1 text-right text-gray-500 text-[13px]">{labels.subtotal}</td>
                <td className="px-2 pt-3 pb-1 text-right text-gray-500 text-[13px] whitespace-nowrap">{formatPrice(subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="px-2 py-1 text-right text-emerald-600 text-[13px]">
                  {labels.discount}{discountPercent > 0 ? ` ${discountPercent}%` : ""}
                </td>
                <td className="px-2 py-1 text-right text-emerald-600 text-[13px] whitespace-nowrap">−{formatPrice(discountAmount)}</td>
              </tr>
            </>
          )}
          <tr>
            <td colSpan={2} className="px-2 pt-2 pb-3 text-right font-semibold text-gray-900">{labels.toPay}</td>
            <td className="px-2 pt-2 pb-3 text-right font-bold text-[15px] text-gray-900 whitespace-nowrap">{formatPrice(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
