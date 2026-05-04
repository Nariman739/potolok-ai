// AI photoreal ceiling render через Replicate (Flux Fill Pro).
// Pipeline: фото комнаты + автомаска верхней части → inpaint → фоторендер с
// натяжным потолком нужного цвета и финиша. Результат загружается в Vercel Blob.

import Replicate from "replicate";
import { put } from "@vercel/blob";
import sharp from "sharp";

export type CeilingFinish = "matte" | "satin" | "glossy";

export interface CeilingRenderInput {
  imageUrl: string; // Исходное фото комнаты (любой URL, Replicate сам скачает)
  finish: CeilingFinish;
  colorHex: string; // "#FFFFFF" / "#000000" и т.п.
  colorName?: string; // "белый", "графитовый" — для prompt в человеческом виде
  /** Доля высоты сверху, которую считаем потолком (0..1). Default 0.4. */
  topMaskRatio?: number;
  /** Папка в Vercel Blob — обычно `ai-ceiling/<masterId>/`. */
  blobFolder?: string;
}

export interface CeilingRenderOutput {
  url: string;
  promptUsed: string;
  modelVersion: string;
  costUsd: number;
}

const REPLICATE_MODEL = "black-forest-labs/flux-fill-pro";
const COST_PER_RUN_USD = 0.05; // Flux Fill Pro

const FINISH_DESCRIPTORS: Record<CeilingFinish, string> = {
  matte: "matte finish, soft and non-reflective surface, smooth texture",
  satin: "satin finish, slight sheen, soft reflection of room light",
  glossy: "high-gloss mirror finish, sharp reflections of the room",
};

function buildPrompt(input: CeilingRenderInput): string {
  const finish = FINISH_DESCRIPTORS[input.finish];
  const colorHuman = input.colorName ?? input.colorHex;
  return [
    `modern stretched PVC ceiling with ${finish}`,
    `color ${colorHuman}`,
    "perfectly flat smooth ceiling surface installed across the whole room top",
    "professional interior photograph",
    "soft natural daylight, realistic shadows and reflections",
    "photorealistic, ultra-detailed, 4k",
  ].join(", ");
}

/**
 * Генерирует маску того же размера что исходное изображение: верхние topMaskRatio
 * пикселей по высоте — белые (область inpaint), остальное чёрное (сохранить).
 * Простой baseline для MVP — без сегментации, но в большинстве комнат достаточно.
 */
async function buildTopMaskFromImage(
  imageUrl: string,
  topRatio: number,
): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Не удалось загрузить фото: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const meta = await sharp(Buffer.from(arrayBuffer)).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const cutoff = Math.round(height * topRatio);

  // Белый прямоугольник сверху + чёрный снизу
  const top = await sharp({
    create: {
      width,
      height: cutoff,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  const bottom = await sharp({
    create: {
      width,
      height: height - cutoff,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  return await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: top, top: 0, left: 0 },
      { input: bottom, top: cutoff, left: 0 },
    ])
    .png()
    .toBuffer();
}

export async function generateCeilingRender(
  input: CeilingRenderInput,
): Promise<CeilingRenderOutput> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN не настроен в окружении");
  }

  const replicate = new Replicate({ auth: token });
  const prompt = buildPrompt(input);
  const topRatio = input.topMaskRatio ?? 0.4;

  // 1) Генерируем маску в памяти и грузим её в Blob (Replicate принимает только URL)
  const maskBuffer = await buildTopMaskFromImage(input.imageUrl, topRatio);
  const maskBlob = await put(
    `${input.blobFolder ?? "ai-ceiling/masks"}/${Date.now()}-mask.png`,
    maskBuffer,
    { access: "public", contentType: "image/png", addRandomSuffix: true },
  );

  // 2) Запускаем Flux Fill Pro
  const output = await replicate.run(REPLICATE_MODEL, {
    input: {
      image: input.imageUrl,
      mask: maskBlob.url,
      prompt,
      output_format: "jpg",
      safety_tolerance: 2,
      prompt_upsampling: false,
    },
  });

  // Replicate возвращает либо URL-строку, либо ReadableStream/массив. Нормализуем:
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

  // 3) Скачиваем результат и заливаем в наш Blob (чтобы не зависеть от Replicate CDN)
  const renderedRes = await fetch(resultUrl);
  if (!renderedRes.ok) throw new Error(`Не скачали результат: HTTP ${renderedRes.status}`);
  const renderedBuf = Buffer.from(await renderedRes.arrayBuffer());
  const finalBlob = await put(
    `${input.blobFolder ?? "ai-ceiling/renders"}/${Date.now()}.jpg`,
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
