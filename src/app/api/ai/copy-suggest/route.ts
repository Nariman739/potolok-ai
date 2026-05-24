import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { suggestCopy, type CopyFieldKind, type CopyContext } from "@/lib/kp/ai-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ai/copy-suggest
// Body: { field: CopyFieldKind, context?: CopyContext, n?: number }
// Возвращает: { suggestions: CopySuggestion[] }
//
// Используется в конструкторе КП везде, где мастер вводит свободный текст.
// На каждом текстовом поле — кнопка «✨ Подсказать варианты», которая
// вызывает этот endpoint и показывает 3 варианта в bottomsheet.

const ALLOWED_FIELDS: CopyFieldKind[] = [
  "tagline",
  "bio",
  "quick.heroTitle",
  "quick.pricePreLabel",
  "quick.priceDisclaimer",
  "quick.itemsTitle",
  "quick.itemTitle",
  "quick.itemBody",
  "quick.ctaLabel",
  "warranties.itemTitle",
  "warranties.itemValue",
  "faq.q",
  "faq.a",
  "about.title",
  "about.body",
  "portfolio.title",
  "portfolio.description",
];

export async function POST(req: NextRequest) {
  try {
    const master = await requireAuth();

    const body = (await req.json()) as {
      field?: string;
      context?: CopyContext;
      n?: number;
    };

    if (!body.field || !ALLOWED_FIELDS.includes(body.field as CopyFieldKind)) {
      return NextResponse.json(
        { error: "Unknown field type" },
        { status: 400 }
      );
    }

    const field = body.field as CopyFieldKind;
    const n = Math.min(Math.max(Number(body.n) || 3, 1), 5);

    // Подмешиваем данные мастера из БД в контекст, чтобы AI знал бренд.
    const context: CopyContext = {
      ...body.context,
      companyName:
        body.context?.companyName ||
        master.companyName ||
        `${master.firstName} ${master.lastName ?? ""}`.trim(),
      ownerName:
        body.context?.ownerName ||
        `${master.firstName} ${master.lastName ?? ""}`.trim(),
      city: body.context?.city || master.address || undefined,
    };

    const suggestions = await suggestCopy(field, context, n);

    return NextResponse.json({ suggestions });
  } catch (err) {
    const e = err as Error;
    console.error("[copy-suggest] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to suggest copy" },
      { status: 500 }
    );
  }
}
