import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const logo = await prisma.logoGeneration.findFirst({
      where: { id, masterId: master.id },
    });
    if (!logo) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Если этот логотип сейчас активный — снимаем у мастера
    if (logo.isCurrent) {
      await prisma.master.update({
        where: { id: master.id },
        data: { logoUrl: null },
      });
    }

    try {
      await del(logo.blobUrl);
    } catch {
      // already deleted
    }
    await prisma.logoGeneration.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo delete error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
