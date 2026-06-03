import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { continueLogoChat, type LogoChatMessage } from "@/lib/logo-generation";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";

export async function POST(request: Request) {
  try {
    const masterAuth = await requireAuth();

    const budget = await checkAiBudget(masterAuth.id, masterRole(masterAuth));
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "AI daily limit reached", remaining: 0, resetAt: budget.resetAt },
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

    const result = await continueLogoChat(master, history);
    await recordAiUsage(masterAuth.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo chat error:", error);
    return NextResponse.json({ error: "Ошибка диалога" }, { status: 500 });
  }
}
