import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const master = await requireAuth();
    const { id, roomId } = await params;

    // Verify ownership
    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const room = await prisma.measurementRoom.findFirst({
      where: { id: roomId, objectId: id },
      select: { id: true, photoUrls: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      return NextResponse.json({ error: "Только изображения" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Максимальный размер 10MB" }, { status: 400 });
    }

    // Max 10 photos per room
    if (room.photoUrls.length >= 10) {
      return NextResponse.json({ error: "Максимум 10 фото на комнату" }, { status: 400 });
    }

    const timestamp = Date.now();
    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const path = `measurements/${master.id}/${id}/${roomId}/${timestamp}.${ext}`;

    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const blob = await put(path, file, {
      access: "public",
      contentType,
    });

    // Add URL to room's photoUrls
    await prisma.measurementRoom.update({
      where: { id: roomId },
      data: { photoUrls: { push: blob.url } },
    });

    return NextResponse.json({ url: blob.url, photoUrls: [...room.photoUrls, blob.url] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Upload room photo error:", error);
    return NextResponse.json({ error: "Ошибка загрузки фото" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const master = await requireAuth();
    const { id, roomId } = await params;

    const { url } = (await request.json()) as { url: string };
    if (!url) {
      return NextResponse.json({ error: "URL не указан" }, { status: 400 });
    }

    // Verify ownership
    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const room = await prisma.measurementRoom.findFirst({
      where: { id: roomId, objectId: id },
      select: { id: true, photoUrls: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    // Remove from photoUrls
    const updatedUrls = room.photoUrls.filter((u) => u !== url);
    await prisma.measurementRoom.update({
      where: { id: roomId },
      data: { photoUrls: updatedUrls },
    });

    // Delete from Vercel Blob
    try {
      await del(url);
    } catch {
      // Blob deletion is best-effort
    }

    return NextResponse.json({ photoUrls: updatedUrls });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete room photo error:", error);
    return NextResponse.json({ error: "Ошибка удаления фото" }, { status: 500 });
  }
}
