import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/master/me/has-brief
// Лёгкий endpoint для mobile: проверить, прошёл ли мастер AI-онбординг
// конструктора КП. Если false — mobile показывает NEW-badge на кнопке
// «🎨 Дизайн КП» в Профиле.

export async function GET() {
  try {
    const master = await requireAuth();
    const brief = await prisma.masterBrief.findUnique({
      where: { masterId: master.id },
      select: { id: true },
    });
    return NextResponse.json({ hasBrief: !!brief });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("has-brief error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
