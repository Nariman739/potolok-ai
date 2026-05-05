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

    const photo = await prisma.objectPhoto.findFirst({
      where: { id, masterId: master.id },
    });
    if (!photo) {
      return NextResponse.json({ error: "Фото не найдено" }, { status: 404 });
    }

    try {
      await del(photo.blobUrl);
    } catch {
      // если уже удалено в Blob — игнор
    }
    await prisma.objectPhoto.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete object photo error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
