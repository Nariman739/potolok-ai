import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VTB_COMMENT, getOrderStatus, getVtbConfig, notifyVtbRefund, settleVtbPayment } from "@/lib/vtb";
import { reportError } from "@/lib/report-error";

/**
 * Уведомление банка ВТБ (callback): mdOrder, orderNumber, operation, status.
 * Банк его НЕ подписывает (ответ банка 10.11.2026), поэтому параметрам не
 * верим: это только сигнал «проверь заказ». Номер заказа берём из ответа
 * самого банка на getOrderStatusExtended по mdOrder, а зачисление делает
 * settleVtbPayment со сверкой статуса, суммы и валюты.
 *
 * Адрес передаётся в каждом заказе (dynamicCallbackUrl), GET или POST.
 * Ответ 200 — принято; 500 — банк повторит (каждые 30 с, до 6 раз).
 */
export const maxDuration = 25;

async function handle(params: URLSearchParams): Promise<NextResponse> {
  const cfg = getVtbConfig();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 200 });
  const mdOrder = params.get("mdOrder")?.trim();
  const operation = params.get("operation") ?? "";
  if (!mdOrder || mdOrder.length > 64) return NextResponse.json({ ok: false }, { status: 200 });

  try {
    const st = await getOrderStatus(cfg, { orderId: mdOrder });
    const paymentId = st?.orderNumber;
    if (!paymentId) return NextResponse.json({ ok: true });
    const exists = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, select: { comment: true } });
    if (!exists || exists.comment !== VTB_COMMENT) return NextResponse.json({ ok: true });

    if (operation === "refunded" || operation === "reversed") {
      if (st.orderStatus === 3 || st.orderStatus === 4) await notifyVtbRefund(paymentId, operation).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    const r = await settleVtbPayment(paymentId, cfg);
    if (!r.ok && !r.final) console.warn(`vtb callback ${operation}: ${r.reason}`, paymentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError(err, "payment/vtb/callback", `vtb callback ${operation} failed`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const raw = await request.text().catch(() => "");
  const params = new URLSearchParams(url.searchParams);
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) params.set(k, String(v));
    } catch {}
  } else {
    for (const [k, v] of new URLSearchParams(raw)) params.set(k, v);
  }
  return handle(params);
}
