#!/usr/bin/env node
/**
 * Mobile-spike: проверка качества Gemini 2.5 Flash Image на парах (фото комнаты + 2D-план).
 *
 * Использование:
 *   npx tsx scripts/spike-mobile-quality.ts ./spike-pairs/
 *
 * Структура входной папки:
 *   spike-pairs/
 *     pair1/
 *       photo.jpg     — фото реальной комнаты клиента
 *       plan.png      — 2D-план комнаты сверху со всеми элементами (из конструктора)
 *       meta.json     — { finish: "matte"|"satin"|"glossy", colorName?, extraPrompt? }
 *     pair2/
 *       ...
 *
 * Результаты складываются в spike-results/{pair-id}_{timestamp}.{result.png, prompt.txt, meta.json}.
 *
 * Критерий приёмки (Нариман читает глазами):
 *   «Картинку не стыдно показать клиенту на закрытии сделки» — для всех пар.
 *
 * Если ОК на ВСЕХ парах (свои + Серика) → Этап 4 идёт по варианту C.
 * Если на исторических ОК, но на свежем замере Серика провал → false positive,
 * переходим на серверный 3D (увеличивает Этап 4 на 3-5 дней).
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getOpenRouter } from "../src/lib/openrouter";

const NANO_BANANA_MODEL = "google/gemini-2.5-flash-image";

const PROMPT_BASE = `You receive TWO images:
  image-1: PHOTO of a real room (taken by a master during a site visit).
  image-2: TOP-DOWN 2D PLAN of the same room from a stretched-ceiling designer app,
           showing the planned layout of recessed spotlights, magnetic tracks, LED light lines,
           chandeliers, curtains (gardinas), and floating-ceiling LED perimeters.

Generate a photorealistic interior photograph of the SAME room as in image-1, but with
the new stretched ceiling installed according to the schematic in image-2.

Hard requirements:
  - Preserve EVERYTHING from image-1: walls, floor, furniture, windows, doors, decor.
  - Replace ONLY the ceiling: add the stretched PVC ceiling, fixtures, light fixtures as
    schematically marked in image-2.
  - Use ceiling finish: {{finish}}, color: {{colorName}}.
  - Lighting fixtures must match the schematic: count, type, approximate position.
  - Realistic textures, natural daylight + warm fixture light, ultra-detailed, 4K.

Output: photorealistic interior photograph.`;

interface PairMeta {
  finish: "matte" | "satin" | "glossy";
  colorName?: string;
  extraPrompt?: string;
}

async function processPair(pairDir: string, outDir: string) {
  const pairId = pairDir.split("/").pop()!;
  const photoPath = join(pairDir, "photo.jpg");
  const planPath = join(pairDir, "plan.png");
  const metaPath = join(pairDir, "meta.json");

  // Поддерживаем варианты расширений
  const photoExists = await stat(photoPath).catch(() => null);
  const altPhoto = photoExists ? photoPath : join(pairDir, "photo.png");
  const planExists = await stat(planPath).catch(() => null);
  const altPlan = planExists ? planPath : join(pairDir, "plan.jpg");

  const [photoBuf, planBuf, metaRaw] = await Promise.all([
    readFile(altPhoto),
    readFile(altPlan),
    readFile(metaPath, "utf-8").catch(() => '{"finish":"matte","colorName":"белый"}'),
  ]);
  const meta = JSON.parse(metaRaw) as PairMeta;

  const photoMime = altPhoto.endsWith(".png") ? "image/png" : "image/jpeg";
  const planMime = altPlan.endsWith(".png") ? "image/png" : "image/jpeg";

  const prompt = PROMPT_BASE.replace("{{finish}}", meta.finish).replace(
    "{{colorName}}",
    meta.colorName ?? "white",
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const resultName = `${pairId}_${ts}`;

  console.log(`[${pairId}] running Gemini 2.5 Flash Image multi-image...`);
  const t0 = Date.now();

  const client = getOpenRouter();
  const completion = await client.chat.completions.create({
    model: NANO_BANANA_MODEL,
    // @ts-expect-error: OpenRouter supports `modalities` to return image content
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${photoMime};base64,${photoBuf.toString("base64")}` },
          },
          {
            type: "image_url",
            image_url: { url: `data:${planMime};base64,${planBuf.toString("base64")}` },
          },
        ],
      },
    ],
  } as Parameters<typeof client.chat.completions.create>[0]);

  const ms = Date.now() - t0;
  const msg = completion.choices[0]?.message as { images?: Array<{ image_url?: { url?: string } }> };
  const imgUrl = msg?.images?.[0]?.image_url?.url;
  if (!imgUrl) {
    console.error(`[${pairId}] no image returned from Gemini. Response:`, JSON.stringify(completion).slice(0, 500));
    return;
  }
  const b64 = imgUrl.replace(/^data:image\/[a-z]+;base64,/, "");
  await writeFile(join(outDir, `${resultName}.png`), Buffer.from(b64, "base64"));
  await writeFile(join(outDir, `${resultName}.prompt.txt`), prompt);
  await writeFile(
    join(outDir, `${resultName}.meta.json`),
    JSON.stringify({ pair: pairId, meta, elapsedMs: ms, model: "gemini-2.5-flash-image" }, null, 2),
  );
  console.log(`[${pairId}] done in ${ms}ms → ${resultName}.png`);
}

async function main() {
  const pairsRoot = process.argv[2] ?? "./spike-pairs";
  const outDir = "./spike-results";
  await mkdir(outDir, { recursive: true });

  const entries = await readdir(pairsRoot, { withFileTypes: true });
  const pairDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(pairsRoot, e.name))
    .sort();

  if (pairDirs.length === 0) {
    console.error(`Нет пар в ${pairsRoot}. Создай папки spike-pairs/pair1/, pair2/, ... с photo.jpg + plan.png + meta.json`);
    process.exit(1);
  }

  console.log(`Найдено пар: ${pairDirs.length}`);
  for (const dir of pairDirs) {
    try {
      await processPair(dir, outDir);
    } catch (e) {
      console.error(`[${dir}] failed:`, e);
    }
  }
  console.log(`\n✓ Готово. Результаты в ${outDir}/. Смотри глазами — критерий: «не стыдно показать клиенту на закрытии сделки».`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
