import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateKpConfigFromBrief,
  type MasterBrief,
} from "@/lib/kp/ai-onboarding";

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

    const body = (await req.json()) as Partial<MasterBrief>;

    if (!body.companyName?.trim()) {
      return NextResponse.json(
        { error: "companyName is required" },
        { status: 400 }
      );
    }
    if (
      !body.segment ||
      !["mass", "middle", "premium", "family", "young-bold"].includes(body.segment)
    ) {
      return NextResponse.json(
        { error: "segment must be one of: mass | middle | premium | family | young-bold" },
        { status: 400 }
      );
    }

    // Подмешиваем дефолты из профиля мастера
    const brief: MasterBrief = {
      companyName: body.companyName.trim(),
      ownerName:
        body.ownerName?.trim() ||
        `${master.firstName} ${master.lastName ?? ""}`.trim(),
      city: body.city?.trim() || master.address?.trim() || undefined,
      yearsActive: body.yearsActive,
      segment: body.segment,
      materialsUsed: body.materialsUsed?.trim(),
      warrantyMaterialsYears: body.warrantyMaterialsYears ?? master.warrantyMaterials,
      warrantyInstallYears: body.warrantyInstallYears ?? master.warrantyInstall,
      differentiator: body.differentiator?.trim(),
      communicationStyle: body.communicationStyle,
      commonQuestions: body.commonQuestions?.filter((q) => q?.trim()),
    };

    const result = await generateKpConfigFromBrief(brief);

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

    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error;
    console.error("[kp-onboarding] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to generate config" },
      { status: 500 }
    );
  }
}
