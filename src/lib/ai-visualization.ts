// AI-визуализация натяжного потолка по фото клиентской комнаты.
// Этап 1 MVP: фото + опции (тип примыкания, споты, люстра) → фотореалистичный рендер.
// Этап 2+: добавится разметка (точки спотов, линии треков) + маска для FLUX Fill.
//
// Провайдеры (победитель bake-off 2026-05-15 на 7 фото):
//   - nano-banana (Gemini 2.5 Flash Image через OpenRouter) — основной, чистит мусор
//   - replicate-flux-kontext (FLUX Kontext Pro) — fallback, фотореалистичнее но
//     оставляет старые лампы/провода

import Replicate from "replicate";
import { getOpenRouter, AI_MODEL } from "./openrouter";

export type AttachmentType = "regular" | "shadow" | "floating";
export type CeilingFinish = "matte" | "satin" | "glossy";
export type ChandelierType = "none" | "minimalist" | "modern" | "classic" | "molecular";
export type VisualizationProvider =
  | "nano-banana"
  | "replicate-flux-kontext"
  | "fal-flux-fill";

export interface VisualizationOptions {
  attachmentType: AttachmentType;
  finish: CeilingFinish;
  colorName?: string; // "белый", default white
  ledStrip?: boolean; // только для floating — LED по периметру
  spotsCount: 0 | 4 | 6 | 8;
  chandelierType: ChandelierType;
  /** Доп. инструкции от мастера (опционально) */
  extraPrompt?: string;
  /** Жёсткий режим удаления старых ламп/проводов — добавляет агрессивный emphasis в промпт */
  removeOldFixtures?: boolean;
  /** Точная разметка на фото: координаты в процентах + привязка к элементам библиотеки */
  markupText?: string;
}

export interface VisualizationElementInput {
  name: string;          // "Магнитный трек 1м"
  category: string;      // "track" | "spot" | ...
  imageBase64: string;   // фото элемента (нейтральный фон)
  mime: string;          // image mime
  quantity: number;      // сколько штук установить
  description?: string;  // кэшированное описание (Claude vision) — опционально
  notes?: string;        // ручная подпись от мастера: "по периметру", "по углам"
}

export interface VisualizationInput {
  /** Публичный URL исходного фото (Vercel Blob) */
  photoUrl: string;
  /** Если nano-banana — нужен также base64 (OpenRouter image_url или data URL) */
  photoBase64?: string;
  photoMime?: string;
  /** Annotated overlay — то же фото с нарисованной разметкой (LED-рамка, треки, споты).
   * Передаётся в Nano Banana как ВТОРОЕ изображение — модель видит ГЛАЗАМИ где
   * должны стоять фикстуры. Гораздо точнее чем текстовые координаты в промпте. */
  overlayBase64?: string;
  overlayMime?: string;
  /** Опциональное фото-референс «сделай такой потолок как тут» (Pinterest, портфолио) */
  referenceUrl?: string;
  referenceBase64?: string;
  referenceMime?: string;
  /** Детальное текстовое описание дизайна с референса — получаем через describeReferenceCeiling().
   * Сильно повышает точность копирования светильников (Nano Banana лучше понимает явный текст чем "просто похожее"). */
  referenceDescription?: string;
  /** Элементы из библиотеки мастера для точной композиции (магнитный трек, софит, вентиляция и т.п.) */
  elements?: VisualizationElementInput[];
  /** Публичный URL PNG-маски (для fal-flux-fill): белая зона = inpaint, чёрная = заморозить */
  maskUrl?: string;
  options: VisualizationOptions;
  provider?: VisualizationProvider; // default: nano-banana
  /** Если задан — перебивает buildVisualizationPrompt (используется для sourceType=scene3d/scene2d). */
  customPrompt?: string;
}

export interface VisualizationResult {
  imageBase64: string;
  imageMime: string;
  prompt: string;
  modelUsed: string;
  costUsd: number;
  elapsedMs: number;
}

const COST_NANO_BANANA = 0.03;
const COST_FLUX_KONTEXT = 0.04;
const COST_FAL_FLUX_FILL = 0.05;
const COST_REFERENCE_ANALYSIS = 0.005; // Claude vision на 1 фото
const FLUX_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro";
const NANO_BANANA_MODEL = "google/gemini-2.5-flash-image";

