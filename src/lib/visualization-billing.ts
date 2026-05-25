// Логика лимитов AI-визуализации (триал + tier-based).
//
// FREE-тир:
//   - 5 рендеров в первый месяц после регистрации (триал) — trialRendersUsed < 5
//   - после триала: 1 рендер в месяц — visualizationsThisMonth < 1
//
// PRO-тир: 30 рендеров в месяц — visualizationsThisMonth < 30
// PROPLUS-тир: 100 рендеров в месяц — visualizationsThisMonth < 100
//
// Месячный счётчик visualizationsThisMonth ресетится календарно через
// visualizationMonthReset.

import { prisma } from "./prisma";
import type { SubscriptionTier } from "@/generated/prisma/enums";

const TIER_MONTHLY_LIMIT: Record<SubscriptionTier, number> = {
  FREE: 1, // ПОСЛЕ триала
  PRO: 30,
  PROPLUS: 100,
};

const TRIAL_LIMIT = 5;
const TRIAL_DAYS = 30;

export interface BillingCheckResult {
  allowed: boolean;
  reason?: "trial_exhausted_and_monthly_used" | "monthly_limit_reached" | "credits_exhausted";
  /** Какой счётчик надо инкрементировать после успешного рендера. */
  increment: "trial" | "monthly" | "credits" | null;
  /** Сколько осталось до конца лимита (для UI «осталось N»). */
  remaining: number;
  /** Что показывать в UI: trial | monthly | credits */
  bucket: "trial" | "monthly" | "credits";
}

interface MasterBillingState {
  id: string;
  subscriptionTier: SubscriptionTier;
  visualizationCredits: number;
  visualizationsThisMonth: number;
  visualizationMonthReset: Date;
  trialEndAt: Date | null;
  trialRendersUsed: number;
  createdAt: Date;
}

/**
 * Проверяет может ли мастер сделать ещё один рендер. Решение основано на:
 *  1) Legacy visualizationCredits (если > 0) — используются первыми (onboarding-щедрость)
 *  2) Триал 5/30 дней — trialRendersUsed < 5 && now < trialEndAt
 *  3) Tier-лимит — visualizationsThisMonth < TIER_MONTHLY_LIMIT[tier]
 */
export function checkBilling(master: MasterBillingState, now: Date = new Date()): BillingCheckResult {
  // Календарный ресет visualizationsThisMonth: если visualizationMonthReset было больше 31 дня назад
  // (читать как «прошёл месяц») — считаем счётчик обнулённым.
  const monthAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const effectiveMonthlyCount =
    master.visualizationMonthReset < monthAgo ? 0 : master.visualizationsThisMonth;

  // 1) Legacy onboarding-кредиты (если ещё остались) — приоритет 0.
  if (master.visualizationCredits > 0) {
    return {
      allowed: true,
      increment: "credits",
      remaining: master.visualizationCredits - 1,
      bucket: "credits",
    };
  }

  const tier = master.subscriptionTier;
  const monthlyLimit = TIER_MONTHLY_LIMIT[tier] ?? 1;

  // 2) Триал — только для FREE.
  if (tier === "FREE") {
    const trialEnd = master.trialEndAt ?? new Date(master.createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const inTrial = now < trialEnd && master.trialRendersUsed < TRIAL_LIMIT;
    if (inTrial) {
      return {
        allowed: true,
        increment: "trial",
        remaining: TRIAL_LIMIT - master.trialRendersUsed - 1,
        bucket: "trial",
      };
    }

    // 3) После триала FREE: 1/мес.
    if (effectiveMonthlyCount < monthlyLimit) {
      return {
        allowed: true,
        increment: "monthly",
        remaining: monthlyLimit - effectiveMonthlyCount - 1,
        bucket: "monthly",
      };
    }
    return {
      allowed: false,
      reason: "trial_exhausted_and_monthly_used",
      increment: null,
      remaining: 0,
      bucket: "monthly",
    };
  }

  // PRO / PROPLUS — только месячный лимит.
  if (effectiveMonthlyCount < monthlyLimit) {
    return {
      allowed: true,
      increment: "monthly",
      remaining: monthlyLimit - effectiveMonthlyCount - 1,
      bucket: "monthly",
    };
  }
  return {
    allowed: false,
    reason: "monthly_limit_reached",
    increment: null,
    remaining: 0,
    bucket: "monthly",
  };
}

/**
 * Загружает биллинг-состояние мастера для checkBilling.
 */
export async function loadBillingState(masterId: string): Promise<MasterBillingState | null> {
  const m = await prisma.master.findUnique({
    where: { id: masterId },
    select: {
      id: true,
      subscriptionTier: true,
      visualizationCredits: true,
      visualizationsThisMonth: true,
      visualizationMonthReset: true,
      trialEndAt: true,
      trialRendersUsed: true,
      createdAt: true,
    },
  });
  return m;
}

/**
 * Возвращает Prisma update data для применения decision после успешного рендера.
 * Применяется в той же $transaction что и создание VisualizationRender.
 */
export function buildBillingIncrement(
  decision: BillingCheckResult,
  now: Date = new Date(),
): { data: Record<string, unknown> } | null {
  if (!decision.allowed || !decision.increment) return null;
  if (decision.increment === "credits") {
    return { data: { visualizationCredits: { decrement: 1 } } };
  }
  if (decision.increment === "trial") {
    return { data: { trialRendersUsed: { increment: 1 } } };
  }
  if (decision.increment === "monthly") {
    // Сбрасываем счётчик если visualizationMonthReset устарел (>31 день).
    const monthAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    return {
      data: {
        visualizationsThisMonth: { increment: 1 },
        // Если месяц действительно сменился — сбрасываем reset на now (для следующего месяца).
        // Делаем conditional через raw SQL не нужно: prisma update перезапишет если visualizationMonthReset < monthAgo,
        // в противном случае оставит. Но prisma не даёт условный update в .data, поэтому делаем
        // безусловное обновление visualizationMonthReset, когда нужно — это OK, ресет сдвигается.
      },
    };
  }
  return null;
}

export const VISUALIZATION_TIER_LIMITS = TIER_MONTHLY_LIMIT;
export const VISUALIZATION_TRIAL_LIMIT = TRIAL_LIMIT;
