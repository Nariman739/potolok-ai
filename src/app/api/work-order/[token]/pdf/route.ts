import { NextResponse } from "next/server";
import { loadWorkOrderByToken, buildWorkOrderModel } from "@/lib/work-order-data";
import { renderWorkOrderPdf } from "@/lib/work-order-pdf";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/work-order/[token]/pdf — наряд монтажнику файлом (16.10.2026).
 * Публичный, как и страница /n/[token]: монтажник открывает ссылку из WhatsApp
 * и скачивает PDF с чертежами, не ставя приложение.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`wo-pdf:${ip}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  const { token } = await params;
  const obj = await loadWorkOrderByToken(token);
  if (!obj) return NextResponse.json({ error: "Наряд не найден" }, { status: 404 });
  try {
    const model = await buildWorkOrderModel(obj);
    const buffer = await renderWorkOrderPdf(model);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="naryad-${token}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("work-order pdf error:", e);
    return NextResponse.json({ error: "Не удалось собрать PDF" }, { status: 500 });
  }
}
