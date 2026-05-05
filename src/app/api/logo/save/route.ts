import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { url } = body as { url?: string };

    if (typeof url !== "string") {
      return NextResponse.json({ error: "url обязателен" }, { status: 400 });
    }

    await prisma.master.update({
      where: { id: master.id },
      data: { logoUrl: url || null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo save error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
