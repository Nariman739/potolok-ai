// Bake-off entrypoint.
// Usage:
//   node --env-file=.env.local scripts/bake-off/run.mjs <photo-path> [--provider all|nano-banana|replicate-flux|flux-fill] [--prompt short|long]
//
// Что делает:
// 1. Читает фото с диска, кодирует в base64
// 2. Для Replicate/FAL — заливает фото в Vercel Blob (нужен публичный URL)
// 3. Прогоняет фото через выбранные провайдеры с одинаковым промптом
// 4. Сохраняет результаты в scripts/bake-off/out/<ts>_<provider>.{jpg,json}
// 5. Печатает сводку (время, цена-эстимейт, ошибки)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

import * as nanoBanana from "./providers/nano-banana.mjs";
import * as replicateFlux from "./providers/replicate-flux.mjs";
import * as fluxFill from "./providers/flux-fill.mjs";
import { TEST_PROMPT, SHORT_PROMPT } from "./prompts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");

// --- arg parsing ---
const args = process.argv.slice(2);
const photoPath = args.find((a) => !a.startsWith("--"));
const providerArg = (args.find((a) => a.startsWith("--provider="))?.split("=")[1]) ||
  (args.includes("--provider") ? args[args.indexOf("--provider") + 1] : null) ||
  "all";
const promptArg = (args.find((a) => a.startsWith("--prompt="))?.split("=")[1]) ||
  (args.includes("--prompt") ? args[args.indexOf("--prompt") + 1] : null) ||
  "long";

if (!photoPath) {
  console.error("usage: node --env-file=.env.local scripts/bake-off/run.mjs <photo-path> [--provider all|nano-banana|replicate-flux|flux-fill] [--prompt short|long]");
  process.exit(1);
}

const prompt = promptArg === "short" ? SHORT_PROMPT : TEST_PROMPT;

// --- read photo, detect mime ---
const photoBuf = await fs.readFile(photoPath);
const ext = path.extname(photoPath).toLowerCase();
const mimeType =
  ext === ".png" ? "image/png" :
  ext === ".webp" ? "image/webp" :
  "image/jpeg";
const photoBase64 = photoBuf.toString("base64");
console.log(`[input] ${photoPath} (${photoBuf.length} bytes, ${mimeType})`);

// --- upload to Vercel Blob (нужен для Replicate/FAL) ---
let photoUrl = null;
const needsPublicUrl = providerArg === "all" || providerArg === "replicate-flux" || providerArg === "flux-fill";
if (needsPublicUrl) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[blob] BLOB_READ_WRITE_TOKEN not set — replicate/flux-fill providers will be skipped");
  } else {
    console.log("[blob] uploading photo to Vercel Blob...");
    const t0 = Date.now();
    const blob = await put(`bake-off/${Date.now()}_input${ext}`, photoBuf, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    photoUrl = blob.url;
    console.log(`[blob] uploaded in ${Date.now() - t0}ms → ${photoUrl}`);
  }
}

// --- select providers ---
const allProviders = {
  "nano-banana": nanoBanana,
  "replicate-flux": replicateFlux,
  "flux-fill": fluxFill,
};
const selected = providerArg === "all"
  ? Object.entries(allProviders)
  : [[providerArg, allProviders[providerArg]]];

if (!selected[0][1]) {
  console.error(`unknown provider: ${providerArg}`);
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });

// --- run providers ---
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const summary = [];

for (const [name, mod] of selected) {
  console.log(`\n=== ${name} ===`);
  let result;
  try {
    if (name === "nano-banana") {
      result = await mod.generate({ photoBase64, mimeType, prompt });
    } else if (name === "replicate-flux") {
      if (!photoUrl) {
        console.log(`[${name}] skipped — no photoUrl`);
        continue;
      }
      result = await mod.generate({ photoUrl, prompt });
    } else if (name === "flux-fill") {
      if (!process.env.FAL_KEY) {
        console.log(`[${name}] skipped — FAL_KEY not set`);
        continue;
      }
      if (!photoUrl) {
        console.log(`[${name}] skipped — no photoUrl`);
        continue;
      }
      result = await mod.generate({ photoUrl, maskUrl: null, prompt });
    }
  } catch (err) {
    result = { ok: false, elapsedMs: 0, error: err.message };
  }

  const baseName = `${ts}_${name}`;
  const jsonPath = path.join(OUT_DIR, `${baseName}.json`);
  await fs.writeFile(jsonPath, JSON.stringify({ provider: name, prompt, ...result, imageBase64: undefined }, null, 2));

  if (result.ok) {
    const imgExt = (result.imageMime || "image/jpeg").includes("png") ? "png" : "jpg";
    const imgPath = path.join(OUT_DIR, `${baseName}.${imgExt}`);
    await fs.writeFile(imgPath, Buffer.from(result.imageBase64, "base64"));
    console.log(`[${name}] ✓ ${result.elapsedMs}ms → ${imgPath}`);
    summary.push({ provider: name, ok: true, elapsedMs: result.elapsedMs, file: imgPath });
  } else {
    console.log(`[${name}] ✗ ${result.error}`);
    summary.push({ provider: name, ok: false, elapsedMs: result.elapsedMs, error: result.error });
  }
}

console.log("\n=== SUMMARY ===");
console.table(summary);
