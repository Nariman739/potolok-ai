import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addClientEvent } from "@/lib/clients";
import type { ObjectPhotoCategory } from "@/generated/prisma/client";

const ALLOWED_CATEGORIES = [
  "BEFORE",
  "PROCESS",
  "AFTER",
  "MEASUREMENT",
  "DEMOLITION",
  "OTHER",
] as const;

export async function GET(request: NextRequest) {
  try {
    const master = await requireAuth();
    const clientId = request.nextUrl.searchParams.get("clientId");
    const category = request.nextUrl.searchParams.get("category");

    const where: {
      masterId: string;
      clientId?: string;
      category?: ObjectPhotoCategory;
    } = { masterId: master.id };
    if (clientId) where.clientId = clientId;
    if (category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category as ObjectPhotoCategory;
    }

    const photos = await prisma.objectPhoto.findMany({
      where,
      orderBy: { takenAt: "desc" },
    });

    return NextResponse.json(photos);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get object photos error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientId = (formData.get("clientId") as string) || null;
    const estimateId = (formData.get("estimateId") as string) || null;
    const categoryRaw = (formData.get("category") as string) || "PROCESS";
    const caption = (formData.get("caption") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    const category = (ALLOWED_CATEGORIES as readonly string[]).includes(
      categoryRaw,
    )
      ? (categoryRaw as ObjectPhotoCategory)
      : "PROCESS";

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const imageExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    const isImage = file.type.startsWith("image/") || imageExts.includes(ext);
    if (!isImage) {
      return NextResponse.json({ error: "Только фото" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Максимум 10MB" },
        { status: 400 },
      );
    }

    // Если передан clientId — проверяем что клиент мастера
    let safeClientId: string | null = null;
    if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, masterId: master.id },
        select: { id: true },
      });
      safeClientId = c?.id ?? null;
    }

    const timestamp = Date.now();
    const blobExt = ext === "heic" || ext === "heif" ? "jpg" : ext || "jpg";
    const path = `object-photos/${master.id}/${safeClientId || "_unassigned"}/${timestamp}.${blobExt}`;
    const contentType =
      file.type === "image/heic" || file.type === "image/heif"
        ? "image/jpeg"
        : file.type || "image/jpeg";

    const blob = await put(path, file, {
      access: "public",
      contentType,
    });

    const photo = await prisma.objectPhoto.create({
      data: {
        masterId: master.id,
        clientId: safeClientId,
        estimateId: estimateId || null,
        category,
        blobUrl: blob.url,
        caption: caption?.trim() || null,
      },
    });

    if (safeClientId) {
      addClientEvent({
        clientId: safeClientId,
        type: "PHOTO_ADDED",
        content: caption?.trim() || `Фото (${category.toLowerCase()})`,
        metadata: { photoId: photo.id, category },
      }).catch(() => {});
    }

    return NextResponse.json(photo);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Upload object photo error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
