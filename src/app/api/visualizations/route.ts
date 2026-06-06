// POST  /api/visualizations  — два режима создания draft Visualization:
//   1) multipart/form-data: file + (optional) reference + objectId → sourceType="reference"
//   2) application/json:    sourceType="scene3d"|"scene2d", sceneDataUrl (base64 PNG),
//      markup, referenceUrl?, objectId?
// GET   /api/visualizations  — список визуализаций мастера (без фотографий рендеров)

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RoomElement } from "@/lib/room-types";
import type { CeilingFinish } from "@/lib/ai-visualization";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const VALID_FINISHES: ReadonlySet<CeilingFinish> = new Set(["matte", "satin", "glossy"]);

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

async function uploadDataUrlToBlob(
  dataUrl: string,
  masterId: string,
  kind: "scene3d" | "scene2d",
): Promise<string> {
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Невалидный data:image URL");
  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength > MAX_FILE_SIZE) throw new Error("Снимок больше 10MB");
  const ext = mime.split("/")[1] || "png";
  const blob = await put(`visualization/${masterId}/${kind}/${Date.now()}.${ext}`, buf, {
    access: "public",
    contentType: mime,
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const contentType = request.headers.get("content-type") || "";

    // --- JSON ветка: scene3d / scene2d ---
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        sourceType?: "scene3d" | "scene2d";
        sceneDataUrl?: string;
        elements?: RoomElement[];
        finish?: string;
        colorHex?: string;
        colorName?: string;
        referenceUrl?: string;
        objectId?: string;
        kelvin?: number;
        lightTempKey?: "warm" | "neutral" | "cool";
        lightTempPromptHint?: string;
        linkedVariants?: Array<{
          id: string;
          name: string;
          category: string;
          photoUrl?: string | null;
          physicalWidthMm?: number | null;
          physicalHeightMm?: number | null;
          colorHex?: string | null;
          mountingType?: string | null;
        }>;
      };

      if (body.sourceType !== "scene3d" && body.sourceType !== "scene2d") {
        return NextResponse.json(
          { error: "sourceType должен быть scene3d или scene2d" },
          { status: 400 },
        );
      }
      if (!body.sceneDataUrl) {
        return NextResponse.json({ error: "sceneDataUrl обязателен" }, { status: 400 });
      }
      if (!body.finish || !VALID_FINISHES.has(body.finish as CeilingFinish)) {
        return NextResponse.json(
          { error: "finish: matte | satin | glossy" },
          { status: 400 },
        );
      }
      const elements = Array.isArray(body.elements) ? body.elements : [];

      let originalUrl: string;
      try {
        originalUrl = await uploadDataUrlToBlob(body.sceneDataUrl, master.id, body.sourceType);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Ошибка загрузки снимка" },
          { status: 400 },
        );
      }

      const viz = await prisma.visualization.create({
        data: {
          masterId: master.id,
          objectId: body.objectId || null,
          sourceType: body.sourceType,
          originalUrl,
          referenceUrl: body.referenceUrl || null,
          status: "draft",
          markup: {
            elements,
            finish: body.finish,
            colorHex: body.colorHex || null,
            colorName: body.colorName || null,
            kelvin: typeof body.kelvin === "number" ? body.kelvin : null,
            lightTempKey: body.lightTempKey || null,
            lightTempPromptHint: body.lightTempPromptHint || null,
            linkedVariants: Array.isArray(body.linkedVariants) ? body.linkedVariants : [],
          } as unknown as object,
        },
      });

      return NextResponse.json({
        id: viz.id,
        sourceType: viz.sourceType,
        originalUrl: viz.originalUrl,
        referenceUrl: viz.referenceUrl,
        status: viz.status,
        createdAt: viz.createdAt,
      });
    }

    // --- multipart ветка: reference (фото клиента + опциональный референс) ---
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
