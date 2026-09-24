import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Загрузка собственного логотипа мастера.
 *
 * У большинства мастеров логотип уже есть — им не нужен AI-генератор, им нужно
 * просто закинуть свой файл и увидеть его в КП и договоре.
 */
export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    // SVG убран, и список стал строгим (аудит 24.09.2026): прежняя проверка
    // пропускала любой image/*, а SVG — это исполняемая разметка. Файл лежит
    // в публичном хранилище, и открытый по прямой ссылке скрипт внутри него
    // выполняется на чужом домене. Логотипу вектор не нужен.
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    const isImage = allowedTypes.includes(file.type.toLowerCase());
    if (!isImage) {
      return NextResponse.json(
        { error: "Логотип должен быть картинкой: PNG, JPG, WEBP или HEIC" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл больше 5 МБ — сожмите картинку и попробуйте снова" },
        { status: 400 },
      );
    }

    const rawExt = (file.name.split(".").pop() || "png").toLowerCase();
    // HEIC с айфона Blob отдаёт лучше как jpeg
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/png";

    const blob = await put(`logos/${master.id}/${Date.now()}.${ext}`, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    // Загруженный логотип становится текущим — AI-варианты снимаем с «текущего»,
    // но из истории не удаляем, мастер может вернуться к ним.
    await prisma.logoGeneration.updateMany({
      where: { masterId: master.id, isCurrent: true },
      data: { isCurrent: false },
    });

    await prisma.master.update({
      where: { id: master.id },
      data: { logoUrl: blob.url },
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Не удалось загрузить логотип" }, { status: 500 });
  }
}
