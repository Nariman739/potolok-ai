"use client";

import { VariantCard } from "./variant-card";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw } from "lucide-react";
import type { CalculationResult } from "@/lib/types";

interface CalculationResultsProps {
  result: CalculationResult;
  onSave: () => void;
  onReset: () => void;
}

export function CalculationResults({
  result,
  onSave,
  onReset,
}: CalculationResultsProps) {
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

      <div className="grid gap-4 md:grid-cols-3">
        {result.variants.map((variant) => (
          <VariantCard
            key={variant.type}
            variant={variant}
            totalArea={result.totalArea}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Расчёт предварительный. Точная стоимость определяется после замера.
      </p>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={onSave}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
        >
          <Save className="h-4 w-4 mr-2" />
          Сохранить КП
        </Button>
      </div>
    </div>
  );
}
