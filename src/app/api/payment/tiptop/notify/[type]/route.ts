import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import {
  checkNotification,
  failNotification,
  parseNotificationBody,
  payNotification,
  verifyNotificationHmac,
} from "@/lib/tiptop";

/**
 * Уведомления TipTop Pay. Адреса задаются в ЛК (Сайты → potolok.ai →
 * Уведомления), метод POST:
 *   Check → https://potolok.ai/api/payment/tiptop/notify/check
 *   Pay   → https://potolok.ai/api/payment/tiptop/notify/pay
 *   Fail  → https://potolok.ai/api/payment/tiptop/notify/fail
 * Подпись: заголовок Content-HMAC = base64(HMAC-SHA256(тело, ApiSecret)).
 * Ответ всегда JSON {"code": N}; для Pay/Fail TipTop принимает только 0.
 * На ошибку/не-0 он повторяет до 100 раз (1, 2, 5, 10, 30 мин), таймаут 30 с.
 */
export const maxDuration = 25;

export async function POST(request: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  const raw = await request.text();

  if (!verifyNotificationHmac(raw, request.headers.get("content-hmac"))) {
    console.warn(`tiptop notify/${type}: bad HMAC`);
    return NextResponse.json({ code: 13 }, { status: 401 });
  }

  let fields: Record<string, string>;
  try {
    fields = parseNotificationBody(raw, request.headers.get("content-type"));
  } catch {
    return NextResponse.json({ code: 13 }, { status: 400 });
  }

  try {
    switch (type) {
      case "check":
        return NextResponse.json(await checkNotification(fields));
      case "pay":
        return NextResponse.json(await payNotification(fields));
      case "fail":
        return NextResponse.json(await failNotification(fields));
      default:
        // Confirm/Refund/Cancel/Recurrent пока не используем — подтверждаем приём.
        return NextResponse.json({ code: 0 });
    }
  } catch (err) {
    reportError(err, "payment/tiptop/notify/[type]", "tiptop notify/${type} failed");
    // 500 → TipTop повторит позже; для Pay это то, что нужно (не потерять оплату).
    return NextResponse.json({ code: 13 }, { status: 500 });
  }
}
