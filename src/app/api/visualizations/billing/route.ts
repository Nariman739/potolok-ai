// GET /api/visualizations/billing
// Возвращает текущий биллинг-state текущего мастера: квота, тариф, что показывать в UI.
// Используется для предварительного UI-гейтинга (баннер upsell, бэдж квоты).
// Серверная защита от обхода — в /api/visualizations/[id]/render (там же checkBilling).

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  loadBillingState,
  checkBilling,
  VISUALIZATION_TIER_LIMITS,
  VISUALIZATION_TRIAL_LIMIT,
} from "@/lib/visualization-billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const master = await requireAuth();
  const state = await loadBillingState(master.id);
  if (!state) {
    return NextResponse.json({ error: "Master not found" }, { status: 404 });
  }

  const now = new Date();
  const decision = checkBilling(state, now);

  // Сколько доступно ПРЯМО СЕЙЧАС (а не после следующего рендера).
  const currentAvailable = decision.allowed ? decision.remaining + 1 : 0;

  return NextResponse.json({
    allowed: decision.allowed,
    reason: decision.reason ?? null,
    bucket: decision.bucket,
    remaining: decision.remaining,
    currentAvailable,
    tier: state.subscriptionTier,
    trialRendersUsed: state.trialRendersUsed,
    trialEndAt: state.trialEndAt,
    monthlyUsed: state.visualizationsThisMonth,
    limits: {
      trialLimit: VISUALIZATION_TRIAL_LIMIT,
      monthlyByTier: VISUALIZATION_TIER_LIMITS,
    },
  });
}
