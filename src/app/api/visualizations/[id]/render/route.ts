// POST /api/visualizations/[id]/render
// Запускает фоторендер: списывает кредит → вызывает provider (Nano Banana по умолчанию)
// → сохраняет результат в Vercel Blob → создаёт VisualizationRender запись.

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateVisualization,
  describeReferenceCeiling,
  type VisualizationOptions,
  type VisualizationProvider,
  type AttachmentType,
  type CeilingFinish,
  type ChandelierType,
} from "@/lib/ai-visualization";
import {
  generatePolygonMask,
  getImageDimensions,
  compositeWithMask,
  generateMarkupOverlay,
} from "@/lib/visualization-mask";
import { buildScenePrompt, buildHybridScenePrompt } from "@/lib/ai-scene-prompt";
import type { RoomElement } from "@/lib/room-types";

// Nano Banana отвечает за 15-25 сек, FLUX Kontext до 60 сек → ставим 90 для запаса.
export const maxDuration = 90;

interface MarkupBody {
  points: Array<{ id: string; type: "spot" | "chandelier"; x: number; y: number; elementId?: string }>;
  lines: Array<{ id: string; type: "track" | "lightline"; x1: number; y1: number; x2: number; y2: number; elementId?: string }>;
  ceilingPolygon?: Array<{ x: number; y: number }>;
}

function serializeMarkupToText(
  markup: MarkupBody | undefined,
  preparedElements: Array<{ name: string }>,
): string | undefined {
  if (!markup) return undefined;
  if (markup.points.length === 0 && markup.lines.length === 0) return undefined;

  const lines: string[] = [];
  const trackCount = markup.lines.filter((l) => l.type === "track").length;
  const lightlineCount = markup.lines.filter((l) => l.type === "lightline").length;
  const spotCount = markup.points.filter((p) => p.type === "spot").length;
  const chandelierCount = markup.points.filter((p) => p.type === "chandelier").length;

  // КРИТИЧНО: явно говорим итоговое кол-во каждого типа, чтобы модель не сливала параллельные элементы.
  const counts: string[] = [];
  if (trackCount > 0) counts.push(`EXACTLY ${trackCount} separate magnetic track${trackCount > 1 ? "s" : ""}`);
  if (lightlineCount > 0) counts.push(`EXACTLY ${lightlineCount} separate linear LED light line${lightlineCount > 1 ? "s" : ""}`);
  if (spotCount > 0) counts.push(`EXACTLY ${spotCount} recessed spotlight${spotCount > 1 ? "s" : ""}`);
  if (chandelierCount > 0) counts.push(`EXACTLY ${chandelierCount} chandelier${chandelierCount > 1 ? "s" : ""}`);
  if (counts.length > 0) {
    lines.push(
      "TOTAL FIXTURE COUNT — you MUST install ALL of these on the ceiling (do NOT skip, do NOT merge parallel items into one):",
      ...counts.map((c) => `- ${c}`),
      "",
    );
  }

  markup.lines.forEach((l, i) => {
    const sameTypeBefore = markup.lines.filter((x, j) => j < i && x.type === l.type).length;
    const num = sameTypeBefore + 1;
    const kind = l.type === "track" ? "Magnetic track" : "Linear LED light line";
    const fmt = (n: number) => `${n.toFixed(0)}%`;
    lines.push(
      `- ${kind} #${num}: install as a SEPARATE fixture along a straight line from (${fmt(l.x1)}, ${fmt(l.y1)}) to (${fmt(l.x2)}, ${fmt(l.y2)}) on the ceiling. This is a DISTINCT physical fixture — do NOT merge it with other tracks even if they are parallel/nearby.${l.elementId ? " Use the matching element image provided." : ""}`,
    );
  });

  markup.points.forEach((p, i) => {
    const sameTypeBefore = markup.points.filter((x, j) => j < i && x.type === p.type).length;
    const num = sameTypeBefore + 1;
    const kind = p.type === "spot" ? "Recessed spotlight" : "Chandelier";
    const fmt = (n: number) => `${n.toFixed(0)}%`;
    lines.push(
      `- ${kind} #${num}: at coordinate (${fmt(p.x)}, ${fmt(p.y)}) on the ceiling.${p.elementId ? " Use the matching element image provided." : ""}`,
    );
  });

  if (preparedElements.length > 0) {
    lines.push(
      "",
      "Element reference images correspond to: " +
        preparedElements.map((el, i) => `image #${i + 1} = "${el.name}"`).join("; "),
    );
  }

  return lines.join("\n");
}

