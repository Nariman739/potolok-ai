// POST /api/visualizations/from-snapshot — «Фото клиенту» из мобильного приложения.
//
// Телефон шлёт JSON комнаты (снапшот конструктора) → создаём Visualization
// (sourceType scene3d, status pending) → отвечаем 202 сразу → в after() зовём
// рендер-воркер (Fly.io, headless Chromium). Воркер открывает /render-scene, снимает
// beauty + маску потолка + маску парящего и POST-ит их в /api/visualizations/[id]/frames,
// где запускается обычный AI-пайплайн (nano-banana → заморозка → свечение).
// Мобилка опрашивает GET /api/visualizations/[id] до status ready|failed.
//
// Body: { snapshot, kelvin?: 2700|4000|6500, finish?: "matte"|"satin"|"glossy",
//         floorPresetId?, wallPresetId?, ceilingColorId?, objectId? }
// 202:  { visualizationId, renderId, status: "pending", limit, used }

import { NextResponse, after } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeSnapshot,
  presetsFromRequest,
  validateSnapshot,
  SnapshotError,
} from "@/lib/scene-snapshot";
import {
  CEILING_COLORS,
  getFloorPreset,
  getLightTempByKey,
  getWallPreset,
} from "@/components/room-3d/constants";
import {
  PHOTO_FOR_CLIENT_ORIGIN,
  photoForClientMonthlyLimit,
  photoForClientUsedThisMonth,
} from "@/lib/photo-for-client";
import { markVisualizationFailed } from "@/lib/scene-render";

// Ответ 202 мгновенный; after() держит функцию, пока воркер рендерит (Chromium ~10-25 с
// + AI ~15-25 с внутри /frames). Запас под холодный старт машины Fly.
export const maxDuration = 300;

const MAX_BODY_BYTES = 400_000; // снапшоты до ~200 КБ + запас
const VALID_KELVIN = new Set([2700, 4000, 6500]);
const VALID_FINISH = new Set(["matte", "satin", "glossy"]);
const WORKER_TIMEOUT_MS = 240_000;

export async function POST(request: Request) {
  let master;
  try {
    master = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Снапшот слишком большой" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }

  let snapshot;
  try {
    snapshot = validateSnapshot(body.snapshot);
  } catch (e) {
    const msg = e instanceof SnapshotError ? e.message : "Невалидный снапшот";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (body.kelvin !== undefined && !VALID_KELVIN.has(body.kelvin as number)) {
    return NextResponse.json({ error: "kelvin: 2700 | 4000 | 6500" }, { status: 400 });
  }
  if (body.finish !== undefined && !VALID_FINISH.has(body.finish as string)) {
    return NextResponse.json({ error: "finish: matte | satin | glossy" }, { status: 400 });
  }

  const workerUrl = process.env.RENDER_WORKER_URL;
  if (!workerUrl || !process.env.RENDER_WORKER_SECRET) {
    console.error("[from-snapshot] RENDER_WORKER_URL / RENDER_WORKER_SECRET не заданы");
    return NextResponse.json({ error: "Сервис фото временно недоступен" }, { status: 503 });
  }

  // --- лимит: 10/мес на мастера (свой счётчик, см. photo-for-client.ts) ---
  const limit = photoForClientMonthlyLimit();
  const used = await photoForClientUsedThisMonth(master.id);
  if (!master.isOwner && used >= limit) {
    return NextResponse.json(
      { error: `Лимит «Фото клиенту» — ${limit} в месяц. Новые будут доступны с 1-го числа.`, limit, used },
      { status: 402 },
    );
  }

  const scene = normalizeSnapshot(snapshot);
  const presets = presetsFromRequest(snapshot, body);
  const color = CEILING_COLORS.find((c) => c.id === presets.colorId) ?? CEILING_COLORS[0];
  const light = getLightTempByKey(presets.lightTempKey);
  const floor = presets.floorId ? getFloorPreset(presets.floorId) : null;
  const wall = presets.wallId ? getWallPreset(presets.wallId) : null;
  const extra: string[] = [];
  if (scene.shadowGapWalls.length > 0) {
    extra.push(
      "The stretch ceiling uses a SHADOW-GAP profile: a thin, even dark recessed gap (about 1 cm) runs where the ceiling meets the walls — keep it crisp, no cornice/moulding.",
    );
  }
  // Подмена модели — только для владельца (A/B сравнение моделей), мастерам игнорим.
  const imageModel =
    master.isOwner && typeof body.imageModel === "string" && body.imageModel.length < 80 ? body.imageModel : undefined;
  const renderId = randomBytes(6).toString("hex");

  const viz = await prisma.visualization.create({
    data: {
      masterId: master.id,
      objectId: typeof body.objectId === "string" ? body.objectId : null,
      sourceType: "scene3d",
      originalUrl: "", // заполнит /frames (beauty-кадр из воркера)
      status: "pending",
      markup: {
        origin: PHOTO_FOR_CLIENT_ORIGIN,
        renderId,
        elements: scene.elements,
        finish: presets.finish,
        ceilingMaskUrl: null,
        floatingMaskUrl: null,
        colorHex: color.hex,
        colorName: color.label,
        kelvin: light.kelvin,
        lightTempKey: light.key,
        lightTempPromptHint: light.promptHint,
        linkedVariants: [],
        floorPresetId: floor?.id ?? null,
        floorPromptDesc: floor?.promptDesc ?? null,
        wallPresetId: wall?.id ?? null,
        wallPromptDesc: wall?.promptDesc ?? null,
        extraPrompt: extra.length ? extra.join(" ") : null,
        profileSummary: scene.profileSummary,
        imageModel: imageModel ?? null,
        presets,
        snapshot, // для повторного рендера/отладки (≤200 КБ)
        requestedAt: new Date().toISOString(),
      } as unknown as object,
    },
  });

  const appOrigin = process.env.RENDER_APP_ORIGIN || new URL(request.url).origin;

  after(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-render-secret": process.env.RENDER_WORKER_SECRET!,
        },
        body: JSON.stringify({ visualizationId: viz.id, renderId, snapshot, presets, appOrigin }),
        signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      });
      const text = await res.text();
      console.log(`[from-snapshot] worker ${res.status} in ${Date.now() - t0}ms viz=${viz.id}: ${text.slice(0, 300)}`);
      if (!res.ok) {
        const cur = await prisma.visualization.findUnique({ where: { id: viz.id }, select: { status: true } });
        if (cur && cur.status !== "ready") {
          await markVisualizationFailed(viz.id, `Рендер-воркер: HTTP ${res.status}`);
        }
      }
    } catch (e) {
      console.error(`[from-snapshot] worker call failed viz=${viz.id}:`, e);
      const cur = await prisma.visualization.findUnique({ where: { id: viz.id }, select: { status: true } });
      if (cur && cur.status !== "ready") {
        await markVisualizationFailed(viz.id, "Рендер-воркер недоступен");
      }
    }
  });

  return NextResponse.json(
    { visualizationId: viz.id, renderId, status: "pending", limit, used: used + 1 },
    { status: 202 },
  );
}
