import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateLogo } from "@/lib/logo-generation";
import { LOGO_LIMITS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const masterAuth = await requireAuth();
    const body = await request.json();
    const { promptEnglish, brief } = body as {
      promptEnglish?: string;
      brief?: Record<string, unknown>;
    };

    if (!promptEnglish || typeof promptEnglish !== "string") {
      return NextResponse.json(
        { error: "promptEnglish обязателен" },
        { status: 400 },
      );
    }

    // Лимит + автосброс счётчика на новый месяц
    const masterDb = await prisma.master.findUnique({
      where: { id: masterAuth.id },
      select: {
        subscriptionTier: true,
        logoGenerationsThisMonth: true,
        logoMonthReset: true,
      },
    });
    if (!masterDb) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const now = new Date();
    let count = masterDb.logoGenerationsThisMonth;
    const resetDate = new Date(masterDb.logoMonthReset);
    if (
      now.getMonth() !== resetDate.getMonth() ||
      now.getFullYear() !== resetDate.getFullYear()
    ) {
      await prisma.master.update({
        where: { id: masterAuth.id },
        data: { logoGenerationsThisMonth: 0, logoMonthReset: now },
      });
      count = 0;
    }

    const limit = LOGO_LIMITS[masterDb.subscriptionTier];
    if (count >= limit) {
      return NextResponse.json(
        {
          error: `Лимит генераций исчерпан (${limit}/мес). Перейдите на PRO для безлимита.`,
        },
        { status: 403 },
      );
    }

    const { url, promptUsed } = await generateLogo(promptEnglish, masterAuth.id);

    await prisma.master.update({
      where: { id: masterAuth.id },
      data: {
        logoGenerationsThisMonth: { increment: 1 },
        ...(brief && { logoBrief: brief as unknown as object }),
      },
    });

    return NextResponse.json({ url, promptUsed });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo generate error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ошибка генерации",
      },
      { status: 500 },
    );
  }
}
