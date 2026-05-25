// Replicate с FLUX-моделями: flux-dev-inpainting / flux-fill-pro / black-forest-labs/flux-kontext-pro.
// Использует REPLICATE_API_TOKEN (уже есть в .env.local).
// Запасной вариант на случай если FAL не зарегали — даёт примерно такое же качество.

export const PROVIDER_NAME = "replicate-flux-kontext";

// Используем black-forest-labs/flux-kontext-pro — instruction-based image edit, без маски.
// Аналог FAL FLUX Kontext Pro.
const MODEL = "black-forest-labs/flux-kontext-pro";

export async function generate({ photoUrl, prompt }) {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) throw new Error("REPLICATE_API_TOKEN not set");
  if (!photoUrl) throw new Error("replicate-flux requires public photoUrl");

  const t0 = Date.now();

  // Replicate official "models" run endpoint (no version needed for official BFL models)
  const createRes = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait=60", // sync: ждём до 60 сек
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_image: photoUrl,
        output_format: "jpg",
        safety_tolerance: 2,
      },
    }),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    return { ok: false, elapsedMs: Date.now() - t0, error: `replicate create ${createRes.status}: ${txt.slice(0, 500)}` };
  }
  let pred = await createRes.json();

  // Poll if still processing
  let attempts = 0;
  while (pred.status !== "succeeded" && pred.status !== "failed" && attempts++ < 60) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(pred.urls.get, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    pred = await pollRes.json();
  }
  const elapsedMs = Date.now() - t0;

  if (pred.status !== "succeeded") {
    return { ok: false, elapsedMs, error: `replicate status=${pred.status}: ${pred.error || ""}`, raw: JSON.stringify(pred).slice(0, 500) };
  }

  // output может быть строкой URL или массивом URL
  const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outUrl) {
    return { ok: false, elapsedMs, error: "no output URL", raw: JSON.stringify(pred).slice(0, 500) };
  }

  const imgRes = await fetch(outUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const ct = imgRes.headers.get("content-type") || "image/jpeg";

  return {
    ok: true,
    elapsedMs,
    imageMime: ct,
    imageBase64: buf.toString("base64"),
    imageUrl: outUrl,
  };
}
