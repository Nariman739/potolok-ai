import { NextRequest, NextResponse } from "next/server";
import { userFacingAiError, safeAiErrorLog } from "@/lib/ai-errors";
import { requireAuth } from "@/lib/auth";
import { suggestCopy, type CopyFieldKind, type CopyContext } from "@/lib/kp/ai-copy";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";
import { aiLogOnce } from "@/lib/ai-log";

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

    const budget = await checkAiBudget(master.id, masterRole(master));
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "AI daily limit reached", remainingUsd: 0, resetAt: budget.resetAt },
        { status: 429 },
      );
    }

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

    // Анонимный журнал: без имени владельца и названия компании (09.10.2026)
    const { companyName: _c, ownerName: _o, ...anonContext } = context;
    void _c;
    void _o;
    const logInput = `${field}\n${JSON.stringify(anonContext)}`;

    let suggestions, costUsd;
    try {
      ({ suggestions, costUsd } = await suggestCopy(field, context, n));
    } catch (e) {
      await aiLogOnce({ feature: "copy-suggest", input: logInput, lang: master.language, currency: master.currency, ok: false, error: e });
      throw e;
    }
    await recordAiUsage(master.id, costUsd);
    await aiLogOnce({ feature: "copy-suggest", input: logInput, output: suggestions, lang: master.language, currency: master.currency, ok: true, costUsd });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[copy-suggest] error:", safeAiErrorLog(err));
    const { message, status } = userFacingAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
