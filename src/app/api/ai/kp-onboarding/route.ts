import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateKpConfigFromBrief,
  buildFallbackConfigFromBrief,
  type MasterBrief,
} from "@/lib/kp/ai-onboarding";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";
import { userFacingAiError, safeAiErrorLog } from "@/lib/ai-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude Sonnet через OpenRouter может думать 20-40 сек при max_tokens=2500.
// Без явного maxDuration Vercel режет на 10 сек → fetch «Load failed».
// (Нариман 26.05.26: «теперь Load failed на шаге 7 онбординга бренда».)
export const maxDuration = 60;

// POST /api/ai/kp-onboarding
// Body: MasterBrief (ответы мастера на 6-7 вопросов первичного скрининга)
// Возвращает: { template, tagline, config, rationale }
//
// Мастер заходит в /dashboard/branding первый раз → проходит онбординг →
// этот endpoint собирает персональный KpConfig + tagline + about.
// Дальше мастер видит превью своего КП с уже заполненными текстами,
// может править любой блок через AI-помощник /api/ai/copy-suggest.

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

    // Серик 28.05: онбординг теперь принимает массив `segments` (multi-select).
    // Старое поле `segment` (single) поддерживаем для backward-compat.
    // AI-промпт и тема КП пока подбираются по первому выбранному сегменту.
    const body = (await req.json()) as Partial<MasterBrief> & { segments?: string[] };

    if (!body.companyName?.trim()) {
      return NextResponse.json(
        { error: "companyName is required" },
        { status: 400 }
      );
    }
    const ALLOWED_SEGMENTS = ["mass", "middle", "premium", "family", "young-bold"] as const;
    type AllowedSegment = (typeof ALLOWED_SEGMENTS)[number];
    const segmentsArr: string[] = Array.isArray(body.segments) && body.segments.length > 0
      ? body.segments
      : body.segment
        ? [body.segment]
        : [];
    if (
      segmentsArr.length === 0 ||
      !segmentsArr.every((s) => (ALLOWED_SEGMENTS as readonly string[]).includes(s))
    ) {
      return NextResponse.json(
        { error: "segments must be a non-empty array of: mass | middle | premium | family | young-bold" },
        { status: 400 }
      );
    }
    const primarySegment = segmentsArr[0] as AllowedSegment;

    // Подмешиваем дефолты из профиля мастера
    const brief: MasterBrief = {
      companyName: body.companyName.trim(),
      ownerName:
        body.ownerName?.trim() ||
        `${master.firstName} ${master.lastName ?? ""}`.trim(),
      city: body.city?.trim() || master.address?.trim() || undefined,
      yearsActive: body.yearsActive,
      segment: primarySegment,
      materialsUsed: body.materialsUsed?.trim(),
      warrantyMaterialsYears: body.warrantyMaterialsYears ?? master.warrantyMaterials,
      warrantyInstallYears: body.warrantyInstallYears ?? master.warrantyInstall,
      differentiator: body.differentiator?.trim(),
      communicationStyle: body.communicationStyle,
      commonQuestions: body.commonQuestions?.filter((q) => q?.trim()),
    };

    // Если AI недоступен — не теряем семь шагов анкеты: собираем КП по теме,
    // подобранной без модели, и честно говорим, что тексты пока стандартные.
    let aiUnavailable = false;
    let result;
    try {
      result = await generateKpConfigFromBrief(brief);
    } catch (aiErr) {
      console.error("[kp-onboarding] AI недоступен:", safeAiErrorLog(aiErr));
      result = buildFallbackConfigFromBrief(brief);
      aiUnavailable = true;
    }
    await recordAiUsage(master.id, result.__costUsd ?? 0);

    // Сохраняем бриф + результат AI в БД — для последующей аналитики рынка
    // (какие сегменты популярны в каких городах, какие гарантии типичны, и т.д.)
    await prisma.masterBrief.upsert({
      where: { masterId: master.id },
      create: {
        masterId: master.id,
        brief: brief as unknown as object,
        generatedConfig: result.config as unknown as object,
        generatedTagline: result.tagline,
        rationale: result.rationale,
        segment: brief.segment,
        city: brief.city ?? null,
        yearsActive: brief.yearsActive ?? null,
      },
      update: {
        brief: brief as unknown as object,
        generatedConfig: result.config as unknown as object,
        generatedTagline: result.tagline,
        rationale: result.rationale,
        segment: brief.segment,
        city: brief.city ?? null,
        yearsActive: brief.yearsActive ?? null,
      },
    });

    return NextResponse.json({ ...result, aiUnavailable });
  } catch (err) {
    console.error("[kp-onboarding] error:", safeAiErrorLog(err));
    const { message, status } = userFacingAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
