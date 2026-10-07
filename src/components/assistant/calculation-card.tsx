"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { formatArea } from "@/lib/format";
import { useCurrency } from "@/components/currency-provider";
import type { CalculationResult } from "@/lib/types";

interface CalculationCardProps {
  result: CalculationResult;
  onSaveKp?: () => void;
}

export function CalculationCard({ result, onSaveKp }: CalculationCardProps) {
  const { format: formatPrice } = useCurrency(); // валюта мастера (07.10.2026)
  return (
    <Card className="border-[#1e3a5f]/20">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Расчёт: {formatArea(result.totalArea)}</p>
          <Badge variant="secondary" className="text-xs">
            {result.rooms.length} {result.rooms.length === 1 ? "комната" : "комнат"}
          </Badge>
        </div>

        {/* Single total */}
        <div className="rounded-lg p-3 bg-blue-50 ring-2 ring-[#1e3a5f]/20">
          <span className="text-xs font-semibold text-[#1e3a5f]">Итого</span>
          <p className="text-lg font-bold mt-1">{formatPrice(result.total)}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatPrice(result.pricePerM2)}/м²
          </p>
          {result.minOrderApplied && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              Применён мин. заказ
            </p>
          )}
        </div>

        {onSaveKp && (
          <Button
            size="sm"
            className="w-full bg-[#1e3a5f] hover:bg-[#152d4a]"
            onClick={onSaveKp}
          >
            <Save className="h-4 w-4 mr-2" />
            Сохранить КП
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
