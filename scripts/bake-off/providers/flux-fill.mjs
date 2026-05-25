// FLUX.1 Pro Fill через FAL — inpaint с маской (или без, тогда модель ищет область сама).
// Цена: $0.05 за 1MP. SDK: @fal-ai/client.
//
// Этот провайдер опционален — нужен FAL_KEY и dep `@fal-ai/client`.
// На MVP без маски можно вызвать без mask_url, но FLUX Fill в этом случае требует
// какой-то регион — поэтому полноценно используется в Этапе 2 (когда маска готова).

export const PROVIDER_NAME = "flux-fill";

export async function generate({ photoUrl, maskUrl, prompt }) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY not set");
  if (!photoUrl) throw new Error("flux-fill requires a public photoUrl (FAL не принимает data:)");

  const t0 = Date.now();
  const submitRes = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: photoUrl,
      mask_url: maskUrl, // optional на этом этапе
      num_images: 1,
      output_format: "jpeg",
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    return { ok: false, elapsedMs: Date.now() - t0, error: `submit failed ${submitRes.status}: ${txt.slice(0, 500)}` };
  }
  const submitData = await submitRes.json();
  const statusUrl = submitData.status_url;
  const responseUrl = submitData.response_url;

  // Poll until done
  let attempts = 0;
  while (attempts++ < 60) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusData = await statusRes.json();
    if (statusData.status === "COMPLETED") break;
    if (statusData.status === "FAILED") {
      return { ok: false, elapsedMs: Date.now() - t0, error: `FAL FAILED: ${JSON.stringify(statusData).slice(0, 500)}` };
    }
  }

  const finalRes = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const data = await finalRes.json();
  const elapsedMs = Date.now() - t0;

  const imgUrl = data.images?.[0]?.url;
  if (!imgUrl) {
    return { ok: false, elapsedMs, error: "No image in FAL response", raw: JSON.stringify(data).slice(0, 500) };
  }

  // Скачиваем картинку и кодируем в base64 для унификации с другими провайдерами
  const imgRes = await fetch(imgUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const ct = imgRes.headers.get("content-type") || "image/jpeg";

  return {
    ok: true,
    elapsedMs,
    imageMime: ct,
    imageBase64: buf.toString("base64"),
    imageUrl: imgUrl,
  };
}
