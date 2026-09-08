"use client";

import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILLING_ENABLED_CLIENT } from "@/lib/billing";
import type { BillingInfo } from "@/hooks/use-billing";

interface UpsellBannerProps {
  billing: BillingInfo;
}

export function UpsellBanner({ billing }: UpsellBannerProps) {
  if (billing.allowed) return null;
  if (billing.tier === "PROPLUS") return null;

  // Пока сервис бесплатный, апселла на тариф нет — только честное объяснение,
  // что AI-рендеры лимитированы (они стоят нам реальных денег).
  if (!BILLING_ENABLED_CLIENT) {
    return (
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200/60">
            <Sparkles className="h-5 w-5 text-amber-700" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-amber-900">
              AI-рендеры на сегодня закончились
            </h3>
            <p className="text-sm text-amber-800">
              Лимит обновится в начале месяца. Нужно больше прямо сейчас —
              напишите нам, добавим.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isProUpgrade = billing.tier === "PRO";
  const headline = isProUpgrade
    ? "Месячный лимит PRO исчерпан"
    : billing.reason === "trial_exhausted_and_monthly_used"
      ? "Триал и месячный лимит исчерпаны"
      : "AI-визуализация — функция PRO";

  const sub = isProUpgrade
    ? "Перейдите на PRO+ за ~10 000 ₸/мес — 100 рендеров в месяц и приоритет в очереди."
    : "Закрывайте больше сделок прямо на замере. PRO за ~5 000 ₸/мес — 30 AI-рендеров в месяц.";

  const ctaLabel = isProUpgrade ? "Перейти на PRO+" : "Открыть PRO";

  return (
    <div className="rounded-xl border border-amber-300/50 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200/60">
          <Sparkles className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-base font-semibold text-amber-900">{headline}</h3>
          <p className="text-sm text-amber-800">{sub}</p>
          <ul className="space-y-1 text-sm text-amber-800">
            <li className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Фотореалистичные AI-рендеры из 3D-конструктора
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Тёплый / нейтральный / холодный свет — клиент выбирает
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Шеринг клиенту по ссылке + интеграция с КП
            </li>
          </ul>
          <div className="pt-2">
            <Button asChild className="bg-amber-600 hover:bg-amber-700">
              <Link href="/pricing">{ctaLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
