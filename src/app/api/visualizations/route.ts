// POST  /api/visualizations  — multipart upload фото → создать draft Visualization
// GET   /api/visualizations  — список визуализаций мастера (без фотографий рендеров)

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function uploadImageToBlob(
  file: File,
  masterId: string,
  kind: "original" | "reference",
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Только изображения");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Максимальный размер 10MB");
  }
  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
  const contentType =
    file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type;
  const blob = await put(
    `visualization/${masterId}/${kind}/${Date.now()}.${ext}`,
    file,
    { access: "public", contentType, addRandomSuffix: true },
  );
  return blob.url;
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const referenceFile = formData.get("reference") as File | null;
    const objectId = formData.get("objectId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    let originalUrl: string;
    let referenceUrl: string | null = null;
    try {
      originalUrl = await uploadImageToBlob(file, master.id, "original");
      if (referenceFile && referenceFile.size > 0) {
        referenceUrl = await uploadImageToBlob(referenceFile, master.id, "reference");
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка загрузки" },
        { status: 400 },
      );
    }

    const viz = await prisma.visualization.create({
      data: {
        masterId: master.id,
        objectId: objectId || null,
        originalUrl,
        referenceUrl,
        status: "draft",
      },
    });

    return NextResponse.json({
      id: viz.id,
      originalUrl: viz.originalUrl,
      referenceUrl: viz.referenceUrl,
      status: viz.status,
      createdAt: viz.createdAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualizations POST] error:", error);
    return NextResponse.json({ error: "Не удалось создать визуализацию" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const master = await requireAuth();

    const list = await prisma.visualization.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        renders: {
          orderBy: { createdAt: "desc" },
          take: 1, // последний результат для превью
          select: { id: true, url: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({
      visualizations: list.map((v) => ({
        id: v.id,
        originalUrl: v.originalUrl,
        status: v.status,
        createdAt: v.createdAt,
        latestRender: v.renders[0] ?? null,
        rendersCount: v.renders.length, // упрощённо — для accurate надо отдельный count
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualizations GET] error:", error);
    return NextResponse.json({ error: "Не удалось загрузить список" }, { status: 500 });
  }
}
