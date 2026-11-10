import { NextRequest, NextResponse } from "next/server";
import { VTB_ENABLED, reconcileVtbPayments } from "@/lib/vtb";
import { reportError } from "@/lib/report-error";

/**
 * Страховка оплаты картой ВТБ (10.11.2026), каждые 10 минут: заявки ВТБ,
 * которые ещё PENDING, — спросить банк. Нужна, когда мастер закрыл вкладку
 * до возврата на сайт, а callback банка не дошёл. Без VTB_ENABLED — ничего.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!VTB_ENABLED) return NextResponse.json({ skipped: "vtb disabled" });
  try {
    return NextResponse.json(await reconcileVtbPayments());
  } catch (err) {
    reportError(err, "cron/vtb-reconcile", "vtb reconcile failed");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
