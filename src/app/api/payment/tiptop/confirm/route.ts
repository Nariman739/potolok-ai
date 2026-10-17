import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findTransactionByInvoice, getTransaction, settleTransaction } from "@/lib/tiptop";
import { reportError } from "@/lib/report-error";

/**
 * Шаг 2 оплаты картой: виджет сказал «успех» — сервер сам проверяет у TipTop
 * статус транзакции и включает PRO. Клиенту не верим: только то, что
 * подтвердил TipTop по API. Идемпотентно с уведомлением Pay.
 */
export async function POST(request: Request) {
  try {
    const me = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { paymentId?: string; transactionId?: number | string };
    const paymentId = body.paymentId?.trim();
    if (!paymentId) return NextResponse.json({ error: "Нет paymentId" }, { status: 400 });

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: paymentId },
      include: { master: { select: { paidUntil: true } } },
    });
    if (!payment || payment.masterId !== me.id) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }
    if (payment.status === "APPROVED") {
      return NextResponse.json({ ok: true, status: "APPROVED", paidUntil: payment.master.paidUntil });
    }

    const txId = Number(body.transactionId);
    const tx = Number.isFinite(txId) && txId > 0
      ? await getTransaction(txId)
      : await findTransactionByInvoice(paymentId);
    if (!tx) {
      return NextResponse.json({ ok: false, status: "PENDING", error: "TipTop ещё не подтвердил оплату. Если деньги списались — PRO включится в течение нескольких минут." });
    }
    if (tx.InvoiceId !== paymentId) {
      return NextResponse.json({ error: "Транзакция от другой заявки" }, { status: 400 });
    }

    const r = await settleTransaction(tx);
    if (!r.ok) {
      return NextResponse.json({ ok: false, status: payment.status, error: `Оплата не подтверждена: ${r.reason}` });
    }
    return NextResponse.json({ ok: true, status: "APPROVED", paidUntil: r.paidUntil });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    reportError(error, "payment/tiptop/confirm", "tiptop confirm error");
    return NextResponse.json({ error: "Не удалось проверить оплату" }, { status: 500 });
  }
}
