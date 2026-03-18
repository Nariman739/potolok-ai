import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

// PATCH — обновить работу
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.portfolioWork.findFirst({
      where: { id, masterId: master.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, ceilingType, area, photos, videoUrl, isPublished, sortOrder } = body;

    const work = await prisma.portfolioWork.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title || null }),
        ...(description !== undefined && { description: description || null }),
        ...(ceilingType !== undefined && { ceilingType: ceilingType || null }),
        ...(area !== undefined && { area: area ? parseFloat(area) : null }),
        ...(photos !== undefined && { photos }),
        ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
        ...(isPublished !== undefined && { isPublished }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json(work);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Portfolio update error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

// DELETE — удалить работу
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.portfolioWork.findFirst({
      where: { id, masterId: master.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Удаляем фото из Blob storage
    for (const url of existing.photos) {
      try {
        await del(url);
      } catch {
        // Игнорируем ошибки удаления blob
      }
    }

    await prisma.portfolioWork.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Portfolio delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
