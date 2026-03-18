import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    // Определяем тип по расширению если file.type пустой (бывает на мобилках)
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const imageExts = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"];
    const videoExts = ["mp4", "mov", "webm"];

    const isImage = file.type.startsWith("image/") || imageExts.includes(ext);
    const isVideo = file.type.startsWith("video/") || videoExts.includes(ext);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "Только фото и видео" },
        { status: 400 }
      );
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Максимальный размер ${isVideo ? "50MB" : "10MB"}` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const blobExt = (ext === "heic" || ext === "heif") ? "jpg" : (ext || "jpg");
    const path = `portfolio/${master.id}/${timestamp}.${blobExt}`;

    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const blob = await put(path, file, {
      access: "public",
      contentType,
    });

    return NextResponse.json({ url: blob.url, type: isVideo ? "video" : "image" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Portfolio upload error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
