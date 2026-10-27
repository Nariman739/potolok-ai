import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScope, inScope } from "@/lib/company";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildPdfData } from "@/lib/kp/pdf-data";
import { reportError } from "@/lib/report-error";
import { fileDate, pdfDisposition, prettyPdfName } from "@/lib/content-disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/estimates/[id]/pdf
// Возвращает PDF КП через новый @react-pdf-шаблон с темой мастера.
// Тема и тексты берутся из master.kpConfig (заполняется в /dashboard/branding).
// Если calc.quickEstimate === true — рендерим одностраничный Quick КП.
//
// (Старая pdfkit-реализация заменена. Логика 5 тем, AI-помощника, конструктора
// см. в `src/lib/kp/`.)

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    // Собираем все нужные данные одним вызовом — мастер, портфолио, отзывы,
    // тема, шрифты, QR-код. Внутри проверяется что КП принадлежит мастеру.
    const data = await buildPdfData(id, scope.masterIds);

    // Если КП был создан как «быстрый» (мастер пометил calc.quickEstimate
    // в /dashboard/quick-estimate или через assistant) — рендерим 1 страницу.
    if (data.estimate.isQuick) {
      data.config = { ...data.config, format: "quick" };
    }

    const buffer = await renderToBuffer(KpDocument({ data }));

    const filename = sanitizeFilename(
      `KP-${data.master.companyName}-${data.estimate.clientName || data.estimate.id.slice(0, 8)}.pdf`
    );
    // По-русски для мобилки и браузера: «КП — Асель — ул. Абая 120 — 27.10.2026.pdf»
    const pretty = prettyPdfName(["КП", data.estimate.clientNameRaw, data.estimate.clientAddress, fileDate()]);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition("inline", pretty, filename),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const e = err as Error;
    if (e.message === "Estimate not found") {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }
    reportError(e, "estimates/[id]/pdf", "[estimates/[id]/pdf] error");
    return NextResponse.json(
      {
        error: e.message || "Failed to generate PDF",
        stack:
          process.env.NODE_ENV === "production"
            ? undefined
            : e.stack?.split("\n").slice(0, 8),
      },
      { status: 500 }
    );
  }
}