// ============================================
// REFERENCE ANALYZER (Claude vision → детальное описание светильников)
// ============================================

const REFERENCE_ANALYZER_PROMPT = `Analyze this photo of an installed stretched ceiling. Describe the ceiling design in EXTREME detail so that another image-generation AI can recreate the EXACT SAME ceiling in a different room.

List specifically:
1. Ceiling profile type: regular / shadow gap (teneva) / floating (paryashchy) with LED / multi-level / single-level
2. Ceiling surface: color (white / black / beige / coloured), finish (matte / satin / glossy / mirror-glossy)
3. LED perimeter strip (if any): position, color temperature (warm white ~2700K / neutral / cool white), brightness
4. Spotlights / recessed lights (if any): EXACT count, exact shape (round flat / cylindrical can / square / cone-shape / track-mounted), housing color (black / white / chrome / gold), beam type
5. Magnetic tracks (if any): exact count and length, position (parallel / perpendicular / cross), what FIXTURES are mounted on them (long thin LED bars / round spots / pendant lamps / cylindrical spots / square panels)
6. Light lines / linear LED strips ON the ceiling surface (NOT perimeter): count, length, thickness, arrangement
7. Chandelier (if any): style (minimalist pendant / molecular / classical crystal / modern designer / spider arms), bulb count and shape
8. Any other decorative elements: medallions, decorative beams, niches, etc

Output a SINGLE dense paragraph in English (no bullet points, no markdown). Be EXTREMELY specific about fixture shapes and quantities — this description will be used as instructions to recreate the exact same ceiling. If you see "two parallel magnetic tracks each holding 4 long flat warm-white LED bars 60cm long with black housing" — write exactly that.`;

// Описание одиночного элемента (магнитный трек / софит / люстра / вентиляция и т.п.) на нейтральном фоне.
// Используется при добавлении элемента в библиотеку мастера — описание кэшируется в БД.
const ELEMENT_ANALYZER_PROMPT = `Analyze this single ceiling fixture / element shown on a neutral background.

Describe in detail:
1. Type: spotlight / magnetic track / linear LED bar / chandelier / pendant lamp / ventilation grille / decorative element / profile / etc
2. Shape: cylindrical can / round flat disk / square panel / linear bar / cone / multi-arm / etc
3. Housing/body color: matte black / white / chrome silver / gold / etc
4. Light source type (if any): warm white LED ~2700K / neutral / cool white / no light (passive grille / decorative)
5. Approximate dimensions and proportions (long thin / short stubby / large flat / etc)
6. Mounting style: recessed / surface-mounted / track-mounted / pendant
7. Any distinguishing features

Output a SINGLE dense paragraph in English. Be EXTREMELY specific about shape and color so that an AI image generator can reproduce this exact element in a different room photo.`;

