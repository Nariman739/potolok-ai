import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const blobExt = ext === "heic" || ext === "heif" ? "jpg" : ext || "jpg";
    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const path = `kp-cover/${master.id}/${Date.now()}.${blobExt}`;
    const blob = await put(path, file, { access: "public", contentType });

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
