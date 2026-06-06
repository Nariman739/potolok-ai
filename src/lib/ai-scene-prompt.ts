// Генератор AI-промпта из 3D/2D-сцены конструктора (RoomElement[]).
//
// Используется для sourceType="scene3d" (web-снимок R3F-canvas) и "scene2d"
// (mobile 2D-snapshot плана). В отличие от reference-flow, координаты в текст
// НЕ выводим — Flux Kontext / Gemini всё равно их игнорируют, геометрия
// передаётся через PNG. Из RoomElement[] выводим ТИПЫ и КОЛИЧЕСТВО элементов,
// чтобы AI понимал что должно появиться на потолке.

import type { RoomElement, ElementType } from "./room-types";
import type { CeilingFinish } from "./ai-visualization";

interface SceneGroupedElements {
  spots: number;
  pendants: number;
  chandeliers: number;
  tracks: number;
  lightlines: number;
  floating: number;
  curtains: number;
  subcurtains: number;
  builtinGardinas: number;
  showerCurtains: number;
  furniture: number;
  doors: number;
  windows: number;
}

function groupElements(elements: RoomElement[]): SceneGroupedElements {
  const acc: SceneGroupedElements = {
    spots: 0,
    pendants: 0,
    chandeliers: 0,
    tracks: 0,
    lightlines: 0,
    floating: 0,
    curtains: 0,
    subcurtains: 0,
    builtinGardinas: 0,
    showerCurtains: 0,
    furniture: 0,
    doors: 0,
    windows: 0,
  };
  for (const el of elements) {
    switch (el.type as ElementType) {
      case "spot":
        acc.spots++;
        break;
      case "pendant":
        acc.pendants++;
        break;
      case "chandelier":
        acc.chandeliers++;
        break;
      case "track":
        acc.tracks++;
        break;
      case "lightline":
        acc.lightlines++;
        break;
      case "floating":
        acc.floating++;
        break;
      case "curtain":
        acc.curtains++;
        break;
      case "subcurtain":
        acc.subcurtains++;
        break;
      case "builtin_gardina":
        acc.builtinGardinas++;
        break;
      case "shower_curtain":
        acc.showerCurtains++;
        break;
      case "furniture":
        acc.furniture++;
        break;
      case "door":
        acc.doors++;
        break;
      case "window":
        acc.windows++;
        break;
    }
  }
  return acc;
}

const FINISH_DESCRIPTORS: Record<CeilingFinish, string> = {
  matte: "matte stretched PVC ceiling — soft, non-reflective surface",
  satin: "satin stretched PVC ceiling — slight sheen, very soft reflections",
  glossy: "high-gloss stretched PVC ceiling with mirror-like reflections of the room",
};

export interface LinkedPriceVariantInfo {
  id: string;
  name: string;
  category: string;
  photoUrl?: string | null;
  physicalWidthMm?: number | null;
  physicalHeightMm?: number | null;
  colorHex?: string | null;
  mountingType?: string | null;
}

export interface SceneSourcePromptInput {
  elements: RoomElement[];
  finish: CeilingFinish;
  colorHex?: string;
  colorName?: string;
  /** Дополнительный произвольный текст от мастера. */
  extraPrompt?: string;
  /** "scene3d" — perspective-снимок R3F; "scene2d" — top-down план (mobile). */
  sourceType: "scene3d" | "scene2d";
  /** Готовая фраза про температуру света для добавления в промпт (warm 2700K / neutral 4000K / cool 6500K). */
  lightTempPromptHint?: string;
  /** Конкретные товары из прайса мастера, привязанные к RoomElement'ам — для AI рендера реальных моделей. */
  linkedVariants?: LinkedPriceVariantInfo[];
}

