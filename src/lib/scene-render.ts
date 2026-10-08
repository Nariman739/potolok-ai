// AI-рендер из снимка 3D-сцены (sourceType scene3d/scene2d): nano-banana → заморозка
// потолка по маске из Three.js → детерминированное свечение парящего → Blob → запись.
//
// Вынесено из /api/visualizations/[id]/render (renderFromScene), чтобы тем же путём
// пользовался и серверный рендер «Фото клиенту» (/api/visualizations/[id]/frames).
// Логика 1:1 прежняя; добавлены замеры этапов и запись ошибки в markup.error.

import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  generateVisualization,
  describeReferenceCeiling,
  type VisualizationOptions,
  type VisualizationProvider,
  type CeilingFinish,
} from "@/lib/ai-visualization";
import { recordAiUsage } from "@/lib/ai-cost-cap";
import { compositeWithMask, addPerimeterGlow } from "@/lib/visualization-mask";
import { buildScenePrompt, buildHybridScenePrompt, buildFrozenCeilingScenePrompt } from "@/lib/ai-scene-prompt";
import type { RoomElement } from "@/lib/room-types";
import { buildBillingIncrement, type BillingCheckResult } from "@/lib/visualization-billing";

export class SceneRenderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface SceneRenderViz {
  id: string;
  sourceType: string;
  originalUrl: string;
  referenceUrl: string | null;
  markup: unknown;
  publicHash: string | null;
}

export interface SceneRenderResult {
  render: { id: string; url: string; modelUsed: string; costUsd: number; createdAt: Date };
  publicHash: string | null;
  elapsedMs: number;
  timings: { aiMs: number; compositeMs: number; uploadMs: number; totalMs: number };
}

function generatePublicHash(): string {
  return randomBytes(6).toString("base64url");
}

/** Пометить визуализацию failed и сохранить текст ошибки в markup.error (схему не трогаем). */
export async function markVisualizationFailed(vizId: string, error: string): Promise<void> {
  try {
    const cur = await prisma.visualization.findUnique({ where: { id: vizId }, select: { markup: true } });
    const markup = (cur?.markup && typeof cur.markup === "object" ? cur.markup : {}) as Record<string, unknown>;
    await prisma.visualization.update({
      where: { id: vizId },
      data: {
        status: "failed",
        markup: { ...markup, error: error.slice(0, 500), failedAt: new Date().toISOString() } as unknown as object,
      },
    });
  } catch (e) {
    console.error("[scene render] markVisualizationFailed:", e);
  }
}

