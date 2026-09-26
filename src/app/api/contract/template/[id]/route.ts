import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";

/**
 * Одна версия своего договора целиком (27.09.2026). Список версий отдаёт
 * GET /contract/template без текста — текст тяжёлый, его тянем по запросу,
 * когда мастер открыл старую редакцию посмотреть или вернуть.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const template = await prisma.masterContract.findFirst({ where: { id, masterId: scope.ownerId } });
    if (!template) return NextResponse.json({ error: "Версия не найдена" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract template version error:", error);
    return NextResponse.json({ error: "Не удалось прочитать версию" }, { status: 500 });
  }
}