export async function describeCeilingElement(
  imageBase64: string,
  imageMime: string,
): Promise<string> {
  const client = getOpenRouter();
  const res = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 350,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: ELEMENT_ANALYZER_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${imageMime};base64,${imageBase64}` },
          },
        ],
      },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}

// ============================================
// AUTO CEILING DETECTION — Claude vision возвращает polygon границы потолка
// ============================================

const CEILING_DETECTION_PROMPT = `Analyze this photo of a room. Identify ONLY the area of the ceiling (the TOP horizontal surface of the room — concrete slab, painted ceiling, drywall, etc) visible in the photo.

CRITICAL RULES:
- The polygon must STRICTLY follow the LINE WHERE THE CEILING MEETS THE WALLS. Do NOT extend into wall areas.
- If unsure where ceiling ends and wall begins — be CONSERVATIVE: better to under-mark than to include any wall pixels.
- DO NOT include: walls, windows, doors, furniture, floor — these are NOT ceiling.
- DO include: ONLY the horizontal top surface (even if it has concrete stains, hanging wires, paint patches — that's still ceiling).
- The polygon must be SLIGHTLY INSET from the perceived ceiling-wall edge (about 1-2% margin inward) to avoid catching wall pixels.

Return ONLY a JSON object with this exact structure:
{"polygon": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, ...]}

Where:
- x and y are PERCENTAGES (0..100) from the top-left of the image
- Provide 4 to 10 points outlining the ceiling area as a CONVEX polygon (go clockwise starting from top-left of the ceiling)
- Each point sits where the ceiling meets a wall — slightly inside the ceiling boundary

Output ONLY valid JSON, no markdown, no explanation, no commentary. Just the JSON object.`;

export async function detectCeilingPolygon(
  photoBase64: string,
  photoMime: string,
): Promise<Array<{ x: number; y: number }>> {
  const client = getOpenRouter();
  const res = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CEILING_DETECTION_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${photoMime};base64,${photoBase64}` },
          },
        ],
      },
    ],
  });
  const text = res.choices?.[0]?.message?.content?.trim() ?? "";
  // Извлекаем JSON даже если модель добавила markdown-обёртку
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Не получилось распарсить ответ Claude: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(jsonMatch[0]) as { polygon?: Array<{ x: number; y: number }> };
  const polygon = data.polygon;
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new Error("Claude вернул polygon с менее чем 3 точками");
  }
  // Валидируем и нормализуем координаты
  return polygon
    .map((p) => ({
      x: Math.max(0, Math.min(100, Number(p.x))),
      y: Math.max(0, Math.min(100, Number(p.y))),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export async function describeReferenceCeiling(
  referenceBase64: string,
  referenceMime: string,
): Promise<string> {
  const client = getOpenRouter();
  const res = await client.chat.completions.create({
    model: AI_MODEL, // anthropic/claude-sonnet-4
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: REFERENCE_ANALYZER_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${referenceMime};base64,${referenceBase64}` },
          },
        ],
      },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}

// ============================================
// PROMPT BUILDER
// ============================================

const ATTACHMENT_DESC: Record<AttachmentType, string> = {
  regular: 'classic stretch ceiling with standard wall profile (no shadow gap, no floating gap)',
  shadow: 'stretch ceiling with a "shadow gap" (teneva) profile — a thin uniform recessed dark shadow line along the ENTIRE perimeter (ALL FOUR sides of the room, forming a complete closed rectangle) where the ceiling meets the walls. The shadow line must be present on every wall, not just one or two.',
  floating: 'modern "floating" (paryashchy) stretch ceiling — the ceiling sits a couple centimeters below the wall edge, with a continuous warm-white LED light strip glowing softly in the perimeter gap. CRITICAL: the LED-lit floating gap MUST run along ALL FOUR SIDES of the room, forming a COMPLETE CLOSED RECTANGLE of soft warm light around the entire ceiling. It must NOT be on just one or two walls — every wall has the same glowing gap.',
};

const FINISH_DESC: Record<CeilingFinish, string> = {
  matte: "matte finish, soft non-reflective surface",
  satin: "satin finish, slight subtle sheen",
  glossy: "high-gloss mirror finish reflecting the room softly",
};

const CHANDELIER_DESC: Record<ChandelierType, string> = {
  none: "no central chandelier — just spotlights",
  minimalist: "one minimalist single-pendant ceiling lamp hanging in the geometric center of the room",
  modern: "one modern designer chandelier with clean lines hanging in the geometric center of the room",
  classic: "one classic crystal chandelier hanging in the geometric center of the room",
  molecular: 'one modern "molecular" chandelier with multiple small bulbs on thin arms, hanging in the geometric center of the room',
};

export function buildVisualizationPrompt(
  options: VisualizationOptions,
  hasReference = false,
  referenceDescription?: string,
  elements?: VisualizationElementInput[],
  hasOverlay = false,
): string {
  const color = options.colorName ?? "white";
  const lines: string[] = [];

  // Усиленный emphasis для удаления старых ламп — ставим в самом начале промпта чтобы модель не забыла.
  if (options.removeOldFixtures) {
    lines.push(
      "CRITICAL — REMOVE OLD CEILING FIXTURES:",
      "The input photo (image 1) contains OLD construction-stage lighting: bare hanging light bulbs on wires, exposed cables, junction boxes — these are TEMPORARY items that must be COMPLETELY REMOVED in the output.",
      "The new stretch ceiling must completely cover and HIDE these items. They must NOT appear in the rendered output. There should be NO bare bulbs, NO hanging wires, NO old cables visible anywhere.",
      "If you see a glowing bulb in the source photo — it does NOT exist in the output. Replace it with the new ceiling surface and new lighting (LED strip / spotlights / chandelier as specified below).",
      "",
    );
  }

  const hasElements = Boolean(elements && elements.length > 0);

  // Map images to numbered slots: Image 1 = room, Image 2 = overlay (optional), Image 3 = reference (optional), then elements.
  // This must match the actual order of images passed to the model.
  let imageIndex = 2;
  const overlayImageIdx = hasOverlay ? imageIndex++ : null;
  const referenceImageIdx = hasReference ? imageIndex++ : null;
  const elementImageIdxs: Record<number, number> = {};
  if (hasElements) {
    elements!.forEach((_, i) => {
      elementImageIdxs[i] = imageIndex++;
    });
  }

  if (hasOverlay || hasReference || hasElements) {
    lines.push("You are given multiple images:");
    lines.push("- Image 1 (TARGET): the client's actual room — we need to render the new ceiling HERE.");
    if (overlayImageIdx) {
      lines.push(
        `- Image ${overlayImageIdx} (LAYOUT MAP — CRITICAL): this is the SAME room photo with colored markings drawn on top by the master. The markings show EXACTLY where each fixture must appear in the final render. THIS IS NOT A STYLE REFERENCE — it is a positioning blueprint. Use it as a STRICT GUIDE for fixture placement.`,
        "  Color legend for the layout map:",
        '  - YELLOW thick polygon frame = the warm-white LED floating gap. THIS IS THE MOST CRITICAL ELEMENT. You MUST trace the YELLOW polygon edge-by-edge with a CONTINUOUS GLOWING warm-white LED light strip. Every single edge of the yellow polygon must have continuous LED glow — NOT just the corners, NOT just one or two edges. If the polygon has 4 edges (sides), you render 4 continuous LED strips that connect end-to-end into a closed loop of warm light. The glow must softly illuminate the top of the wall behind it.',
        '  - DARK SLATE thick polygon frame = shadow gap (teneva). Render a thin uniform recessed dark shadow line along EVERY edge of this polygon (all four sides). The shadow line must be visible on each edge, forming a complete closed dark rectangle around the ceiling.',
        '  - RED thick line = a SINGLE STRAIGHT FLAT magnetic track. Each separate red line = ONE separate physical track. If you see N separate red lines, render N SEPARATE PARALLEL tracks. Keep each track perfectly straight, preserving the EXACT angle and position of each red line as drawn — do NOT bend tracks toward each other, do NOT merge nearby tracks into one. Tracks that look parallel in the layout MUST be parallel in the render.',
        '  - ORANGE thick line = a glowing linear LED light line on the ceiling surface. Same rules as tracks: each orange line = ONE separate linear light, preserve straight geometry and angle.',
        '  - GREEN dot = a single recessed spotlight installed in the ceiling. Render exactly one small flush spotlight at each green dot location.',
        '  - PURPLE bigger circle = a chandelier hanging from the ceiling. Render exactly one chandelier at each purple circle location.',
        "  IMPORTANT: in the FINAL render, the colored markings themselves DO NOT APPEAR — they are only a positioning blueprint. Replace each marking with the corresponding photorealistic real fixture at the SAME pixel location.",
      );
    }
    if (referenceImageIdx) {
      lines.push(
        `- Image ${referenceImageIdx} (MOOD REFERENCE): a photo of an ALREADY-INSTALLED stretch ceiling design — use as overall style/atmosphere reference.`,
      );
    }
    if (hasElements) {
      elements!.forEach((el, i) => {
        lines.push(
          `- Image ${elementImageIdxs[i]} (ELEMENT): "${el.name}" — install ${el.quantity} ${el.quantity === 1 ? "piece" : "pieces"} of this exact fixture in image 1's room${el.notes ? ` (${el.notes})` : ""}. When the layout map shows a colored marking matching this element type, install this exact fixture at those locations.`,
        );
      });
    }
    lines.push("");
    if (hasOverlay) {
      lines.push(
        "Your task: render the final photorealistic image of image 1's room with a brand new stretch ceiling. The PLACEMENT of every fixture (LED gap, tracks, spotlights, chandeliers) must EXACTLY match the layout map (image " +
          overlayImageIdx +
          "). Treat each colored mark as the precise location of the corresponding real fixture in the final render.",
        "",
        "MANDATORY FIXTURES — DO NOT SKIP:",
        "- Every RED line in the layout map MUST become a CLEARLY VISIBLE black or anthracite-grey magnetic track installed flush on the white ceiling. Tracks are 4-5 cm wide dark bars — they are HIGHLY VISIBLE against the white ceiling, NOT subtle. Do NOT omit them, do NOT make them invisible, do NOT 'blend them into the ceiling'.",
        "- Every GREEN dot MUST become a clearly visible recessed cylindrical or flat-disc spotlight with a black or chrome housing, set into the white ceiling. Do NOT omit.",
        "- Every PURPLE circle MUST become a visible hanging chandelier. Do NOT omit.",
        "- Every YELLOW polygon edge MUST glow with warm-white LED light — visible glow on EVERY edge of the polygon, continuous, soft warm color washing onto the upper wall.",
        "Skipping or hiding any of these fixtures is a FAILURE. They are the entire purpose of this render — the master is selling the client on EXACTLY these fixtures.",
      );
    } else {
      lines.push(
        hasElements
          ? "Your task: build the new ceiling for image 1's room using the EXACT fixtures shown in the element images above. Quantities and types must match what is specified for each element image. Adapt placement to image 1's room geometry naturally."
          : "Your task: take the ceiling DESIGN from image 2 (the type of ceiling, position of lighting tracks, spotlights, chandelier, LED strip — whatever is visible there) and install that EXACT ceiling design into image 1's room. Scale and arrange the ceiling elements naturally to fit image 1's room geometry — do NOT just copy-paste image 2.",
      );
    }
    lines.push("Use image 1's perspective, camera angle, walls, floor, furniture, windows.");
    lines.push("");
  }

  const targetLabel = hasOverlay || hasReference || hasElements ? "image 1" : "the input photo";

  lines.push(
    hasElements
      ? "Photorealistic interior render of image 1's room with a new stretch ceiling assembled from the elements shown in additional images."
      : hasReference
      ? "Photorealistic interior render of image 1's room with the ceiling design from image 2 installed."
      : "Photorealistic interior render of the SAME ROOM in the input photo, but with a brand new stretch ceiling installed over the old construction ceiling.",
    "",
    `STEP 1 — Demolition of the OLD ceiling (what to REMOVE from ${targetLabel}):`,
    "- Delete ALL existing light bulbs hanging from wires, including bare bulbs, temporary construction lamps, and any electrical fixtures attached to the old concrete ceiling",
    "- Delete ALL exposed wires, cables, junction boxes, plaster patches, holes, and concrete texture visible on the original ceiling",
    "- These items are construction-stage debris and MUST be completely hidden behind the new stretch ceiling — do not preserve any of them",
    "",
  );

  if (hasElements) {
    lines.push("STEP 2 — Install the new ceiling using the EXACT elements provided:");
    elements!.forEach((el, i) => {
      lines.push(
        `\n  Element image ${elementImageIdxs[i]} = "${el.name}" — install ${el.quantity} ${el.quantity === 1 ? "piece" : "pieces"}${el.notes ? `. Position: ${el.notes}` : ""}.`,
      );
      if (el.description) {
        lines.push(`  Expert description: ${el.description}`);
      }
    });
    lines.push(
      "",
      "- The fixtures shown in element images are EXAMPLES of EXACT fixture types — reproduce their exact shape, color, size, mounting style in the new ceiling",
      "- Distribute the elements naturally across image 1's ceiling — do NOT pile them in one spot",
      `- Ceiling profile: ${ATTACHMENT_DESC[options.attachmentType]}`,
      `- Ceiling surface base: ${color}, ${FINISH_DESC[options.finish]}`,
      `- Chandelier: ${CHANDELIER_DESC[options.chandelierType]}`,
    );
    if (options.spotsCount > 0) {
      lines.push(
        `- Additional ${options.spotsCount} small recessed cool-white LED spotlights evenly distributed (in addition to the elements above)`,
      );
    }
    if (hasReference && referenceDescription) {
      lines.push(
        "",
        "Mood/atmosphere notes from reference image:",
        referenceDescription,
      );
    }
    if (options.extraPrompt) {
      lines.push("", `Extra notes from the master: ${options.extraPrompt}`);
    }
  } else if (hasReference) {
    lines.push(
      "STEP 2 — Reproduce the ceiling design from image 2 (reference):",
      "- The reference image (image 2) shows the EXACT ceiling style the client wants — copy the ceiling profile type (regular / shadow gap / floating), the LED strip layout, the position and quantity of spotlights, the chandelier type, magnetic tracks, light lines, all visible fixtures",
      "- Adapt the layout to image 1's room dimensions naturally, but keep the same DESIGN LANGUAGE and fixture types",
      "- Match the color and finish (matte / satin / glossy) shown in image 2",
    );

    if (referenceDescription) {
      lines.push(
        "",
        "EXPERT ANALYSIS of image 2 (this is what is on the reference — recreate EXACTLY these fixture types and quantities):",
        referenceDescription,
      );
    }

    lines.push(
      "",
      "Optional user fine-tuning (use only if not contradicting image 2):",
      `- Preferred color override: ${color}`,
      `- Preferred finish override: ${FINISH_DESC[options.finish]}`,
    );
    if (options.extraPrompt) {
      lines.push(`- Extra notes: ${options.extraPrompt}`);
    }
  } else {
    lines.push(
      "STEP 2 — Install the NEW stretch ceiling with these specs:",
      `- ${ATTACHMENT_DESC[options.attachmentType]}`,
      `- Color: ${color}, ${FINISH_DESC[options.finish]}`,
    );
    if (options.attachmentType === "floating" && options.ledStrip) {
      lines.push("- Warm white LED light strip glowing softly along the entire perimeter floating gap");
    }
    if (options.spotsCount > 0) {
      lines.push(
        `- ${options.spotsCount} small recessed cool-white LED spotlights evenly distributed across the ceiling (these are the ONLY light sources you should add to the ceiling besides the chandelier)`,
      );
    }
    lines.push(`- For the chandelier: ${CHANDELIER_DESC[options.chandelierType]}`);
    if (options.chandelierType !== "none") {
      lines.push(
        "- The chandelier is a NEW fixture, installed via a clean ceiling rosette — it is NOT the old bare bulb from the input photo",
      );
    }
    if (options.extraPrompt) {
      lines.push("", `Additional notes: ${options.extraPrompt}`);
    }
  }

  if (options.markupText) {
    lines.push(
      "",
      "EXACT POSITIONS — the master marked these on the photo (coordinates are percentages from top-left of image 1, where 0%,0% = top-left corner and 100%,100% = bottom-right corner). Ceiling area is the upper portion of the image. PLACE FIXTURES EXACTLY AT THESE COORDINATES:",
      options.markupText,
    );
  }

  lines.push(
    "",
    "FULL CEILING COVERAGE — CRITICAL:",
    "- The new stretch ceiling MUST cover the ENTIRE ceiling area visible in the image, from wall to wall, edge to edge, corner to corner",
    "- Do NOT leave ANY patches of the original concrete / construction ceiling visible — not in corners, not near windows, not above doors, not anywhere",
    "- If part of the old ceiling is still visible after your edit, you have FAILED — the new ceiling must completely replace the entire visible ceiling surface",
    "- Old wires hanging from the OLD ceiling area — fully covered by the new ceiling above them, NOT visible",
    "- The transition between ceiling and walls must be a clean perimeter line at the SAME height as the original ceiling, all around the room",
    "",
    `STEP 3 — Keep the rest of ${targetLabel}'s room IDENTICAL:`,
    "- Walls, floor, furniture, windows, doors, tiles, cabinets, air conditioners, switches — preserve their exact materials, colors and positions",
    `- Preserve the exact camera angle, perspective, and natural daylight direction of ${targetLabel}`,
    "- The new ceiling must look professionally installed: perfectly flat, no gaps near walls, no artifacts, no seams, no visible wires, no exposed concrete",
    "- No text, no watermark, no UI elements",
  );

  return lines.join("\n");
}

