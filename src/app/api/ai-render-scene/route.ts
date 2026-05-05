import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderSceneToPhoto, type CeilingFinish } from "@/lib/ai-scene-render";

const MAX_PER_DAY = 30;
const VALID_FINISHES: ReadonlySet<CeilingFinish> = new Set(["matte", "satin", "glossy"]);
const PNG_PREFIX = "data:image/png;base64,";
const JPG_PREFIX = "data:image/jpeg;base64,";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const body = (await request.json()) as {
      imageDataUrl?: string;     // base64 PNG/JPG snapshot из R3F-canvas
      imageUrl?: string;         // или уже загруженный URL
      finish?: string;
      colorHex?: string;
      colorName?: string;
      estimateId?: string;
      saveToEstimate?: boolean;
      extraPrompt?: string;
    };

    if (!body.imageDataUrl && !body.imageUrl) {
      return NextResponse.json(
        { error: "Нужен imageDataUrl или imageUrl" },
        { status: 400 },
      );
    }
    const finish = body.finish as CeilingFinish | undefined;
    if (finish && !VALID_FINISHES.has(finish)) {
      return NextResponse.json({ error: "Финиш: matte | satin | glossy" }, { status: 400 });
    }

    // Лимит на сутки
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.aiRenderLog.count({
      where: { masterId: master.id, createdAt: { gte: dayAgo } },
    });
    if (count >= MAX_PER_DAY) {
      return NextResponse.json(
        { error: `Лимит ${MAX_PER_DAY} AI-рендеров в сутки исчерпан. Попробуйте завтра.` },
        { status: 429 },
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: "AI-рендер ещё не настроен на сервере" },
        { status: 503 },
      );
    }

    // 1) Если пришёл data URL — заливаем в Blob (Replicate ждёт URL)
    let imageUrl = body.imageUrl;
    if (!imageUrl && body.imageDataUrl) {
      const isPng = body.imageDataUrl.startsWith(PNG_PREFIX);
      const isJpg = body.imageDataUrl.startsWith(JPG_PREFIX);
      if (!isPng && !isJpg) {
        return NextResponse.json({ error: "Поддерживаются PNG/JPG dataURL" }, { status: 400 });
      }
      const prefix = isPng ? PNG_PREFIX : JPG_PREFIX;
      const buf = Buffer.from(body.imageDataUrl.slice(prefix.length), "base64");
      if (buf.length === 0 || buf.length > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Неверный размер изображения (>8MB)" }, { status: 400 });
      }
      const ext = isPng ? "png" : "jpg";
      const ct = isPng ? "image/png" : "image/jpeg";
      const blob = await put(
        `ai-scene/${master.id}/snapshots/${Date.now()}.${ext}`,
        buf,
        { access: "public", contentType: ct, addRandomSuffix: true },
      );
      imageUrl = blob.url;
    }
    if (!imageUrl) {
      return NextResponse.json({ error: "Не удалось получить URL изображения" }, { status: 400 });
    }

    // 2) Запускаем AI-рендер
    const result = await renderSceneToPhoto({
      imageUrl,
      finish,
      colorHex: body.colorHex,
      colorName: body.colorName,
      extraPrompt: body.extraPrompt,
      blobFolder: `ai-scene/${master.id}/renders`,
    });

    // 3) Лог
    await prisma.aiRenderLog
      .create({
        data: {
          masterId: master.id,
          estimateId: body.estimateId ?? null,
          renderUrl: result.url,
          prompt: result.promptUsed,
          model: result.modelVersion,
          costUsd: result.costUsd,
        },
      })
      .catch(() => {});

    // 4) Опционально сохраняем в Estimate как hero-картинку
    if (body.saveToEstimate && body.estimateId) {
      await prisma.estimate.updateMany({
        where: { id: body.estimateId, masterId: master.id },
        data: { room3dPreviewUrl: result.url },
      });
    }

    return NextResponse.json({
      url: result.url,
      promptUsed: result.promptUsed,
      costUsd: result.costUsd,
      sourceImageUrl: imageUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("AI scene render error:", error);
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