const VALID_ATTACHMENT: ReadonlySet<AttachmentType> = new Set(["regular", "shadow", "floating"]);
const VALID_FINISH: ReadonlySet<CeilingFinish> = new Set(["matte", "satin", "glossy"]);
const VALID_CHANDELIER: ReadonlySet<ChandelierType> = new Set([
  "none",
  "minimalist",
  "modern",
  "classic",
  "molecular",
]);
const VALID_SPOTS = new Set([0, 4, 6, 8]);
const VALID_PROVIDER: ReadonlySet<VisualizationProvider> = new Set([
  "nano-banana",
  "replicate-flux-kontext",
  "fal-flux-fill",
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const body = (await request.json()) as {
      options?: Partial<VisualizationOptions>;
      provider?: VisualizationProvider;
      variantName?: string;
      elements?: Array<{ elementId: string; quantity?: number; notes?: string }>;
      markup?: {
        points: Array<{ id: string; type: "spot" | "chandelier"; x: number; y: number; elementId?: string }>;
        lines: Array<{
          id: string;
          type: "track" | "lightline";
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          elementId?: string;
        }>;
        ceilingPolygon?: Array<{ x: number; y: number }>;
      };
    };

    // --- load visualization (нужно ДО валидации options, чтобы знать sourceType) ---
    const viz = await prisma.visualization.findFirst({
      where: { id, masterId: master.id },
    });
    if (!viz) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // --- check credits ---
    const fresh = await prisma.master.findUnique({
      where: { id: master.id },
      select: { visualizationCredits: true },
    });
    if (!fresh || fresh.visualizationCredits <= 0) {
      return NextResponse.json(
        { error: "Кредиты на визуализацию исчерпаны. Пополните в профиле." },
        { status: 402 },
      );
    }

    // === scene3d / scene2d ветка ===
    // Источник — снимок 3D-сцены (scene3d) или 2D-плана (scene2d). markup внутри viz
    // содержит { elements, finish, colorHex, colorName }. Опции reference-флоу не
    // требуются — геометрия полностью внутри snapshot'а.
    if (viz.sourceType === "scene3d" || viz.sourceType === "scene2d") {
      return renderFromScene(viz, fresh, master.id, body.provider);
    }

    // --- reference flow: validate options ---
    const opts = body.options ?? {};
    if (!opts.attachmentType || !VALID_ATTACHMENT.has(opts.attachmentType)) {
      return NextResponse.json(
        { error: "Тип примыкания: regular | shadow | floating" },
        { status: 400 },
      );
    }
    if (!opts.finish || !VALID_FINISH.has(opts.finish)) {
      return NextResponse.json({ error: "Финиш: matte | satin | glossy" }, { status: 400 });
    }
    const spotsCount = opts.spotsCount ?? 6;
    if (!VALID_SPOTS.has(spotsCount)) {
      return NextResponse.json({ error: "Спотов: 0, 4, 6 или 8" }, { status: 400 });
    }
    const chandelierType: ChandelierType = opts.chandelierType ?? "minimalist";
    if (!VALID_CHANDELIER.has(chandelierType)) {
      return NextResponse.json(
        { error: "Тип люстры: none | minimalist | modern | classic | molecular" },
        { status: 400 },
      );
    }
    const provider: VisualizationProvider = body.provider ?? "nano-banana";
    if (!VALID_PROVIDER.has(provider)) {
      return NextResponse.json(
        { error: "Provider: nano-banana | replicate-flux-kontext" },
        { status: 400 },
      );
    }

    // --- fetch photo + (optional) reference as base64 (for Nano Banana) ---
    const photoRes = await fetch(viz.originalUrl);
    if (!photoRes.ok) {
      return NextResponse.json({ error: "Не удалось загрузить исходное фото" }, { status: 500 });
    }
    const photoMime = photoRes.headers.get("content-type") || "image/jpeg";
    const photoBuf = Buffer.from(await photoRes.arrayBuffer());
    const photoBase64 = photoBuf.toString("base64");

    // --- (optional) generate PNG mask from ceilingPolygon → upload to Blob ---
    // Маска используется ДВУМЯ способами:
    //   1) Передаётся в FAL FLUX Fill (когда нет multi-image) как inpaint mask
    //   2) Применяется через sharp composite ПОСЛЕ рендера: где маска белая —
    //      берём rendered, где чёрная — оригинал. Это даёт hard-constraint
    //      "вне границы потолка пиксели НЕ меняются" даже для Nano Banana.
    let maskUrl: string | undefined;
    let maskBuf: Buffer | undefined;
    if (body.markup?.ceilingPolygon && body.markup.ceilingPolygon.length >= 3) {
      try {
        const dims = await getImageDimensions(photoBuf);
        // Расширяем полигон на 2% наружу (отрицательный inset): LED-свет от парящего
        // потолка физически попадает на верх стены, и эту зону тоже должна охватывать
        // маска чтобы AI-рендер не обрезался обратно к голому бетону. Если разметка
        // близка к краю фото — generatePolygonMask клиппит координаты внутри изображения.
        maskBuf = await generatePolygonMask(
          body.markup.ceilingPolygon,
          dims.width,
          dims.height,
          -2,
        );
        const maskBlob = await put(
          `visualization/${master.id}/masks/${Date.now()}.png`,
          maskBuf,
          { access: "public", contentType: "image/png", addRandomSuffix: true },
        );
        maskUrl = maskBlob.url;
        console.log(`[render] mask generated: ${dims.width}x${dims.height} → ${maskUrl}`);
      } catch (e) {
        console.warn("[render] mask generation failed, continuing without mask:", e);
      }
    }

    // --- (optional) generate ANNOTATED OVERLAY — фото со схемой разметки поверх ---
    // Это второе изображение для Nano Banana: AI видит ГЛАЗАМИ где должны стоять
    // фикстуры (LED-рамка, треки, споты) вместо текстовых координат.
    // Главный механизм точности позиционирования.
    let overlayBase64: string | undefined;
    let overlayMime: string | undefined;
    const hasAnyMarkup =
      body.markup &&
      (body.markup.points.length > 0 ||
        body.markup.lines.length > 0 ||
        (body.markup.ceilingPolygon?.length ?? 0) >= 3);
    if (hasAnyMarkup) {
      try {
        const overlayBuf = await generateMarkupOverlay(
          photoBuf,
          {
            points: body.markup!.points,
            lines: body.markup!.lines,
            ceilingPolygon: body.markup!.ceilingPolygon,
          },
          opts.attachmentType,
        );
        overlayBase64 = overlayBuf.toString("base64");
        overlayMime = "image/jpeg";
        console.log("[render] markup overlay generated");
      } catch (e) {
        console.warn("[render] overlay generation failed, continuing without:", e);
      }
    }

    // --- load elements from library (if requested) ---
    const elementRequests = body.elements ?? [];
    let preparedElements: Array<{
      name: string;
      category: string;
      imageBase64: string;
      mime: string;
      quantity: number;
      description?: string;
      notes?: string;
    }> = [];
    if (elementRequests.length > 0) {
      const elementIds = elementRequests.map((e) => e.elementId);
      const elements = await prisma.ceilingElement.findMany({
        where: { id: { in: elementIds }, masterId: master.id },
      });
      const byId = new Map(elements.map((el) => [el.id, el]));
      preparedElements = await Promise.all(
        elementRequests.map(async (req) => {
          const el = byId.get(req.elementId);
          if (!el) throw new Error(`Элемент ${req.elementId} не найден в библиотеке`);
          const r = await fetch(el.imageUrl);
          if (!r.ok) throw new Error(`Не удалось загрузить фото элемента "${el.name}"`);
          const mime = r.headers.get("content-type") || "image/jpeg";
          const imageBase64 = Buffer.from(await r.arrayBuffer()).toString("base64");
          return {
            name: el.name,
            category: el.category,
            imageBase64,
            mime,
            quantity: Math.max(1, Math.min(99, req.quantity ?? el.defaultQty)),
            description: el.description ?? undefined,
            notes: req.notes,
          };
        }),
      );
    }

    let referenceBase64: string | undefined;
    let referenceMime: string | undefined;
    let referenceDescription: string | undefined;
    if (viz.referenceUrl) {
      const refRes = await fetch(viz.referenceUrl);
      if (refRes.ok) {
        referenceMime = refRes.headers.get("content-type") || "image/jpeg";
        referenceBase64 = Buffer.from(await refRes.arrayBuffer()).toString("base64");

        // Двухступенчатый AI: сначала Claude vision детально описывает референс
        // → потом Nano Banana получает фото + описание = точнее копирует светильники.
        try {
          referenceDescription = await describeReferenceCeiling(referenceBase64, referenceMime);
          console.log("[render] reference description:", referenceDescription.slice(0, 200));
        } catch (e) {
          console.warn("[render] reference description failed, continuing:", e);
        }
      } else {
        console.warn("[render] reference fetch failed, continuing without it");
      }
    }

    // --- mark as rendering ---
    await prisma.visualization.update({
      where: { id: viz.id },
      data: { status: "rendering" },
    });

    // --- run provider ---
    const options: VisualizationOptions = {
      attachmentType: opts.attachmentType,
      finish: opts.finish,
      colorName: opts.colorName,
      ledStrip: opts.ledStrip ?? opts.attachmentType === "floating",
      spotsCount: spotsCount as 0 | 4 | 6 | 8,
      chandelierType,
      extraPrompt: opts.extraPrompt,
      removeOldFixtures: opts.removeOldFixtures ?? false,
      // Если есть overlay — координатный текст не нужен (картинка важнее текста).
      // Если overlay не сгенерился — fallback на текстовое описание разметки.
      markupText: overlayBase64 ? undefined : serializeMarkupToText(body.markup, preparedElements),
    };

    let result;
    try {
      result = await generateVisualization({
        photoUrl: viz.originalUrl,
        photoBase64,
        photoMime,
        overlayBase64,
        overlayMime,
        referenceUrl: viz.referenceUrl ?? undefined,
        referenceBase64,
        referenceMime,
        referenceDescription,
        elements: preparedElements.length > 0 ? preparedElements : undefined,
        maskUrl,
        options,
        provider,
      });
    } catch (err) {
      await prisma.visualization.update({
        where: { id: viz.id },
        data: { status: "failed" },
      });
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка рендера";
      console.error("[visualizations render] generation failed:", err);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // --- save result to Blob ---
    let renderBuf = Buffer.from(result.imageBase64, "base64");
    let renderExt = result.imageMime.includes("png") ? "png" : "jpg";
    let renderMime = result.imageMime;

    // Если есть маска — применяем hard-constraint composite через sharp:
    // вне белой зоны маски → оригинальные пиксели фото (стены/пол/мебель не меняются).
    if (maskBuf) {
      try {
        const composited = await compositeWithMask(photoBuf, renderBuf, maskBuf);
        renderBuf = Buffer.from(composited);
        renderExt = "jpg";
        renderMime = "image/jpeg";
        console.log("[render] mask composite applied — outside mask = original pixels");
      } catch (e) {
        console.warn("[render] composite failed, using raw render:", e);
      }
    }

    const renderBlob = await put(
      `visualization/${master.id}/renders/${Date.now()}.${renderExt}`,
      renderBuf,
      { access: "public", contentType: renderMime, addRandomSuffix: true },
    );

    // --- persist render + decrement credit + sync element links ---
    const elementCreateData = elementRequests.map((req, i) => ({
      visualizationId: viz.id,
      elementId: req.elementId,
      quantity: preparedElements[i]?.quantity ?? 1,
      notes: req.notes ?? null,
      sortOrder: i,
    }));

    const [render] = await prisma.$transaction([
      prisma.visualizationRender.create({
        data: {
          visualizationId: viz.id,
          url: renderBlob.url,
          prompt: result.prompt,
          modelUsed: result.modelUsed,
          costUsd: result.costUsd,
          variantName: body.variantName ?? null,
        },
      }),
      prisma.visualization.update({
        where: { id: viz.id },
        data: {
          status: "ready",
          markup: {
            options: options as unknown as object,
            drawing: body.markup ?? null,
          } as unknown as object,
        },
      }),
      prisma.master.update({
        where: { id: master.id },
        data: { visualizationCredits: { decrement: 1 } },
      }),
      // Перезаписываем связи: сначала чистим старые, потом создаём новые.
      prisma.visualizationElement.deleteMany({ where: { visualizationId: viz.id } }),
      ...(elementCreateData.length > 0
        ? [prisma.visualizationElement.createMany({ data: elementCreateData })]
        : []),
    ]);

    return NextResponse.json({
      render: {
        id: render.id,
        url: render.url,
        modelUsed: render.modelUsed,
        costUsd: render.costUsd,
        createdAt: render.createdAt,
      },
      elapsedMs: result.elapsedMs,
      creditsLeft: fresh.visualizationCredits - 1,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualizations render] error:", error);
    return NextResponse.json({ error: "Ошибка рендера" }, { status: 500 });
  }
}

// === scene3d/scene2d рендер ===
// Отдельный path без mask/overlay/preparedElements — геометрия передаётся через snapshot.
// При наличии referenceUrl используется гибридный multi-image flow (фото комнаты + сцена).
async function renderFromScene(
  viz: {
    id: string;
    sourceType: string;
    originalUrl: string;
    referenceUrl: string | null;
    markup: unknown;
  },
  fresh: { visualizationCredits: number },
  masterId: string,
  providerOverride?: VisualizationProvider,
): Promise<NextResponse> {
  // --- parse markup ---
  const markup = (viz.markup ?? {}) as {
    elements?: RoomElement[];
    finish?: CeilingFinish;
    colorHex?: string;
    colorName?: string;
    extraPrompt?: string;
  };
  const elements = Array.isArray(markup.elements) ? markup.elements : [];
  const finish: CeilingFinish = (markup.finish as CeilingFinish) ?? "matte";

  // --- fetch scene snapshot (PNG из R3F или 2D-плана) как base64 ---
  const sceneRes = await fetch(viz.originalUrl);
  if (!sceneRes.ok) {
    return NextResponse.json({ error: "Не удалось загрузить снимок сцены" }, { status: 500 });
  }
  const sceneMime = sceneRes.headers.get("content-type") || "image/png";
  const sceneBase64 = Buffer.from(await sceneRes.arrayBuffer()).toString("base64");

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
        referenceDescription = await describeReferenceCeiling(referenceBase64, referenceMime);
      } catch (e) {
        console.warn("[scene render] reference description failed:", e);
      }
    }
  }

  const hasReference = Boolean(referenceBase64 && referenceMime);
  const sourceType = viz.sourceType as "scene3d" | "scene2d";

  const customPrompt = hasReference
    ? buildHybridScenePrompt({
        elements,
        finish,
        colorHex: markup.colorHex,
        colorName: markup.colorName,
        extraPrompt: markup.extraPrompt,
        sourceType,
        referenceDescription,
      })
    : buildScenePrompt({
        elements,
        finish,
        colorHex: markup.colorHex,
        colorName: markup.colorName,
        extraPrompt: markup.extraPrompt,
        sourceType,
      });

  // FLUX Kontext не умеет multi-image, при гибриде форсим nano-banana.
  const provider: VisualizationProvider =
    hasReference ? "nano-banana" : providerOverride ?? "nano-banana";

  // Заглушка options — реально используется только customPrompt + photo/reference.
  const options: VisualizationOptions = {
    attachmentType: "regular",
    finish,
    colorName: markup.colorName,
    spotsCount: 6,
    chandelierType: "minimalist",
  };

  await prisma.visualization.update({
    where: { id: viz.id },
    data: { status: "rendering" },
  });

  let result;
  try {
    // ВАЖНО: для гибрида фото комнаты передаётся как ПЕРВОЕ изображение (photo*),
    // снимок 3D-сцены — как ВТОРОЕ (overlay*). Промпт описывает image-1 как
    // реальную комнату, image-2 как схему потолка.
    if (hasReference) {
      result = await generateVisualization({
        photoUrl: viz.referenceUrl!,
        photoBase64: referenceBase64,
        photoMime: referenceMime,
        overlayBase64: sceneBase64,
        overlayMime: sceneMime,
        options,
        provider,
        customPrompt,
      });
    } else {
      result = await generateVisualization({
        photoUrl: viz.originalUrl,
        photoBase64: sceneBase64,
        photoMime: sceneMime,
        options,
        provider,
        customPrompt,
      });
    }
  } catch (err) {
    await prisma.visualization.update({
      where: { id: viz.id },
      data: { status: "failed" },
    });
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка рендера";
    console.error("[scene render] generation failed:", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const renderBuf = Buffer.from(result.imageBase64, "base64");
  const renderExt = result.imageMime.includes("png") ? "png" : "jpg";
  const renderBlob = await put(
    `visualization/${masterId}/renders/${Date.now()}.${renderExt}`,
    renderBuf,
    { access: "public", contentType: result.imageMime, addRandomSuffix: true },
  );

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
      data: { status: "ready" },
    }),
    prisma.master.update({
      where: { id: masterId },
      data: { visualizationCredits: { decrement: 1 } },
    }),
  ]);

  return NextResponse.json({
    render: {
      id: render.id,
      url: render.url,
      modelUsed: render.modelUsed,
      costUsd: render.costUsd,
      createdAt: render.createdAt,
    },
    elapsedMs: result.elapsedMs,
    creditsLeft: fresh.visualizationCredits - 1,
  });
}