// ============================================
// PROVIDER: NANO BANANA (OpenRouter / Gemini 2.5 Flash Image)
// ============================================

async function generateNanoBanana(input: VisualizationInput): Promise<VisualizationResult> {
  if (!input.photoBase64 || !input.photoMime) {
    throw new Error("Nano Banana требует photoBase64 + photoMime");
  }

  const hasReference = Boolean(input.referenceBase64 && input.referenceMime);
  const hasOverlay = Boolean(input.overlayBase64 && input.overlayMime);
  const elements = input.elements ?? [];
  const client = getOpenRouter();
  const prompt = input.customPrompt ?? buildVisualizationPrompt(
    input.options,
    hasReference,
    input.referenceDescription,
    elements.length > 0 ? elements : undefined,
    hasOverlay,
  );
  const t0 = Date.now();

  // Image order MUST match prompt: Image 1 = room, Image 2 = overlay (if any), Image 3 = reference (if any), then elements.
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: { url: `data:${input.photoMime};base64,${input.photoBase64}` },
    },
  ];
  if (hasOverlay) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.overlayMime};base64,${input.overlayBase64}` },
    });
  }
  if (hasReference) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.referenceMime};base64,${input.referenceBase64}` },
    });
  }
  for (const el of elements) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${el.mime};base64,${el.imageBase64}` },
    });
  }

  const res = await client.chat.completions.create({
    model: NANO_BANANA_MODEL,
    // @ts-expect-error: OpenRouter supports `modalities` to return image content
    modalities: ["image", "text"],
    messages: [{ role: "user", content }],
  });
  const elapsedMs = Date.now() - t0;

  const msg = res.choices?.[0]?.message as unknown as {
    images?: Array<{ image_url?: { url?: string } }>;
    content?: string;
  };
  const imageUrl = msg?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    // Логируем полностью чтобы понять что вернул Gemini (текст вместо картинки, safety reject, и т.п.)
    console.error("[nano-banana] no image returned. Response message:", JSON.stringify(msg).slice(0, 1500));
    console.error("[nano-banana] finish_reason:", res.choices?.[0]?.finish_reason);
    const textPreview = typeof msg?.content === "string" ? msg.content.slice(0, 300) : "(no text)";
    throw new Error(
      `Nano Banana не вернул картинку. finish=${res.choices?.[0]?.finish_reason ?? "?"}. Text: ${textPreview}`,
    );
  }

  const m = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
  if (!m) {
    throw new Error(`Nano Banana вернул неожиданный формат: ${imageUrl.slice(0, 80)}`);
  }

  return {
    imageBase64: m[2],
    imageMime: m[1],
    prompt,
    modelUsed: `openrouter:${NANO_BANANA_MODEL}`,
    costUsd: COST_NANO_BANANA,
    elapsedMs,
  };
}

// ============================================
// PROVIDER: REPLICATE FLUX KONTEXT PRO
// ============================================

async function generateReplicateFlux(input: VisualizationInput): Promise<VisualizationResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN не настроен");

  // FLUX Kontext Pro принимает только одно input_image — reference игнорируется
  const replicate = new Replicate({ auth: token });
  const prompt = input.customPrompt ?? buildVisualizationPrompt(input.options, false);
  const t0 = Date.now();

  const output = await replicate.run(FLUX_KONTEXT_MODEL, {
    input: {
      prompt,
      input_image: input.photoUrl,
      output_format: "jpg",
      safety_tolerance: 2,
      aspect_ratio: "match_input_image",
    },
  });

  let resultUrl: string | null = null;
  if (typeof output === "string") {
    resultUrl = output;
  } else if (Array.isArray(output) && typeof output[0] === "string") {
    resultUrl = output[0];
  } else if (output && typeof (output as { url?: () => URL }).url === "function") {
    resultUrl = (output as { url: () => URL }).url().toString();
  }
  if (!resultUrl) throw new Error("Replicate вернул неожиданный формат ответа");

  const imgRes = await fetch(resultUrl);
  if (!imgRes.ok) throw new Error(`Не скачали результат: HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const ct = imgRes.headers.get("content-type") || "image/jpeg";

  return {
    imageBase64: buf.toString("base64"),
    imageMime: ct,
    prompt,
    modelUsed: `replicate:${FLUX_KONTEXT_MODEL}`,
    costUsd: COST_FLUX_KONTEXT,
    elapsedMs: Date.now() - t0,
  };
}

