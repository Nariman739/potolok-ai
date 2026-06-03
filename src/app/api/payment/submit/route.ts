import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FOUNDER_PROMOCODE,
  getMasterPriceForNextPayment,
  notifyAdminAboutPayment,
} from "@/lib/payment";

export async function POST(request: Request) {
  try {
    const me = await requireAuth();

    const rl = await checkRateLimit(`payment-submit:${me.id}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много заявок. Попробуйте позже." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { screenshotUrl, comment, promocode } = body as {
      screenshotUrl?: string;
      comment?: string;
      promocode?: string;
    };

    const master = await prisma.master.findUnique({
      where: { id: me.id },
      select: {
        id: true,
        monthlyPrice: true,
        isFounder: true,
        founderMonthsPaid: true,
      },
    });
    if (!master) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }

    const promocodeNormalized = (promocode ?? "").trim().toUpperCase();
    const isFestPromo = promocodeNormalized === FOUNDER_PROMOCODE;

    const amount = getMasterPriceForNextPayment(master);

    const payment = await prisma.pendingPayment.create({
      data: {
        masterId: master.id,
        amount,
        promocode: isFestPromo ? FOUNDER_PROMOCODE : (promocodeNormalized || null),
        screenshotUrl: screenshotUrl?.trim() || null,
        comment: (comment ?? "").trim() || null,
      },
      include: { master: true },
    });

    notifyAdminAboutPayment(payment).catch((err) => {
      console.error("notifyAdminAboutPayment failed:", err);
    });

    return NextResponse.json({
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Payment submit error:", error);
    return NextResponse.json({ error: "Ошибка отправки заявки" }, { status: 500 });
  }
}
