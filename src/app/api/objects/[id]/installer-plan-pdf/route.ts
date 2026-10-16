import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import { loadWorkOrderById, buildWorkOrderModel } from "@/lib/work-order-data";
import { renderWorkOrderPdf } from "@/lib/work-order-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/objects/[id]/installer-plan-pdf — план монтажнику файлом для
 * мастера из приложения (16.10.2026): чертежи комнат с софитами, треками,
 * гардинами и профилями стен + «что взять с собой». Тот же документ, что
 * скачивает монтажник по ссылке наряда.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadWorkOrderById(id, scope.masterIds);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const model = await buildWorkOrderModel(obj);
    const buffer = await renderWorkOrderPdf(model);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="plan-montazhniku-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("installer plan pdf error:", error);
    return NextResponse.json({ error: "Не удалось собрать PDF" }, { status: 500 });
  }
}
