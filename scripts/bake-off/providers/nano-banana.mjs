// Gemini 2.5 Flash Image (Nano Banana) через OpenRouter.
// Без маски — instruction-based edit.
// Использует existing openai SDK (drop-in для OpenRouter).

import OpenAI from "openai";

export const PROVIDER_NAME = "nano-banana";

export async function generate({ photoBase64, mimeType, prompt }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://potolok.ai",
      "X-Title": "potolok.ai bake-off",
    },
  });

  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: "google/gemini-2.5-flash-image",
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${photoBase64}` },
          },
        ],
      },
    ],
  });
  const elapsedMs = Date.now() - t0;

  const msg = res.choices?.[0]?.message;
  const imageUrl = msg?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    return {
      ok: false,
      elapsedMs,
      error: "No image in response",
      raw: JSON.stringify(res).slice(0, 1000),
    };
  }

  // imageUrl is data:image/png;base64,...
  const m = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
  if (!m) {
    return { ok: false, elapsedMs, error: `Unexpected image URL format: ${imageUrl.slice(0, 80)}` };
  }

  return {
    ok: true,
    elapsedMs,
    imageMime: m[1],
    imageBase64: m[2],
    usage: res.usage,
    finishReason: res.choices?.[0]?.finish_reason,
  };
}
