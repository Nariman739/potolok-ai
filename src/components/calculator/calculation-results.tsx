"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, ChevronDown, ChevronUp, Percent } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";

interface CalculationResultsProps {
  result: CalculationResult;
  onSave: (discountPercent: number) => void;
  onReset: () => void;
}

export function CalculationResults({
  result,
  onSave,
  onReset,
}: CalculationResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const [discountStr, setDiscountStr] = useState("0");

  const discountPercent = Math.min(100, Math.max(0, parseFloat(discountStr) || 0));
  const discountAmount = Math.round(result.total * discountPercent / 100);
  const finalTotal = result.total - discountAmount;
  const finalPricePerM2 = result.totalArea > 0 ? Math.round(finalTotal / result.totalArea) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Результат расчёта</h2>
          <p className="text-sm text-muted-foreground">
            {result.totalArea.toFixed(1)} м² | {result.totalSpots} спотов | {result.totalChandeliers} люстр
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Заново
        </Button>
      </div>

      <Card className="border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20">
        <CardHeader className="bg-blue-50 pb-3">
          <CardTitle className="text-[#1e3a5f] text-lg">Итого</CardTitle>
          <div className="space-y-1">
            {discountPercent > 0 ? (
              <>
                <p className="text-sm text-muted-foreground line-through">
                  {formatPrice(result.total)}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-green-700">
                  {formatPrice(finalTotal)}
                </p>
                <p className="text-xs text-green-600">
                  Скидка {discountPercent}% = -{formatPrice(discountAmount)}
                </p>
              </>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold">{formatPrice(result.total)}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {formatPrice(finalPricePerM2)}/м²
            </p>
            {result.minOrderApplied && (
              <p className="text-xs text-amber-600">
                Применён минимальный заказ
              </p>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Скрыть детали
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Показать детали
              </>
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-4">
              {result.roomResults.map((rr) => (
                <div key={rr.roomId}>
                  <p className="font-medium text-sm mb-2">
                    {rr.roomName}
                    <span className="text-muted-foreground font-normal ml-1">
                      ({rr.area.toFixed(1)} м²)
                    </span>
                  </p>
                  <div className="space-y-1">
                    {rr.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs text-muted-foreground gap-2"
                      >
                        <span className="min-w-0 break-words">
                          {item.itemName} ({item.quantity} {item.unit} × {formatPrice(item.unitPrice)})
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap shrink-0">
                          {formatPrice(item.total)}
                        </span>
                      </div>
                    ))}
                    {rr.heightMultiplied && (
                      <p className="text-xs text-amber-600 mt-1">
                        × 1.3 (высота &gt; 3м)
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between text-sm font-medium mt-1 pt-1 border-t border-dashed">
                    <span>Итого {rr.roomName}</span>
                    <span>{formatPrice(rr.subtotalAfterHeight)}</span>
                  </div>
                </div>
              ))}

              {/* Дополнительные работы вне комнат */}
              {result.extraItems && result.extraItems.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Дополнительно</p>
                  <div className="space-y-1">
                    {result.extraItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs text-muted-foreground gap-2"
                      >
                        <span className="min-w-0 break-words">
                          {item.itemName} ({item.quantity} {item.unit} × {formatPrice(item.unitPrice)})
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap shrink-0">
                          {formatPrice(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-medium mt-1 pt-1 border-t border-dashed">
                    <span>Итого «Дополнительно»</span>
                    <span>
                      {formatPrice(result.extraItems.reduce((s, it) => s + it.total, 0))}
                    </span>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex justify-between font-bold text-lg">
                <span>ИТОГО</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>
              {discountPercent > 0 && (
                <p className="text-xs text-green-600 text-center">
                  Со скидкой {discountPercent}% (-{formatPrice(discountAmount)})
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {result.totalArea > 0 && `${formatPrice(finalPricePerM2)} за м²`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discount input */}
      <div className="flex items-center gap-3 justify-center">
        <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground whitespace-nowrap">Скидка клиенту:</span>
        <Input
          type="number"
          min="0"
          max="100"
          step="1"
          value={discountStr}
          onChange={(e) => setDiscountStr(e.target.value)}
          onFocus={(e) => { if (e.target.value === "0") setDiscountStr(""); }}
          onBlur={(e) => { if (e.target.value === "") setDiscountStr("0"); }}
          className="w-20 text-center"
          inputMode="numeric"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Расчёт предварительный. Точная стоимость определяется после замера.
      </p>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={() => onSave(discountPercent)}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
        >
          <Save className="h-4 w-4 mr-2" />
          Сохранить КП
        </Button>
      </div>
    </div>
  );
}
