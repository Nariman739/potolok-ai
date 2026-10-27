import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { quotePayment } from "@/lib/payment";
import { PAYMENTS_OPEN, type BillingPeriod } from "@/lib/billing";
import { getTiptopConfig } from "@/lib/tiptop";
import { reportError } from "@/lib/report-error";
import { currencyFor } from "@/lib/company";

/**
 * Шаг 1 оплаты картой: заявка в базе + данные для виджета TipTop.
 * Сумму считает сервер; id заявки уходит в виджет как externalId и
 * возвращается в уведомлениях как InvoiceId.
 */
export async function POST(request: Request) {
  try {
    const me = await requireAuth();
    const cfg = getTiptopConfig();
    if (!cfg || !PAYMENTS_OPEN) {
      return NextResponse.json({ error: "Оплата картой пока не подключена" }, { status: 503 });
    }
    if (me.isOwner) {
      return NextResponse.json({ error: "Владельцу платить не нужно" }, { status: 400 });
    }

    const rl = await checkRateLimit(`tiptop-create:${me.id}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }

    // Российские карты через TipTop (CloudPayments KZ) не проходят — Максим
    // MAGIC (СПб) 26.10: PENDING и отказ банка. Рублёвым — только перевод.
    if ((await currencyFor(me.id)) === "RUB") {
      return NextResponse.json(
        { error: "Карты банков России через нашу платёжку не проходят. Оплатите переводом из России — инструкция ниже." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const period: BillingPeriod = (body as { period?: string }).period === "year" ? "year" : "month";
    const quote = quotePayment(period);

    const payment = await prisma.pendingPayment.create({
      data: {
        masterId: me.id,
        amount: quote.amount,
        activatedDays: quote.days,
        comment: "Оплата картой (TipTop)",
      },
    });

    return NextResponse.json({
      paymentId: payment.id,
      amount: quote.amount,
      days: quote.days,
      description: `PotolokAI PRO на ${quote.days >= 365 ? "год" : "месяц"}`,
      publicId: cfg.publicId,
      accountId: me.id,
      email: me.email ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    reportError(error, "payment/tiptop/create", "tiptop create error");
    return NextResponse.json({ error: "Не удалось начать оплату" }, { status: 500 });
  }
}
