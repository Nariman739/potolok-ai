import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { FOUNDER_PROMOCODE, FOUNDER_DISCOUNT_PRICE } from "@/lib/payment";

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

    if (code !== FOUNDER_PROMOCODE) {
      return NextResponse.json({ error: "Промокод не найден" }, { status: 404 });
    }

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
      isFounder: updated.isFounder,
      monthlyPrice: updated.monthlyPrice,
      founderMonthsPaid: updated.founderMonthsPaid,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Promocode apply error:", error);
    return NextResponse.json({ error: "Ошибка применения промокода" }, { status: 500 });
  }
}
