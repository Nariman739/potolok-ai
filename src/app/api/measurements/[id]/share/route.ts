import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// base64url(6) ≈ 10^-14 коллизия на запись — как у publicHash визуализаций.
function generateShareId(): string {
  return randomBytes(6).toString("base64url");
}

/**
 * POST /api/measurements/[id]/share
 * Лениво выдаёт (или возвращает существующий) токен публичной 3D-ссылки замера.
 * Клиент по ней крутит комнату без логина — до создания КП.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id, deletedAt: null },
      select: { id: true, publicShareId: true },
    });
    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    let shareId = obj.publicShareId;
    if (!shareId) {
      shareId = generateShareId();
      await prisma.measurementObject.update({
        where: { id: obj.id },
        data: { publicShareId: shareId },
      });
    }

    return NextResponse.json({ shareId, path: `/z/${shareId}` });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Measurement share error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
