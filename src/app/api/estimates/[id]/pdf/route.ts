import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // Доступ — по компании, как и у остальных действий с КП: владелец скачивает КП
    // ушедшего сотрудника, а сам ушедший — уже нет.
    const allowed = await prisma.estimate.findFirst({ where: { id, ...inScope(scope), deletedAt: null }, select: { id: true } });
    if (!allowed) return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });

    // Собираем все нужные данные одним вызовом — мастер, портфолио, отзывы,
    // тема, шрифты, QR-код. Внутри проверяется что КП принадлежит мастеру.
    const t0 = Date.now();
    const data = await buildPdfData(id);
    const tData = Date.now() - t0;

    // Если КП был создан как «быстрый» (мастер пометил calc.quickEstimate
    // в /dashboard/quick-estimate или через assistant) — рендерим 1 страницу.
    if (data.estimate.isQuick) {
      data.config = { ...data.config, format: "quick" };
    }

    const t1 = Date.now();
    const buffer = await renderToBuffer(KpDocument({ data }));
    // Тайминги в логи Vercel — чтобы «КП долго открывается» разбирать по цифрам
    console.log(`[kp pdf] ${id.slice(0, 8)} data=${tData}ms render=${Date.now() - t1}ms size=${Math.round(buffer.length / 1024)}KB rooms=${data.estimate.rooms.length} gallery=${data.gallery.length}`);

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
