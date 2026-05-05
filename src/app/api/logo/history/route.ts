import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const master = await requireAuth();
    const items = await prisma.logoGeneration.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        blobUrl: true,
        promptUsed: true,
        isCurrent: true,
        createdAt: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo history error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
