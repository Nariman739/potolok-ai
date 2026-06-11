import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FOUNDER_PROMOCODE,
  FOUNDER_DISCOUNT_PRICE,
  FEST_TRIAL_PROMOCODE,
  FEST_TRIAL_MONTHS,
} from "@/lib/payment";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function POST(request: Request) {
  try {
    const me = await requireAuth();

    const rl = await checkRateLimit(`promocode:${me.id}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "Введите промокод" }, { status: 400 });
    }

    // ── FEST2026: 3 месяца Pro бесплатно ──────────────────────────────
    if (code === FEST_TRIAL_PROMOCODE) {
      const master = await prisma.master.findUnique({
        where: { id: me.id },
        select: {
          id: true,
          festPromoActivatedAt: true,
          paidUntil: true,
          subscriptionTier: true,
        },
      });
      if (!master) {
        return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
      }
      if (master.festPromoActivatedAt) {
        return NextResponse.json({ error: "Промокод уже применён" }, { status: 409 });
      }

      const now = new Date();
      const baseDate =
        master.paidUntil && master.paidUntil > now ? master.paidUntil : now;
      const newPaidUntil = addMonths(baseDate, FEST_TRIAL_MONTHS);

      const updated = await prisma.master.update({
        where: { id: master.id },
        data: {
          festPromoActivatedAt: now,
          paidUntil: newPaidUntil,
          subscriptionTier: "PRO",
        },
        select: {
          subscriptionTier: true,
          paidUntil: true,
          festPromoActivatedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        type: "fest_trial",
        subscriptionTier: updated.subscriptionTier,
        paidUntil: updated.paidUntil,
        message: `${FEST_TRIAL_MONTHS} месяца Pro активированы`,
      });
    }

    // ── POTOLOKFEST: Founder bagde + скидка ───────────────────────────
    if (code === FOUNDER_PROMOCODE) {
      const master = await prisma.master.findUnique({
        where: { id: me.id },
        select: { id: true, isFounder: true },
      });
      if (!master) {
        return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
      }
      if (master.isFounder) {
        return NextResponse.json({ error: "Промокод уже применён" }, { status: 409 });
      }

      const updated = await prisma.master.update({
        where: { id: master.id },
        data: {
          isFounder: true,
          founderActivatedAt: new Date(),
          monthlyPrice: FOUNDER_DISCOUNT_PRICE,
        },
        select: {
          isFounder: true,
          monthlyPrice: true,
          founderMonthsPaid: true,
        },
      });

      return NextResponse.json({
        success: true,
        type: "founder",
        isFounder: updated.isFounder,
        monthlyPrice: updated.monthlyPrice,
        founderMonthsPaid: updated.founderMonthsPaid,
      });
    }

    return NextResponse.json({ error: "Промокод не найден" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Promocode apply error:", error);
    return NextResponse.json({ error: "Ошибка применения промокода" }, { status: 500 });
  }
}
