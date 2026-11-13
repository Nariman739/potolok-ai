import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrderStatus, getVtbConfig, isVtbComment, notifyVtbRefund, settleVtbPayment } from "@/lib/vtb";
import { checkRateLimit } from "@/lib/rate-limit";
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

/** Заявки старше 2 суток callback не трогает: крон их уже закрыл, ручные решения — у Наримана. */
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

async function handle(request: Request, params: URLSearchParams): Promise<NextResponse> {
  const cfg = getVtbConfig();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 200 });
  const mdOrder = params.get("mdOrder")?.trim();
  const operation = params.get("operation") ?? "";
  if (!mdOrder || mdOrder.length > 64) return NextResponse.json({ ok: false }, { status: 200 });

  // Лимит частоты (аудит В4): адрес публичный и без подписи — не даём гонять нас
  // в банк. По IP — 429; по заказу — тихо 200 (банк повторяет 6 раз по 30 с,
  // в 10 за 10 минут укладывается; дальше заказ дозакроет крон).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`vtb-cb-ip:${ip}`, 60, 60 * 1000)).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  if (!(await checkRateLimit(`vtb-cb-order:${mdOrder}`, 10, 10 * 60 * 1000)).allowed) {
    return NextResponse.json({ ok: true });
  }

  try {
    const st = await getOrderStatus(cfg, { orderId: mdOrder });
    const paymentId = st?.orderNumber;
    if (!paymentId) return NextResponse.json({ ok: true });
    const exists = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, select: { comment: true, createdAt: true } });
    if (!exists || !isVtbComment(exists.comment)) return NextResponse.json({ ok: true });
    if (Date.now() - exists.createdAt.getTime() > MAX_AGE_MS && operation !== "refunded" && operation !== "reversed") {
      return NextResponse.json({ ok: true });
    }

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
  return handle(request, new URL(request.url).searchParams);
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
  return handle(request, params);
}
