"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "kp-branding-banner-dismissed-v1";

// One-time анонс-баннер на dashboard про новый KP-конструктор.
// Показываем существующим мастерам, у которых ещё нет MasterBrief
// (т.е. они не проходили онбординг и могут не знать про новую фичу).
// Dismiss сохраняется в localStorage — баннер больше не появится у этого
// мастера на этом устройстве. Если очистил localStorage — увидит снова,
// это нормально (новый интерес = новый показ).
export function KpBrandingBanner({ hasKpBrief }: { hasKpBrief: boolean }) {
  const [dismissed, setDismissed] = useState(true); // SSR-safe: скрыт до hydration

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (hasKpBrief || dismissed) return null;

  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <Card className="relative border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-transparent overflow-hidden">
      <button
        onClick={onDismiss}
        aria-label="Скрыть"
        className="absolute top-2 right-2 p-1.5 rounded-md text-orange-700/60 hover:text-orange-700 hover:bg-orange-100 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="p-4 pr-10 flex items-start gap-3">
        <div className="rounded-lg bg-orange-500 p-2 flex-shrink-0">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-orange-900">
            Новинка: настрой свой дизайн КП
          </p>
          <p className="text-xs text-orange-800/80 mt-1 leading-snug">
            5 готовых стилей PDF, AI подберёт под твой бренд. Клиент сразу
            увидит — это не «потолок.ai», это твоя компания.
          </p>
          <Link
            href="/dashboard/branding"
            className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors"
          >
            Настроить за 2 минуты →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
