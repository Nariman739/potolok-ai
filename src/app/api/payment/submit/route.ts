import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { quotePayment, notifyAdminAboutPayment } from "@/lib/payment";
import type { BillingPeriod } from "@/lib/billing";
import type { PaymentMethod } from "@/lib/payment";

/**
 * Заявка на оплату вручную (Kaspi-перевод + скрин чека). Срок и сумма
 * считаются на сервере по периоду — клиенту сумму не доверяем.
 */
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
    const { screenshotUrl, comment, period: rawPeriod, method: rawMethod } = body as {
      screenshotUrl?: string;
      comment?: string;
      period?: string;
      /** transfer — перевёл сам и прислал чек; invoice — просит счёт в Kaspi Pay. */
      method?: string;
    };
    const period: BillingPeriod = rawPeriod === "year" ? "year" : "month";
    const method: PaymentMethod = rawMethod === "invoice" ? "invoice" : "transfer";

    const master = await prisma.master.findUnique({
      where: { id: me.id },
      select: { id: true },
    });
    if (!master) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }

    // Пока стартовая цена — всегда месяц, даже если клиент прислал "year".
    const quote = quotePayment(period);

    const payment = await prisma.pendingPayment.create({
      data: {
        masterId: master.id,
        amount: quote.amount,
        activatedDays: quote.days,
        screenshotUrl: screenshotUrl?.trim() || null,
        comment: (comment ?? "").trim() || null,
      },
      include: { master: true },
    });

    notifyAdminAboutPayment(payment, method).catch((err) => {
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