export async function runSceneRender(opts: {
  viz: SceneRenderViz;
  /** Решение биллинга; increment=null → счётчики квоты не трогаем (у «Фото клиенту» свой лимит). */
  decision: BillingCheckResult;
  masterId: string;
  provider?: VisualizationProvider;
  /** Явная модель картинок (иначе env AI_IMAGE_MODEL / дефолт). */
  imageModel?: string;
  /** Уже загруженные снимок и маски — чтобы не качать их обратно из Blob. */
  preloaded?: { scene?: Buffer; sceneMime?: string; ceilingMask?: Buffer; floatingMask?: Buffer };
}): Promise<SceneRenderResult> {
  const { viz, decision, masterId } = opts;
  const tStart = Date.now();
  const markup = (viz.markup ?? {}) as {
    elements?: RoomElement[];
    finish?: CeilingFinish;
    ceilingMaskUrl?: string | null;
    floatingMaskUrl?: string | null;
    colorHex?: string;
    colorName?: string;
    extraPrompt?: string;
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
    floorPresetId?: string;
    floorPromptDesc?: string;
    wallPresetId?: string;
    wallPromptDesc?: string;
  };
  const elements = Array.isArray(markup.elements) ? markup.elements : [];
  const finish: CeilingFinish = (markup.finish as CeilingFinish) ?? "matte";

  // --- снимок сцены (PNG из R3F) как base64 ---
  let sceneBuf: Buffer;
  let sceneMime: string;
  if (opts.preloaded?.scene) {
    sceneBuf = opts.preloaded.scene;
    sceneMime = opts.preloaded.sceneMime ?? "image/png";
  } else {
    const sceneRes = await fetch(viz.originalUrl);
    if (!sceneRes.ok) throw new SceneRenderError("Не удалось загрузить снимок сцены", 500);
    sceneMime = sceneRes.headers.get("content-type") || "image/png";
    sceneBuf = Buffer.from(await sceneRes.arrayBuffer());
  }
  const sceneBase64 = sceneBuf.toString("base64");

  // --- (optional) reference: фото реальной комнаты для гибридного режима ---
  let referenceBase64: string | undefined;
  let referenceMime: string | undefined;
  let referenceDescription: string | undefined;
  if (viz.referenceUrl) {
    const refRes = await fetch(viz.referenceUrl);
    if (refRes.ok) {
      referenceMime = refRes.headers.get("content-type") || "image/jpeg";
      referenceBase64 = Buffer.from(await refRes.arrayBuffer()).toString("base64");
      try {
        const refResult = await describeReferenceCeiling(referenceBase64, referenceMime);
        referenceDescription = refResult.description;
        await recordAiUsage(masterId, refResult.costUsd);
      } catch (e) {
        console.warn("[scene render] reference description failed:", e);
      }
    }
  }

  const hasReference = Boolean(referenceBase64 && referenceMime);
  const sourceType = viz.sourceType as "scene3d" | "scene2d";
  const lightTempPromptHint = typeof markup.lightTempPromptHint === "string" ? markup.lightTempPromptHint : undefined;
  const linkedVariants = Array.isArray(markup.linkedVariants) ? markup.linkedVariants : undefined;
  const floorPromptDesc = typeof markup.floorPromptDesc === "string" ? markup.floorPromptDesc : undefined;
  const wallPromptDesc = typeof markup.wallPromptDesc === "string" ? markup.wallPromptDesc : undefined;
  const hasCeilingMask = Boolean(markup.ceilingMaskUrl || opts.preloaded?.ceilingMask);

  // Путь «заморозка потолка» (scene3d + маска, без reference-фото).
  const useFrozenPath = !hasReference && sourceType === "scene3d" && hasCeilingMask;
  const promptInput = {
    elements,
    finish,
    colorHex: markup.colorHex,
    colorName: markup.colorName,
    extraPrompt: markup.extraPrompt,
    sourceType,
    lightTempPromptHint,
    linkedVariants,
    floorPromptDesc,
    wallPromptDesc,
  };
  const customPrompt = hasReference
    ? buildHybridScenePrompt({ ...promptInput, referenceDescription })
    : useFrozenPath
    ? buildFrozenCeilingScenePrompt({
        ...promptInput,
        kelvin: typeof markup.kelvin === "number" ? markup.kelvin : undefined,
      })
    : buildScenePrompt(promptInput);

  const provider: VisualizationProvider = opts.provider ?? "nano-banana";
  const options: VisualizationOptions = {
    attachmentType: "regular",
    finish,
    colorName: markup.colorName,
    spotsCount: 6,
    chandelierType: "minimalist",
  };

  await prisma.visualization.update({ where: { id: viz.id }, data: { status: "rendering" } });

  const tAi = Date.now();
  let result;
  // Gemini изредка отвечает текстом без картинки («Here's your image:» и пусто) —
  // один автоматический повтор, прежде чем считать рендер неудачным.
  const generateOnce = () =>
    hasReference
      ? generateVisualization({
          photoUrl: viz.referenceUrl!,
          photoBase64: referenceBase64,
          photoMime: referenceMime,
          overlayBase64: sceneBase64,
          overlayMime: sceneMime,
          options,
          provider,
          customPrompt,
          imageModel: opts.imageModel,
        })
      : generateVisualization({
          photoUrl: viz.originalUrl,
          photoBase64: sceneBase64,
          photoMime: sceneMime,
          options,
          provider,
          customPrompt,
          imageModel: opts.imageModel,
        });
  try {
    try {
      result = await generateOnce();
    } catch (first) {
      const m = first instanceof Error ? first.message : "";
      if (!/не вернул картинку/i.test(m)) throw first;
      console.warn("[scene render] no image from model — retrying once");
      result = await generateOnce();
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Неизвестная ошибка рендера";
    const msg = /не вернул картинку/i.test(raw) ? "AI не вернул картинку. Попробуйте ещё раз." : raw;
    console.error("[scene render] generation failed:", err);
    await markVisualizationFailed(viz.id, msg);
    throw new SceneRenderError(msg, 502);
  }
  const aiMs = Date.now() - tAi;

  const tComp = Date.now();
  let renderBuf: Buffer = Buffer.from(result.imageBase64, "base64");
  let renderMime = result.imageMime;
  const sharp = (await import("sharp")).default;

  // === ЗАМОРОЗКА ПОТОЛКА === (см. комментарии в истории render/route.ts)
  // compositeWithMask(original, rendered, mask): белое в маске → rendered(3D), чёрное → AI.
  if (!hasReference && hasCeilingMask) {
    try {
      let maskBuf = opts.preloaded?.ceilingMask;
      if (!maskBuf && markup.ceilingMaskUrl) {
        const maskRes = await fetch(markup.ceilingMaskUrl);
        if (maskRes.ok) maskBuf = Buffer.from(await maskRes.arrayBuffer());
        else console.warn(`[scene render] mask fetch failed HTTP ${maskRes.status} — skip freeze`);
      }
      if (maskBuf) {
        const sceneMeta = await sharp(sceneBuf).metadata();
        renderBuf = await sharp(renderBuf)
          .resize(sceneMeta.width, sceneMeta.height, { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
        renderBuf = await compositeWithMask(renderBuf, sceneBuf, maskBuf);
        renderMime = "image/jpeg";
      }
    } catch (e) {
      console.warn("[scene render] ceiling freeze failed, using raw AI render:", e);
    }
  }

  // === ДЕТЕРМИНИРОВАННОЕ СВЕЧЕНИЕ ПАРЯЩЕГО ===
  if (!hasReference && (markup.floatingMaskUrl || opts.preloaded?.floatingMask)) {
    try {
      let glowMaskBuf = opts.preloaded?.floatingMask;
      if (!glowMaskBuf && markup.floatingMaskUrl) {
        const glowRes = await fetch(markup.floatingMaskUrl);
        if (glowRes.ok) glowMaskBuf = Buffer.from(await glowRes.arrayBuffer());
      }
      if (glowMaskBuf) {
        renderBuf = await addPerimeterGlow(
          renderBuf,
          glowMaskBuf,
          typeof markup.kelvin === "number" ? markup.kelvin : undefined,
        );
        renderMime = "image/jpeg";
      }
    } catch (e) {
      console.warn("[scene render] floating glow failed, continuing:", e);
    }
  }
  const compositeMs = Date.now() - tComp;

  const tUp = Date.now();
  const renderExt = renderMime.includes("png") ? "png" : "jpg";
  const renderBlob = await put(`visualization/${masterId}/renders/${Date.now()}.${renderExt}`, renderBuf, {
    access: "public",
    contentType: renderMime,
    addRandomSuffix: true,
  });

  const inc = buildBillingIncrement(decision);
  const [render] = await prisma.$transaction([
    prisma.visualizationRender.create({
      data: {
        visualizationId: viz.id,
        url: renderBlob.url,
        prompt: result.prompt,
        modelUsed: result.modelUsed,
        costUsd: result.costUsd,
      },
    }),
    prisma.visualization.update({
      where: { id: viz.id },
      data: {
        status: "ready",
        ...(viz.publicHash ? {} : { publicHash: generatePublicHash() }),
      },
    }),
    ...(inc ? [prisma.master.update({ where: { id: masterId }, data: inc.data })] : []),
  ]);
  const uploadMs = Date.now() - tUp;

  const finalViz = await prisma.visualization.findUnique({ where: { id: viz.id }, select: { publicHash: true } });

  return {
    render: {
      id: render.id,
      url: render.url,
      modelUsed: render.modelUsed,
      costUsd: render.costUsd,
      createdAt: render.createdAt,
    },
    publicHash: finalViz?.publicHash ?? null,
    elapsedMs: result.elapsedMs,
    timings: { aiMs, compositeMs, uploadMs, totalMs: Date.now() - tStart },
  };
}
