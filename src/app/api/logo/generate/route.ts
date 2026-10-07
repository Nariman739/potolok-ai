import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateLogo } from "@/lib/logo-generation";
import { LOGO_LIMITS } from "@/lib/constants";
import { userFacingAiError, safeAiErrorLog } from "@/lib/ai-errors";
import { checkRateLimit } from "@/lib/rate-limit";

// Generate Replicate 10–20 с + скачивание + заливка: даём функции запас.
export const maxDuration = 60;

const MAX_PROMPT_LEN = 1500;

export async function POST(request: Request) {
  let reserved: string | null = null;
  try {
    const masterAuth = await requireAuth();

    // Каждая генерация — живые деньги на Replicate. Не чаще 5 в минуту на
    // мастера: человеку хватает, скрипту — нет (аудит 07.10.2026).
    const rl = await checkRateLimit(`logo-gen:${masterAuth.id}`, 5, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком часто. Подождите минуту и попробуйте снова." },
        { status: 429 },
      );
    }

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
    if (promptEnglish.length > MAX_PROMPT_LEN) {
      return NextResponse.json({ error: "Слишком длинное описание логотипа" }, { status: 400 });
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
    const resetDate = new Date(masterDb.logoMonthReset);
    if (
      now.getMonth() !== resetDate.getMonth() ||
      now.getFullYear() !== resetDate.getFullYear()
    ) {
      await prisma.master.update({
        where: { id: masterAuth.id },
        data: { logoGenerationsThisMonth: 0, logoMonthReset: now },
      });
    }

    const limit = LOGO_LIMITS[masterDb.subscriptionTier];
    // Резервируем место в лимите ДО генерации одним условным UPDATE: раньше
    // «проверить, потом увеличить» обходилось параллельными запросами.
    // Если генерация упадёт — вернём место (finally ниже).
    const taken = await prisma.master.updateMany({
      where: { id: masterAuth.id, logoGenerationsThisMonth: { lt: limit } },
      data: { logoGenerationsThisMonth: { increment: 1 } },
    });
    if (taken.count === 0) {
      return NextResponse.json(
        {
          error: `Лимит генераций логотипа исчерпан (${limit}/мес). Обновится в начале месяца — или напишите нам, добавим.`,
        },
        { status: 403 },
      );
    }
    reserved = masterAuth.id;

    const { url, promptUsed } = await generateLogo(promptEnglish, masterAuth.id);
    reserved = null;

    // Сохраняем в историю
    const generation = await prisma.logoGeneration.create({
      data: {
        masterId: masterAuth.id,
        blobUrl: url,
        promptUsed,
        ...(brief && { brief: brief as unknown as object }),
        isCurrent: false,
      },
    });

    if (brief) {
      await prisma.master.update({
        where: { id: masterAuth.id },
        data: { logoBrief: brief as unknown as object },
      });
    }

    return NextResponse.json({ id: generation.id, url, promptUsed });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (reserved) {
      await prisma.master
        .updateMany({ where: { id: reserved, logoGenerationsThisMonth: { gt: 0 } }, data: { logoGenerationsThisMonth: { decrement: 1 } } })
        .catch(() => {});
    }
    console.error("Logo generate error:", safeAiErrorLog(error));
    // Раньше сбой Replicate (нет денег, таймаут) оставался только в логах
    // Vercel — о пустом балансе узнавали от мастеров (07.10.2026).
    Sentry.captureException(error, { tags: { feature: "logo-generate" } });
    const { message, status } = userFacingAiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
