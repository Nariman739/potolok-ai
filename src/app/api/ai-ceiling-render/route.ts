import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateCeilingRender,
  type CeilingFinish,
} from "@/lib/ai-ceiling-render";

const MAX_PER_DAY = 30; // защита от drain'а: не более 30 рендеров в сутки на мастера
const VALID_FINISHES: ReadonlySet<CeilingFinish> = new Set(["matte", "satin", "glossy"]);

export const maxDuration = 60; // Replicate Flux Fill Pro обычно 10-30 сек

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const body = (await request.json()) as {
      imageUrl?: string;
      finish?: string;
      colorHex?: string;
      colorName?: string;
      estimateId?: string;
      saveToEstimate?: boolean;
      topMaskRatio?: number;
    };

    if (!body.imageUrl || typeof body.imageUrl !== "string") {
      return NextResponse.json({ error: "Нужно фото комнаты (imageUrl)" }, { status: 400 });
    }
    const finish = body.finish as CeilingFinish | undefined;
    if (!finish || !VALID_FINISHES.has(finish)) {
      return NextResponse.json({ error: "Финиш: matte | satin | glossy" }, { status: 400 });
    }
    if (!body.colorHex || !/^#[0-9a-fA-F]{6}$/.test(body.colorHex)) {
      return NextResponse.json({ error: "colorHex обязателен в формате #RRGGBB" }, { status: 400 });
    }

    // Лимит на сутки — не платим за runaway-скрипты
    if (typeof prisma.aiRenderLog?.count === "function") {
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
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: "AI-рендер ещё не настроен на сервере" },
        { status: 503 },
      );
    }

    const result = await generateCeilingRender({
      imageUrl: body.imageUrl,
      finish,
      colorHex: body.colorHex,
      colorName: body.colorName,
      topMaskRatio: typeof body.topMaskRatio === "number"
        ? Math.max(0.2, Math.min(0.6, body.topMaskRatio))
        : undefined,
      blobFolder: `ai-ceiling/${master.id}`,
    });

    // Логируем для биллинга / лимитов
    if (typeof prisma.aiRenderLog?.create === "function") {
      await prisma.aiRenderLog.create({
        data: {
          masterId: master.id,
          estimateId: body.estimateId ?? null,
          renderUrl: result.url,
          prompt: result.promptUsed,
          model: result.modelVersion,
          costUsd: result.costUsd,
        },
      }).catch(() => {});
    }

    // Опционально — записываем рендер в Estimate как hero-картинку
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
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("AI ceiling render error:", error);
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
