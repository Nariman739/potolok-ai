import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
    const isImage = file.type.startsWith("image/") || allowedTypes.includes(file.type.toLowerCase());
    if (!isImage) {
      return NextResponse.json(
        { error: "Только изображения" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Максимальный размер 10MB" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    // Normalize HEIC to jpg extension for Blob storage
    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const path = `assistant/${master.id}/${sessionId || "unsorted"}/${timestamp}.${ext}`;

    // Normalize HEIC content-type — Vercel Blob handles it better as jpeg
    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const blob = await put(path, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки" },
      { status: 500 }
    );
  }
}
