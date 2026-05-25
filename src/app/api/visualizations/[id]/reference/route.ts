// POST   /api/visualizations/[id]/reference  — добавить/заменить фото-референс
// DELETE /api/visualizations/[id]/reference  — убрать референс

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const viz = await prisma.visualization.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!viz) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Только изображения" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Максимальный размер 10MB" }, { status: 400 });
    }

    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const contentType =
      file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type;
    const blob = await put(
      `visualization/${master.id}/reference/${Date.now()}.${ext}`,
      file,
      { access: "public", contentType, addRandomSuffix: true },
    );

    const updated = await prisma.visualization.update({
      where: { id: viz.id },
      data: { referenceUrl: blob.url },
      select: { id: true, referenceUrl: true },
    });

    return NextResponse.json({ id: updated.id, referenceUrl: updated.referenceUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualization reference POST] error:", error);
    return NextResponse.json({ error: "Ошибка загрузки референса" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.visualization.updateMany({
      where: { id, masterId: master.id },
      data: { referenceUrl: null },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualization reference DELETE] error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
