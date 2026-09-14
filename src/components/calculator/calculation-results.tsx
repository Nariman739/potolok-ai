"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, ChevronDown, ChevronUp, Percent, Handshake } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";
import { applyKpAdjustments, type MoneyInput, type MoneyMode } from "@/lib/kp-adjust";

/** Что мастер ввёл внизу расчёта; сервер считает итог сам (kp-adjust-server). */
export interface KpMoneyInputs {
  discount: MoneyInput | null;
  partner: MoneyInput | null;
}

interface CalculationResultsProps {
  result: CalculationResult;
  onSave: (inputs: KpMoneyInputs) => void;
  onReset: () => void;
}

/** Поле «число + переключатель % / ₸» — одно для скидки и посредника. */
function MoneyField({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: { mode: MoneyMode; str: string };
  onChange: (v: { mode: MoneyMode; str: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2 justify-center flex-wrap">
      {icon}
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}:</span>
      <Input
        type="number"
        min="0"
        step="1"
        value={value.str}
        onChange={(e) => onChange({ ...value, str: e.target.value })}
        onFocus={(e) => e.target.select()}
        className="w-28 text-center"
        inputMode="numeric"
        placeholder="0"
      />
      <div className="flex rounded-md border overflow-hidden text-xs">
        {(["percent", "amount"] as MoneyMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...value, mode: m })}
            className={`px-2.5 py-1.5 ${value.mode === m ? "bg-[#1e3a5f] text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {m === "percent" ? "%" : "₸"}
          </button>
        ))}
      </div>
    </div>
  );
}

function toInput(v: { mode: MoneyMode; str: string }): MoneyInput | null {
  const n = parseFloat(v.str.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  // больше 100 в «%» — это сумма, мастер забыл переключить
  return { mode: v.mode === "percent" && n > 100 ? "amount" : v.mode, value: n };
}

export function CalculationResults({
  result,
  onSave,
  onReset,
}: CalculationResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const [discountV, setDiscountV] = useState<{ mode: MoneyMode; str: string }>({ mode: "percent", str: "" });
  const [partnerV, setPartnerV] = useState<{ mode: MoneyMode; str: string }>({ mode: "percent", str: "" });

  // Та же математика, что на сервере: посредник размазан по ценам, скидка от цены клиента.
  const inputs: KpMoneyInputs = { discount: toInput(discountV), partner: toInput(partnerV) };
  const adj = applyKpAdjustments(result, inputs);
  const discountPercent = adj.discount.percent;
  const discountAmount = adj.discount.amount;
  const clientPrice = adj.clientPrice;
  const finalTotal = adj.total;
  const finalPricePerM2 = result.totalArea > 0 ? Math.round(finalTotal / result.totalArea) : 0;
  const discountBlocked = !!inputs.discount && finalTotal <= 0;

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
            {discountAmount > 0 ? (
              <>
                <p className="text-sm text-muted-foreground line-through">
                  {formatPrice(clientPrice)}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-green-700">
                  {formatPrice(finalTotal)}
                </p>
                <p className="text-xs text-green-600">
                  Скидка{discountPercent > 0 ? ` ${discountPercent}%` : ""} = -{formatPrice(discountAmount)}
                </p>
              </>
            ) : (
              <p className="text-2xl sm:text-3xl font-bold">{formatPrice(clientPrice)}</p>
            )}
            {adj.partner.amount > 0 && (
              <p className="text-xs text-violet-700">
                Посреднику{adj.partner.percent ? ` ${adj.partner.percent}%` : ""}: {formatPrice(adj.partner.amount)} · вам остаётся {formatPrice(adj.masterKeeps)}
              </p>
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
              {discountAmount > 0 && (
                <p className="text-xs text-green-600 text-center">
                  Со скидкой{discountPercent > 0 ? ` ${discountPercent}%` : ""} (-{formatPrice(discountAmount)})
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {result.totalArea > 0 && `${formatPrice(finalPricePerM2)} за м²`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Скидка и посредник — каждое в % или суммой ₸ (Нариман 14.09.2026).
          Посредник в КП не виден: наценка размазывается по ценам позиций. */}
      <div className="space-y-2">
        <MoneyField
          icon={<Percent className="h-4 w-4 text-muted-foreground shrink-0" />}
          label="Скидка клиенту"
          value={discountV}
          onChange={setDiscountV}
        />
        <MoneyField
          icon={<Handshake className="h-4 w-4 text-muted-foreground shrink-0" />}
          label="Посреднику"
          value={partnerV}
          onChange={setPartnerV}
        />
        {discountBlocked && (
          <p className="text-xs text-red-600 text-center">Скидка не может быть больше суммы КП</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Расчёт предварительный. Точная стоимость определяется после замера.
      </p>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={() => onSave(inputs)}
          disabled={discountBlocked}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
        >
          <Save className="h-4 w-4 mr-2" />
          Сохранить КП
        </Button>
      </div>
    </div>
  );
}
