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

    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      return NextResponse.json({ error: "Принимаются только изображения" }, { status: 400 });
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Максимальный размер файла 8MB" }, { status: 400 });
    }

    const timestamp = Date.now();
    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const path = `payments/${master.id}/${timestamp}.${ext}`;

    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const blob = await put(path, file, {
      access: "public",
      contentType,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Payment upload-receipt error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