/**
 * Промпт для single-image flow (только сцена, без фото комнаты клиента).
 * Используется когда referenceUrl отсутствует.
 *
 * Принципы (см. ~/.claude/plans/playful-wishing-parnas.md «Принципы качества»):
 *  - AI не «придумывает» — жёсткие границы по числу/типу фикстур.
 *  - 1:1 с замером — точные позиции уже на снимке сцены, текст усиливает.
 *  - Стиль interior design magazine — фотореализм, не CGI.
 */
export function buildScenePrompt(input: SceneSourcePromptInput): string {
  const g = groupElements(input.elements);
  const finishDesc = FINISH_DESCRIPTORS[input.finish];
  const colorHuman = input.colorName ?? input.colorHex ?? "white";

  const fixtures: string[] = [];
  if (g.spots > 0) fixtures.push(`EXACTLY ${g.spots} recessed round LED spotlight${g.spots > 1 ? "s" : ""} (~80mm diameter), white trim, flush-mounted`);
  if (g.pendants > 0)
    fixtures.push(`EXACTLY ${g.pendants} pendant light${g.pendants > 1 ? "s" : ""} hanging from the ceiling`);
  if (g.chandeliers > 0)
    fixtures.push(`EXACTLY ${g.chandeliers} chandelier${g.chandeliers > 1 ? "s" : ""}`);
  if (g.tracks > 0)
    fixtures.push(`EXACTLY ${g.tracks} magnetic track${g.tracks > 1 ? "s" : ""} (slim black or white aluminum profile, 35-50mm wide, with small LED spotlights along it)`);
  if (g.lightlines > 0)
    fixtures.push(`EXACTLY ${g.lightlines} linear LED light line${g.lightlines > 1 ? "s" : ""} (continuous diffused strip, embedded into the ceiling)`);
  if (g.floating > 0) fixtures.push(`floating-ceiling perimeter with hidden LED strip glow (парящий потолок) — uplit edge around the ceiling`);

  const archElements: string[] = [];
  if (g.curtains > 0)
    archElements.push(`${g.curtains} window curtain${g.curtains > 1 ? "s" : ""}`);
  if (g.subcurtains > 0)
    archElements.push(
      `${g.subcurtains} hidden under-ceiling curtain pocket${g.subcurtains > 1 ? "s" : ""} (подшторник — recessed ceiling channel)`,
    );
  if (g.builtinGardinas > 0)
    archElements.push(
      `${g.builtinGardinas} built-in gardina${g.builtinGardinas > 1 ? "s" : ""} (recessed curtain rail integrated into the ceiling)`,
    );
  if (g.showerCurtains > 0) archElements.push(`shower curtain area`);

  const sourceHint =
    input.sourceType === "scene3d"
      ? "INPUT: a CAD-style 3D preview of a room with the stretched ceiling layout. TASK: render it as a high-end photorealistic interior photograph — keep room geometry, walls, doors, windows and furniture POSITIONS exactly as shown."
      : "INPUT: a top-down 2D floor plan of a stretched-ceiling project. TASK: render a photorealistic perspective interior photograph of the same room, with the stretched ceiling installed according to the plan.";

  const lightingPhrase = input.lightTempPromptHint
    ? `Ceiling fixtures emit ${input.lightTempPromptHint}. Soft natural daylight from windows blends with the artificial lighting.`
    : "Soft natural daylight from windows; ceiling fixtures emit neutral 4000K white light.";

  const parts: string[] = [
    "STYLE: professional interior design photography, magazine quality, photorealistic, architectural visualization, wide-angle lens, clean composition, eye-level perspective.",
    sourceHint,
    `CEILING: ${finishDesc}, color ${colorHuman}. The ceiling must look like a real installed натяжной потолок — perfectly flat, no warping, no visible seams.`,
    lightingPhrase,
  ];

  if (fixtures.length > 0) {
    parts.push(
      "MANDATORY ceiling fixtures (render EVERY ONE, do NOT skip, do NOT merge, do NOT add extras):",
      ...fixtures.map((f) => `  • ${f}`),
    );
  }

  if (archElements.length > 0) {
    parts.push("Architectural elements visible in the room:", ...archElements.map((a) => `  • ${a}`));
  }

  if (input.linkedVariants && input.linkedVariants.length > 0) {
    const variantLines = input.linkedVariants.map((v) => {
      const spec: string[] = [];
      if (v.physicalWidthMm) spec.push(`${v.physicalWidthMm}mm wide/diameter`);
      if (v.physicalHeightMm) spec.push(`${v.physicalHeightMm}mm depth/height`);
      if (v.colorHex) spec.push(`body color ${v.colorHex}`);
      if (v.mountingType) spec.push(`${v.mountingType}-mounted`);
      const specStr = spec.length > 0 ? ` — ${spec.join(", ")}` : "";
      return `  • ${v.category}: «${v.name}»${specStr}`;
    });
    parts.push(
      "REAL PRODUCTS from master's catalog — match EXACT appearance (shape, color, mounting style) for all corresponding fixtures:",
      ...variantLines,
    );
  }

  parts.push(
    "STRICT CONSTRAINTS (do not violate):",
    "  • Render ONLY the fixtures and elements listed above. Do NOT add any unspecified lighting, plants, decorations, art, rugs, accessories or extra furniture.",
    "  • Preserve the EXACT spatial positions and counts shown in the source image.",
    "  • No people, no pets, no clutter.",
    "  • No text, no watermarks, no labels.",
    "QUALITY: ultra-detailed textures (wall paint, flooring grain, fabric, metal), sharp focus, clean shadows, 4K render quality.",
  );

  if (input.extraPrompt) parts.push("MASTER NOTE: " + input.extraPrompt);

  return parts.join("\n");
}

