import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { continueLogoChat, type LogoChatMessage } from "@/lib/logo-generation";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";
import { aiLogStart, aiLogFinish } from "@/lib/ai-log";

export async function POST(request: Request) {
  try {
    const masterAuth = await requireAuth();

    const budget = await checkAiBudget(masterAuth.id, masterRole(masterAuth));
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "AI daily limit reached", remainingUsd: 0, resetAt: budget.resetAt },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { history } = body as { history?: LogoChatMessage[] };

    if (!Array.isArray(history)) {
      return NextResponse.json({ error: "history должен быть массивом" }, { status: 400 });
    }

    const master = await prisma.master.findUnique({
      where: { id: masterAuth.id },
      select: { firstName: true, companyName: true, address: true },
    });
    if (!master) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Анонимный журнал: последняя реплика мастера → ответ (09.10.2026)
    const lastUser = [...history].reverse().find((m) => m?.role === "user")?.content ?? "[начало диалога]";
    const logId = await aiLogStart({
      feature: "logo-chat",
      input: lastUser,
      lang: masterAuth.language,
      currency: masterAuth.currency,
    });

    let result;
    try {
      result = await continueLogoChat(master, history);
    } catch (e) {
      await aiLogFinish(logId, { ok: false, error: e });
      throw e;
    }
    await recordAiUsage(masterAuth.id, result.__costUsd ?? 0);
    const { __costUsd: _drop, ...payload } = result;
    void _drop;
    await aiLogFinish(logId, { ok: true, output: payload, costUsd: result.__costUsd ?? 0 });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo chat error:", error);
    Sentry.captureException(error, { tags: { feature: "logo-chat" } });
    return NextResponse.json({ error: "Ошибка диалога" }, { status: 500 });
  }
}