// ============================================
// PROVIDER: FAL FLUX PRO FILL (inpaint с маской)
// ============================================
// 100% контроль зоны: белая маска = "только эту область можешь менять".
// Это решает проблему "AI оставил голый бетон в углу" — модель физически
// не может ничего нарисовать вне маски.

async function generateFalFluxFill(input: VisualizationInput): Promise<VisualizationResult> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY не настроен");
  if (!input.maskUrl) throw new Error("fal-flux-fill требует maskUrl (PNG-маску)");
  if (!input.photoUrl) throw new Error("fal-flux-fill требует publichный photoUrl");

  const prompt = input.customPrompt ?? buildVisualizationPrompt(
    input.options,
    Boolean(input.referenceBase64 && input.referenceMime),
    input.referenceDescription,
    input.elements && input.elements.length > 0 ? input.elements : undefined,
  );
  const t0 = Date.now();

  // Используем queue API — FLUX Fill отвечает 15-40 секунд.
  const submitRes = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: input.photoUrl,
      mask_url: input.maskUrl,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: 2,
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`FAL submit ${submitRes.status}: ${txt.slice(0, 300)}`);
  }
  const submitData = (await submitRes.json()) as { status_url: string; response_url: string };

  // Polling статуса
  let attempts = 0;
  while (attempts++ < 80) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(submitData.status_url, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusData = (await statusRes.json()) as { status: string };
    if (statusData.status === "COMPLETED") break;
    if (statusData.status === "FAILED") {
      throw new Error(`FAL FAILED: ${JSON.stringify(statusData).slice(0, 300)}`);
    }
  }

  const finalRes = await fetch(submitData.response_url, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const data = (await finalRes.json()) as { images?: Array<{ url: string }> };
  const imgUrl = data.images?.[0]?.url;
  if (!imgUrl) throw new Error("FAL не вернул URL результата");

  const imgRes = await fetch(imgUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const ct = imgRes.headers.get("content-type") || "image/jpeg";

  return {
    imageBase64: buf.toString("base64"),
    imageMime: ct,
    prompt,
    modelUsed: "fal-ai/flux-pro/v1/fill",
    costUsd: COST_FAL_FLUX_FILL,
    elapsedMs: Date.now() - t0,
  };
}

// ============================================
// PUBLIC API
// ============================================

export async function generateVisualization(
  input: VisualizationInput,
): Promise<VisualizationResult> {
  let provider = input.provider ?? "nano-banana";

  const hasReference = Boolean(input.referenceBase64 && input.referenceMime);
  const hasOverlay = Boolean(input.overlayBase64 && input.overlayMime);
  const hasElements = Boolean(input.elements && input.elements.length > 0);
  const hasMask = Boolean(input.maskUrl);

  // FLUX Kontext не поддерживает multi-image (overlay/reference/elements) → авто-фолбэк на Nano Banana
  if ((hasOverlay || hasReference || hasElements) && provider === "replicate-flux-kontext") {
    provider = "nano-banana";
  }

  // ВАЖНО: FAL FLUX Fill — простой inpaint и НЕ поддерживает multi-image (overlay, reference, elements).
  // Если у нас есть overlay/элементы/референс — даже при наличии маски используем Nano Banana,
  // а маску применим как hard-constraint через sharp composite уже после рендера.
  if (hasMask && provider === "fal-flux-fill" && (hasOverlay || hasReference || hasElements)) {
    provider = "nano-banana";
  }

  if (provider === "nano-banana") return generateNanoBanana(input);
  if (provider === "replicate-flux-kontext") return generateReplicateFlux(input);
  if (provider === "fal-flux-fill") return generateFalFluxFill(input);
  throw new Error(`Unknown provider: ${provider}`);
}
