import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { parseClientData } from "@/lib/client-data-parse";
import { checkAiBudget, masterRole } from "@/lib/ai-cost-cap";

/** Разобрать вставленный ответ клиента — ничего не сохраняет, мастер проверяет. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await prisma.measurementObject.findFirst({ where: { id, ...inScope(scope), deletedAt: null }, select: { id: true } });
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 5) return NextResponse.json({ error: "Вставьте ответ клиента" }, { status: 400 });
    const budget = await checkAiBudget(master.id, masterRole(master));
    const data = budget.allowed
      ? await parseClientData(text)
      : { ...(await import("@/lib/client-data-parse").then((m) => ({ iin: m.findIin(text), phone: m.findPhone(text) }))), fullName: null, address: null };
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Client data parse error:", error);
    return NextResponse.json({ error: "Не получилось разобрать" }, { status: 500 });
  }
}
