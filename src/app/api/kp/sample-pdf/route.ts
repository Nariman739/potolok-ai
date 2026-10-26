import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { ALL_TEMPLATES } from "@/lib/kp/themes";
import type { KpFormat, KpTemplateId } from "@/lib/kp/types";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Публичный endpoint для предпросмотра темы на моковых данных.
// Используется в /dashboard/branding (кнопка «Скачать пример PDF»)
// и для генерации thumbnail-превью тем при сборке.
// Параметры:
//   ?template=minimal|premium-dark|warm-handmade|classic-architectural|bold-color
//   ?format=full|quick
//   ?brandColor=%23E83E8C
//   ?tagline=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const templateParam = searchParams.get("template");
    const template: KpTemplateId =
      templateParam && (ALL_TEMPLATES as string[]).includes(templateParam)
        ? (templateParam as KpTemplateId)
        : "minimal";
    const formatParam = searchParams.get("format");
    const format: KpFormat = formatParam === "quick" ? "quick" : "full";
    const brandColor = searchParams.get("brandColor") || undefined;
    const tagline = searchParams.get("tagline") || undefined;
    // ?noPhoto=1 — обложка без фото: так КП выглядит у мастера без coverPhoto
    // (у большинства) — вместо фото рисуется план по замеру (26.10.2026)
    const noPhoto = searchParams.get("noPhoto") === "1";

    const config = getDefaultConfigForTemplate(template);
    config.format = format;

    const data = await buildMockPdfData({
      template,
      brandColor,
      config,
      master: tagline || noPhoto ? { ...(tagline ? { tagline } : {}), ...(noPhoto ? { coverPhotoUrl: "" } : {}) } : undefined,
    });

    const buffer = await renderToBuffer(KpDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="kp-${format}-${template}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const e = err as Error;
    console.error("[sample-pdf] error:", e);
    return NextResponse.json(
      {
        error: e.message || "Failed to generate PDF",
        stack: e.stack?.split("\n").slice(0, 10),
      },
      { status: 500 }
    );
  }
}