export interface HybridScenePromptInput extends SceneSourcePromptInput {
  /** Описание референс-фото комнаты клиента (от Claude vision). */
  referenceDescription?: string;
}

/**
 * Промпт для гибридного flow: сцена конструктора + фото реальной комнаты.
 * Gemini получает 2 изображения: photo (image-1) + scene (image-2).
 *
 * Цель — точно вставить потолок мастера в реальное фото клиента, не меняя
 * мебель/стены. Жёсткий «do not modify» контракт защищает от претензий
 * клиента после монтажа («а у меня в реале не так выглядит»).
 */
export function buildHybridScenePrompt(input: HybridScenePromptInput): string {
  const baseScene = buildScenePrompt(input);
  const refHint = input.referenceDescription
    ? `Reference photo context: ${input.referenceDescription}`
    : "";

  return [
    "TWO INPUT IMAGES:",
    `  image-1: PHOTO of the real client's room — ground truth for walls, floor, windows, doors, existing furniture, lighting direction, vibe.`,
    `  image-2: ${input.sourceType === "scene3d" ? "3D perspective" : "2D top-down plan"} from the ceiling designer — ground truth ONLY for the ceiling layout (fixtures, finish, color, mounting type).`,
    "",
    "TASK: produce a photorealistic interior photograph of the SAME room shown in image-1, with the new stretched ceiling and fixtures from image-2 installed.",
    "",
    "MANDATORY PRESERVATION from image-1 (do NOT alter):",
    "  • Walls — colors, textures, paint imperfections, decorative elements stay identical.",
    "  • Floor — material, pattern, color stay identical.",
    "  • Windows, doors — positions, frames, glass, view outside stay identical.",
    "  • Existing furniture — every piece in the same position, same model, same upholstery.",
    "  • Room geometry, camera angle, perspective — match image-1 exactly.",
    "",
    "REPLACE ONLY from image-2:",
    "  • The ceiling surface (натяжной потолок with the specified finish & color).",
    "  • Ceiling-mounted fixtures (spotlights, chandeliers, tracks, LED lines, floating perimeter) per counts below.",
    "",
    refHint,
    "",
    baseScene,
  ].filter(Boolean).join("\n");
}
