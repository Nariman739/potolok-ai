import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { VTB_COMMENT, settleVtbPayment } from "@/lib/vtb";
import { reportError } from "@/lib/report-error";

/**
 * Шаг 2: мастер вернулся из банка на /pricing?vtb=<id>. Сервер сам
 * спрашивает банк о заказе и, если он оплачен, включает PRO. Клиенту не
 * верим; идемпотентно с callback и кроном.
 */
export async function POST(request: Request) {
  try {
    const me = await requireAuth();
    const rl = await checkRateLimit(`vtb-confirm:${me.id}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }
    const body = (await request.json().catch(() => ({}))) as { paymentId?: string };
    const paymentId = body.paymentId?.trim();
    if (!paymentId) return NextResponse.json({ error: "Нет paymentId" }, { status: 400 });

    const payment = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, select: { masterId: true, comment: true } });
    if (!payment || payment.masterId !== me.id || payment.comment !== VTB_COMMENT) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const r = await settleVtbPayment(paymentId);
    if (r.ok) return NextResponse.json({ ok: true, status: "APPROVED", paidUntil: r.paidUntil });
    return NextResponse.json({ ok: false, status: r.final || r.declined ? "FAILED" : "PENDING", reason: r.reason });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    reportError(error, "payment/vtb/confirm", "vtb confirm error");
    return NextResponse.json({ error: "Не удалось проверить оплату" }, { status: 500 });
  }
}
