import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENTS_OPEN, type BillingPeriod } from "@/lib/billing";
import { currencyFor } from "@/lib/company";
import { cardQuote, getVtbConfig, registerOrder, vtbCommentFor, vtbTestAllowed } from "@/lib/vtb";
import { reportError } from "@/lib/report-error";

/**
 * Шаг 1 оплаты картой ВТБ: заявка в базе + заказ в банке → formUrl, куда
 * браузер мастера уходит платить. Сумму считает сервер (всегда в тенге),
 * номер заказа в банке = id заявки.
 */
export async function POST(request: Request) {
  try {
    const me = await requireAuth();
    const cfg = getVtbConfig();
    if (!cfg || !PAYMENTS_OPEN) {
      return NextResponse.json({ error: "Оплата картой пока не подключена" }, { status: 503 });
    }
    // Песочница — только QA: тестовая оплата не должна быть доступна мастерам (аудит А7)
    if (cfg.test && !vtbTestAllowed(me)) {
      return NextResponse.json({ error: "Оплата картой пока не подключена" }, { status: 503 });
    }
    if (me.isOwner) {
      return NextResponse.json({ error: "Владельцу платить не нужно" }, { status: 400 });
    }

    const rl = await checkRateLimit(`vtb-create:${me.id}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const period: BillingPeriod = (body as { period?: string }).period === "year" ? "year" : "month";
    const quote = cardQuote(period, await currencyFor(me.id).catch(() => "KZT" as const));

    const payment = await prisma.pendingPayment.create({
      data: {
        masterId: me.id,
        amount: quote.amountKzt,
        currency: "KZT",
        activatedDays: quote.days,
        comment: vtbCommentFor(cfg),
      },
    });

    const origin = new URL(request.url).origin;
    try {
      const order = await registerOrder(cfg, {
        orderNumber: payment.id,
        amountKzt: quote.amountKzt,
        returnUrl: `${origin}/pricing?vtb=${payment.id}`,
        description: `PotolokAI PRO на ${quote.days >= 365 ? "год" : "месяц"}`,
        clientId: me.id,
        // Банк шлёт уведомления только на https (порт 443).
        callbackUrl: origin.startsWith("https://") ? `${origin}/api/payment/vtb/callback` : null,
      });
      return NextResponse.json({ paymentId: payment.id, formUrl: order.formUrl, amount: quote.amountKzt, days: quote.days });
    } catch (err) {
      // Заказ в банке не создан — заявку закрываем, чтобы она не висела «не оплачена».
      await prisma.pendingPayment
        .update({ where: { id: payment.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: "vtb", reviewNotes: "ВТБ: заказ не создан" } })
        .catch(() => {});
      throw err;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    reportError(error, "payment/vtb/create", "vtb create error");
    return NextResponse.json({ error: "Не удалось начать оплату" }, { status: 500 });
  }
}
