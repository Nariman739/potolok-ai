import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SubscriptionTier } from "@/generated/prisma/client";

const ALLOWED_TIERS = ["FREE", "PRO", "PROPLUS"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireAuth();
    const owner = await prisma.master.findUnique({
      where: { id: me.id },
      select: { isOwner: true },
    });
    if (!owner?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { tier, paidUntil, billingNotes, resetCounter } = body;

    if (!(ALLOWED_TIERS as readonly string[]).includes(tier)) {
      return NextResponse.json({ error: "Неверный тариф" }, { status: 400 });
    }

    const target = await prisma.master.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }

    const data: {
      subscriptionTier: SubscriptionTier;
      paidUntil: Date | null;
      billingNotes: string | null;
      kpGeneratedThisMonth?: number;
      kpMonthReset?: Date;
    } = {
      subscriptionTier: tier as SubscriptionTier,
      paidUntil: paidUntil ? new Date(paidUntil) : null,
      billingNotes: billingNotes || null,
    };
    if (resetCounter) {
      data.kpGeneratedThisMonth = 0;
      data.kpMonthReset = new Date();
    }

    await prisma.master.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Admin tier update error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления" },
      { status: 500 },
    );
  }
}
