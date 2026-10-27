import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compressPhoto, HEIC_UPLOAD_ERROR } from "@/lib/compress-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/master/me/upload-cover
// Multipart: file=<image>
// Загружает cover photo для обложки КП в Vercel Blob,
// прописывает URL в Master.coverPhotoUrl, возвращает { url }.
export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const imageExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    const isImage = file.type.startsWith("image/") || imageExts.includes(ext);

    if (!isImage) {
      return NextResponse.json({ error: "Только изображения" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Максимум 10MB" }, { status: 400 });
    }

    // Обложка печатается на A4 — 1600px хватает; сырые 3 МБ раздували PDF (27.10.2026)
    const photo = await compressPhoto(file);
    if (photo.heic) {
      return NextResponse.json({ error: HEIC_UPLOAD_ERROR }, { status: 400 });
    }
    const path = `kp-cover/${master.id}/${Date.now()}.${photo.ext}`;
    const blob = await put(path, photo.body, { access: "public", contentType: photo.contentType, addRandomSuffix: true });

    await prisma.master.update({
      where: { id: master.id },
      data: { coverPhotoUrl: blob.url },
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const e = err as Error;
    if (e.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[upload-cover] error:", e);
    return NextResponse.json(
      { error: e.message || "Ошибка загрузки" },
      { status: 500 }
    );
  }
}
