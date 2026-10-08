// POST /api/visualizations/[id]/frames — ВНУТРЕННИЙ эндпоинт рендер-воркера.
// Авторизация — заголовок x-render-secret (= env RENDER_WORKER_SECRET), не сессия.
//
// Body (успех): { beauty, ceilingMask, floatingMask: data-URL, width, height, timings? }
// Body (сбой):  { error: "текст", timings? }
// Принимает кадры headless-сцены → Blob → запускает тот же AI-путь, что и веб-кнопка
// «AI-фото» (runSceneRender: nano-banana → заморозка потолка → свечение парящего).
// Отвечает, когда картинка готова (воркер держит соединение — так машина Fly
// не засыпает посреди работы).

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { checkRenderSecret, PHOTO_FOR_CLIENT_ORIGIN } from "@/lib/photo-for-client";
import { markVisualizationFailed, runSceneRender, SceneRenderError } from "@/lib/scene-render";
import type { BillingCheckResult } from "@/lib/visualization-billing";

export const maxDuration = 120;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function decodeDataUrl(dataUrl: unknown): { buf: Buffer; mime: string } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
  return { buf, mime: m[1] };
}

/** Есть ли в маске хоть один белый пиксель (иначе парящего нет — свечение не нужно). */
async function maskHasContent(buf: Buffer): Promise<boolean> {
  const sharp = (await import("sharp")).default;
  const stats = await sharp(buf).greyscale().stats();
  return (stats.channels[0]?.max ?? 0) > 16;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkRenderSecret(request.headers.get("x-render-secret"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }
  const { id } = await params;
  const t0 = Date.now();

  const viz = await prisma.visualization.findUnique({ where: { id } });
  const markup = (viz?.markup && typeof viz.markup === "object" ? viz.markup : {}) as Record<string, unknown>;
  if (!viz || markup.origin !== PHOTO_FOR_CLIENT_ORIGIN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (viz.status !== "pending" && viz.status !== "rendering") {
    return NextResponse.json({ error: `status ${viz.status}` }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    await markVisualizationFailed(id, "Воркер прислал невалидный JSON");
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const workerTimings = body.timings && typeof body.timings === "object" ? body.timings : null;

  if (typeof body.error === "string") {
    await markVisualizationFailed(id, `Сцена не отрисовалась: ${body.error}`);
    return NextResponse.json({ ok: false });
  }

  const beauty = decodeDataUrl(body.beauty);
  const ceilingMask = decodeDataUrl(body.ceilingMask);
  const floatingMask = decodeDataUrl(body.floatingMask);
  if (!beauty || !ceilingMask) {
    await markVisualizationFailed(id, "Воркер не прислал кадры");
    return NextResponse.json({ error: "frames missing" }, { status: 400 });
  }

  // --- кадры → Blob (тот же формат, что у веб-кнопки «AI-фото») ---
  const tUp = Date.now();
  const hasFloating = floatingMask ? await maskHasContent(floatingMask.buf).catch(() => false) : false;
  const ext = (mime: string) => (mime === "image/jpeg" ? "jpg" : mime.split("/")[1]);
  const upload = (b: { buf: Buffer; mime: string }, kind: string) =>
    put(`visualization/${viz.masterId}/${kind}/${Date.now()}.${ext(b.mime)}`, b.buf, {
      access: "public",
      contentType: b.mime,
      addRandomSuffix: true,
    }).then((r) => r.url);
  const [originalUrl, ceilingMaskUrl, floatingMaskUrl] = await Promise.all([
    upload(beauty, "scene3d"),
    upload(ceilingMask, "ceiling-mask"),
    hasFloating && floatingMask ? upload(floatingMask, "floating-mask") : Promise.resolve(null),
  ]);
  const framesUploadMs = Date.now() - tUp;

  const newMarkup = {
    ...markup,
    ceilingMaskUrl,
    floatingMaskUrl,
    frameSize: { width: body.width ?? null, height: body.height ?? null },
    workerTimings,
  };
  const updated = await prisma.visualization.update({
    where: { id },
    data: { originalUrl, status: "rendering", markup: newMarkup as unknown as object },
  });

  // Лимит «Фото клиенту» уже проверен в from-snapshot (свой счётчик по записям) —
  // общие счётчики квоты веб-визуализаций не трогаем.
  const decision: BillingCheckResult = { allowed: true, increment: null, remaining: 0, bucket: "monthly" };

  try {
    const r = await runSceneRender({
      viz: updated,
      decision,
      masterId: viz.masterId,
      imageModel: typeof markup.imageModel === "string" ? markup.imageModel : undefined,
      preloaded: {
        scene: beauty.buf,
        sceneMime: beauty.mime,
        ceilingMask: ceilingMask.buf,
        floatingMask: hasFloating ? floatingMask?.buf : undefined,
      },
    });
    const serverTimings = { framesUploadMs, ...r.timings, framesEndpointMs: Date.now() - t0 };
    // Тайминги для отчёта/мониторинга — в markup (статус уже ready).
    const cur = await prisma.visualization.findUnique({ where: { id }, select: { markup: true } });
    await prisma.visualization.update({
      where: { id },
      data: {
        markup: {
          ...((cur?.markup as Record<string, unknown>) ?? newMarkup),
          serverTimings,
          readyAt: new Date().toISOString(),
        } as unknown as object,
      },
    });
    return NextResponse.json({
      ok: true,
      renderUrl: r.render.url,
      modelUsed: r.render.modelUsed,
      costUsd: r.render.costUsd,
      timings: serverTimings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка AI-рендера";
    if (!(e instanceof SceneRenderError)) await markVisualizationFailed(id, msg);
    console.error(`[frames] render failed viz=${id}:`, e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
