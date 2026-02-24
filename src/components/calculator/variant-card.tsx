"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Variant, VariantType } from "@/lib/types";
import { cn } from "@/lib/utils";

const VARIANT_STYLES: Record<VariantType, { bg: string; border: string; badge: string; accent: string }> = {
  economy: {
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-600",
    accent: "text-green-700",
  },
  standard: {
    bg: "bg-blue-50",
    border: "border-[#1e3a5f]",
    badge: "bg-[#1e3a5f]",
    accent: "text-[#1e3a5f]",
  },
  premium: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    badge: "bg-amber-600",
    accent: "text-amber-700",
  },
};

interface VariantCardProps {
  variant: Variant;
  totalArea: number;
}

export function VariantCard({ variant, totalArea }: VariantCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = VARIANT_STYLES[variant.type];
  const isHit = variant.type === "standard";

  return (
    <Card className={cn("relative transition-all", style.border, isHit && "ring-2 ring-[#1e3a5f]/20 scale-[1.02]")}>
      {isHit && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className={style.badge}>ХИТ</Badge>
        </div>
      )}

      <CardHeader className={cn("pb-3", style.bg)}>
        <CardTitle className={cn("text-lg", style.accent)}>
          {variant.label}
        </CardTitle>
        <div className="space-y-1">
          <p className="text-2xl sm:text-3xl font-bold">{formatPrice(variant.total)}</p>
          <p className="text-sm text-muted-foreground">
            {formatPrice(variant.pricePerM2)}/м²
          </p>
          {variant.minOrderApplied && (
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
            {variant.rooms.map((rv) => (
              <div key={rv.roomId}>
                <p className="font-medium text-sm mb-2">
                  {rv.roomName}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({rv.area.toFixed(1)} м²)
                  </span>
                </p>
                <div className="space-y-1">
                  {rv.items.map((item, i) => (
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
                  {rv.heightMultiplied && (
                    <p className="text-xs text-amber-600 mt-1">
                      × 1.3 (высота &gt; 3м)
                    </p>
                  )}
                </div>
                <div className="flex justify-between text-sm font-medium mt-1 pt-1 border-t border-dashed">
                  <span>Итого {rv.roomName}</span>
                  <span>{formatPrice(rv.subtotalAfterHeight)}</span>
                </div>
              </div>
            ))}

            <Separator />

            <div className="flex justify-between font-bold text-lg">
              <span>ИТОГО</span>
              <span>{formatPrice(variant.total)}</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {totalArea > 0 && `${formatPrice(variant.pricePerM2)} за м²`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
