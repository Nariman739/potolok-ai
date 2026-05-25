import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import type { KpConfig } from "@/lib/kp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/kp/preview-pdf
// Body: { config: KpConfig, brandColor?, tagline?, coverPhotoUrl? }
// Возвращает PDF-байты — используется конструктором /dashboard/branding для
// live-превью текущих настроек на моковых данных. В отличие от GET sample-pdf,
// здесь принимаем полный KpConfig (с правленными FAQ, гарантиями, quick.items
// и т.д.) — JSON слишком большой для query string.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      config?: KpConfig;
      brandColor?: string | null;
      tagline?: string | null;
      coverPhotoUrl?: string | null;
    };

    if (!body.config) {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    const data = await buildMockPdfData({
      config: body.config,
      brandColor: body.brandColor || undefined,
      master: {
        tagline: body.tagline || undefined,
        coverPhotoUrl: body.coverPhotoUrl || undefined,
      },
    });

    const buffer = await renderToBuffer(KpDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="kp-preview.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const e = err as Error;
    console.error("[preview-pdf] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to render PDF" },
      { status: 500 }
    );
  }
}
