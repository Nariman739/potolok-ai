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

export interface SceneSourcePromptInput {
  elements: RoomElement[];
  finish: CeilingFinish;
  colorHex?: string;
  colorName?: string;
  /** Дополнительный произвольный текст от мастера. */
  extraPrompt?: string;
  /** "scene3d" — perspective-снимок R3F; "scene2d" — top-down план (mobile). */
  sourceType: "scene3d" | "scene2d";
}

/**
 * Промпт для single-image flow (только сцена, без фото комнаты клиента).
 * Используется когда referenceUrl отсутствует.
 */
export function buildScenePrompt(input: SceneSourcePromptInput): string {
  const g = groupElements(input.elements);
  const finishDesc = FINISH_DESCRIPTORS[input.finish];
  const colorHuman = input.colorName ?? input.colorHex ?? "white";

  const fixtures: string[] = [];
  if (g.spots > 0) fixtures.push(`EXACTLY ${g.spots} recessed spotlight${g.spots > 1 ? "s" : ""}`);
  if (g.pendants > 0)
    fixtures.push(`EXACTLY ${g.pendants} pendant light${g.pendants > 1 ? "s" : ""}`);
  if (g.chandeliers > 0)
    fixtures.push(`EXACTLY ${g.chandeliers} chandelier${g.chandeliers > 1 ? "s" : ""}`);
  if (g.tracks > 0)
    fixtures.push(`EXACTLY ${g.tracks} magnetic track${g.tracks > 1 ? "s" : ""}`);
  if (g.lightlines > 0)
    fixtures.push(`EXACTLY ${g.lightlines} linear LED light line${g.lightlines > 1 ? "s" : ""}`);
  if (g.floating > 0) fixtures.push(`floating-ceiling LED perimeter strip (parящий with LED)`);

  const archElements: string[] = [];
  if (g.curtains > 0)
    archElements.push(`${g.curtains} window curtain${g.curtains > 1 ? "s" : ""}`);
  if (g.subcurtains > 0)
    archElements.push(
      `${g.subcurtains} hidden under-ceiling curtain pocket${g.subcurtains > 1 ? "s" : ""} (подшторник)`,
    );
  if (g.builtinGardinas > 0)
    archElements.push(
      `${g.builtinGardinas} built-in gardina${g.builtinGardinas > 1 ? "s" : ""} (recessed curtain rail)`,
    );
  if (g.showerCurtains > 0) archElements.push(`shower curtain area`);

  const sourceHint =
    input.sourceType === "scene3d"
      ? "Source image is a 3D rendering preview from a CAD-style room designer — convert it into a photorealistic interior photograph while preserving exact room geometry, walls, doors, windows and furniture positions."
      : "Source image is a TOP-DOWN 2D plan (floor plan view) of a stretched-ceiling project. Interpret the schematic markers and convert into a realistic perspective interior photograph of a furnished living room with the stretched ceiling installed.";

  const parts: string[] = [sourceHint, `${finishDesc}, color ${colorHuman}`];

  if (fixtures.length > 0) {
    parts.push(
      "Ceiling fixtures that MUST appear on the ceiling (do NOT skip, do NOT merge into one fixture):",
      ...fixtures.map((f) => `  - ${f}`),
    );
  }

  if (archElements.length > 0) {
    parts.push("Architectural elements visible in the room:", ...archElements.map((a) => `  - ${a}`));
  }

  parts.push(
    "Realistic interior photography, soft natural daylight from windows, accurate textures on walls/floor/furniture",
    "Warm cozy residential atmosphere, ultra-detailed, sharp focus, 4K",
  );

  if (input.extraPrompt) parts.push(input.extraPrompt);

  return parts.join("\n");
}

export interface HybridScenePromptInput extends SceneSourcePromptInput {
  /** Описание референс-фото комнаты клиента (от Claude vision). */
  referenceDescription?: string;
}

/**
 * Промпт для гибридного flow: сцена конструктора + фото реальной комнаты.
 * Gemini получает 2 изображения: photo (image-1) + scene (image-2).
 */
export function buildHybridScenePrompt(input: HybridScenePromptInput): string {
  const baseScene = buildScenePrompt(input);
  const refHint = input.referenceDescription
    ? `Reference photo (image-1) shows the actual room: ${input.referenceDescription}`
    : "Reference photo (image-1) shows the actual room of the client.";

  return [
    "You receive TWO images:",
    `  image-1: PHOTO of the real client's room — use this for wall colors/textures, flooring, existing furniture, window positions, lighting direction.`,
    `  image-2: SCENE from the ceiling designer (${input.sourceType === "scene3d" ? "3D perspective" : "2D top-down plan"}) — use this ONLY for the ceiling layout (fixtures, finish, color, attachment type).`,
    "",
    "Output: a photorealistic interior photograph of the SAME room as in image-1, but with the new stretched ceiling INSTALLED according to image-2. Preserve walls/furniture/windows from image-1, replace ceiling and fixtures with what's specified in image-2 + the description below.",
    "",
    refHint,
    "",
    baseScene,
  ].join("\n");
}
