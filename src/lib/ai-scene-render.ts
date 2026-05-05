// AI-фоторендер ИЗ 3D-сцены (snapshot R3F → фотореалистичный кадр).
// Используется Flux Kontext Pro: модель берёт исходное изображение + текстовый
// prompt и делает «фотореалистичную версию» сохраняя геометрию (стены, потолок,
// мебель, окна остаются на тех же местах). Без масок и без depth-карты.

import Replicate from "replicate";
import { put } from "@vercel/blob";

export type CeilingFinish = "matte" | "satin" | "glossy";

export interface SceneRenderInput {
  /** URL snapshot R3F-сцены (PNG, уже залит в Vercel Blob) или data URL */
  imageUrl: string;
  /** Финиш потолка — для уточнения промпта */
  finish?: CeilingFinish;
  /** Hex цвета потолка */
  colorHex?: string;
  /** Человеческое название цвета (для prompt) */
  colorName?: string;
  /** Куда сохранять результат в Vercel Blob */
  blobFolder?: string;
  /** Дополнительный кастомный текст в промпт */
  extraPrompt?: string;
}

export interface SceneRenderOutput {
  url: string;
  promptUsed: string;
  modelVersion: string;
  costUsd: number;
}

const REPLICATE_MODEL = "black-forest-labs/flux-kontext-pro";
const COST_PER_RUN_USD = 0.04;

const FINISH_DESCRIPTORS: Record<CeilingFinish, string> = {
  matte: "matte stretched ceiling, soft non-reflective surface",
  satin: "satin stretched ceiling, slight sheen, soft reflections",
  glossy: "high-gloss stretched ceiling with mirror-like reflections of the room",
};

function buildPrompt(input: SceneRenderInput): string {
  const finish = input.finish ? FINISH_DESCRIPTORS[input.finish] : "stretched PVC ceiling";
  const colorHuman = input.colorName ?? input.colorHex ?? "white";
  const parts = [
    "transform this 3D rendering into a photorealistic interior photograph",
    "preserve exact room geometry, furniture placement, light fixtures, doors and windows positions",
    `${finish}, color ${colorHuman}`,
    "professional interior photography, soft natural daylight from windows",
    "realistic textures on walls and floor, realistic furniture materials",
    "warm cozy atmosphere, ultra-detailed, sharp focus, 4k",
  ];
  if (input.extraPrompt) parts.push(input.extraPrompt);
  return parts.join(", ");
}

export async function renderSceneToPhoto(
  input: SceneRenderInput,
): Promise<SceneRenderOutput> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN не настроен на сервере");
  }

  const replicate = new Replicate({ auth: token });
  const prompt = buildPrompt(input);

  const output = await replicate.run(REPLICATE_MODEL, {
    input: {
      prompt,
      input_image: input.imageUrl,
      output_format: "jpg",
      safety_tolerance: 2,
      aspect_ratio: "match_input_image",
    },
  });

  // Replicate возвращает либо строку URL, либо массив, либо объект с .url()
  let resultUrl: string | null = null;
  if (typeof output === "string") {
    resultUrl = output;
  } else if (Array.isArray(output) && typeof output[0] === "string") {
    resultUrl = output[0];
  } else if (output && typeof (output as { url?: () => URL }).url === "function") {
    resultUrl = (output as { url: () => URL }).url().toString();
  }
  if (!resultUrl) {
    throw new Error("Replicate вернул неожиданный формат ответа");
  }

  // Скачиваем результат и сохраняем в наш Blob (не зависим от Replicate CDN TTL)
  const renderedRes = await fetch(resultUrl);
  if (!renderedRes.ok) throw new Error(`Не скачали результат: HTTP ${renderedRes.status}`);
  const renderedBuf = Buffer.from(await renderedRes.arrayBuffer());
  const finalBlob = await put(
    `${input.blobFolder ?? "ai-scene/renders"}/${Date.now()}.jpg`,
    renderedBuf,
    { access: "public", contentType: "image/jpeg", addRandomSuffix: true },
  );

  return {
    url: finalBlob.url,
    promptUsed: prompt,
    modelVersion: REPLICATE_MODEL,
    costUsd: COST_PER_RUN_USD,
  };
}
