import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

/**
 * Ссылка на наряд монтажнику (Этап 3). Создаётся один раз и живёт вместе с
 * объектом — наряд всегда показывает актуальные комнаты и сумму.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: { id: true, workOrderToken: true },
    });
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    let token = obj.workOrderToken;
    if (!token) {
      token = randomBytes(9).toString("base64url");
      await prisma.measurementObject.update({ where: { id }, data: { workOrderToken: token } });
    }
    return NextResponse.json({ url: `https://potolok.ai/n/${token}`, token });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Work order error:", error);
    return NextResponse.json({ error: "Не удалось создать наряд" }, { status: 500 });
  }
}
