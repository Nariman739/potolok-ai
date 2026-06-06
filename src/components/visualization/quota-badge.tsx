"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BillingInfo } from "@/hooks/use-billing";

interface QuotaBadgeProps {
  billing: BillingInfo;
}

export function QuotaBadge({ billing }: QuotaBadgeProps) {
  if (!billing.allowed) {
    return (
      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
        <Sparkles className="mr-1 h-3 w-3" />
        Квота исчерпана
      </Badge>
    );
  }

  const tierLabel = billing.tier === "FREE" ? "FREE" : billing.tier === "PRO" ? "PRO" : "PRO+";
  const bucketLabel =
    billing.bucket === "trial"
      ? "в триале"
      : billing.bucket === "credits"
        ? "бонусных"
        : "в этом месяце";

  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
      <Sparkles className="mr-1 h-3 w-3" />
      {tierLabel} · осталось {billing.currentAvailable} {bucketLabel}
    </Badge>
  );
}
