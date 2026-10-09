// Генератор AI-промпта из 3D/2D-сцены конструктора (RoomElement[]).
//
// Используется для sourceType="scene3d" (web-снимок R3F-canvas) и "scene2d"
// (mobile 2D-snapshot плана). В отличие от reference-flow, координаты в текст
// НЕ выводим — Flux Kontext / Gemini всё равно их игнорируют, геометрия
// передаётся через PNG. Из RoomElement[] выводим ТИПЫ и КОЛИЧЕСТВО элементов,
// чтобы AI понимал что должно появиться на потолке.

import type { RoomElement, ElementType, FurnitureType } from "./room-types";
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
  /** Температура света в Кельвинах — фолбэк, если lightTempPromptHint не передан. */
  kelvin?: number;
  /** Конкретные товары из прайса мастера, привязанные к RoomElement'ам — для AI рендера реальных моделей. */
  linkedVariants?: LinkedPriceVariantInfo[];
  /** Описание пресета пола (oak parquet / light laminate / gray tile / dark parquet). */
  floorPromptDesc?: string;
  /** Описание пресета стен (white paint / light gray / beige wallpaper / decorative plaster). */
  wallPromptDesc?: string;
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

  const surfaceDescriptors: string[] = [];
  if (input.floorPromptDesc) surfaceDescriptors.push(`floor: ${input.floorPromptDesc}`);
  if (input.wallPromptDesc) surfaceDescriptors.push(`walls: ${input.wallPromptDesc}`);
  const surfacePhrase =
    surfaceDescriptors.length > 0
      ? `ROOM SURFACES: ${surfaceDescriptors.join("; ")}. Apply these finishes consistently across the visible room.`
      : null;

  const parts: string[] = [
    "STYLE: professional interior design photography, magazine quality, photorealistic, architectural visualization, wide-angle lens, clean composition, eye-level perspective.",
    sourceHint,
    `CEILING: ${finishDesc}, color ${colorHuman}. The ceiling must look like a real installed натяжной потолок — perfectly flat, no warping, no visible seams.`,
    ...(surfacePhrase ? [surfacePhrase] : []),
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

/**
 * Промпт для пути «заморозка потолка»: точный потолок мы возвращаем из 3D по маске
 * ПОСЛЕ рендера (compositeWithMask). Потолок = наш продукт (заморожен), а МЕБЕЛЬ в 3D —
 * это лишь болванки-плейсхолдеры, НЕ наш продукт. Поэтому даём модели свободу ЗАМЕНИТЬ
 * болванки на реальную красивую мебель того же типа в тех же местах — так nano делает
 * настоящее «журнальное» фото, а не осторожно перекрашивает CG-кубики (вариант V3,
 * подтверждён на реальных кадрах 06.08 — заметно живее «сохрани точь-в-точь»).
 */
/** Двойной якорь температуры (Кельвин + слово) из готовой фразы или из kelvin.
 * Двойной якорь надёжнее одиночного: nano уверенно ловит и число, и настроение. */
function resolveLightTempHint(input: SceneSourcePromptInput): string {
  if (input.lightTempPromptHint) return input.lightTempPromptHint;
  const k = input.kelvin;
  if (typeof k === "number") {
    if (k <= 3300) return "very warm cozy 2700-3000K light (golden, amber, inviting)";
    if (k >= 5000) return "cool crisp 6000-6500K daylight (bright, clean, slightly bluish, modern)";
    return "neutral clean 4000K white light (balanced, true colors)";
  }
  return "warm interior light";
}

/** Как назвать болванку мебели в промпте (тип → реальный предмет того же типа). */
const FURNITURE_PHRASES: Record<FurnitureType, [string, string]> = {
  bed: ["bed", "beds"],
  sofa: ["sofa", "sofas"],
  table: ["table", "tables"],
  wardrobe: ["wardrobe / tall cabinet", "wardrobes / tall cabinets"],
  tv: ["wall-mounted TV", "wall-mounted TVs"],
  nightstand: ["nightstand", "nightstands"],
  chair: ["chair", "chairs"],
  desk: ["desk", "desks"],
  radiator: ["radiator", "radiators"],
  kitchen: ["kitchen unit", "kitchen units"],
  wall_panel: ["wall panel", "wall panels"],
};

/** «1 table, 2 chairs» — точный состав мебели со сцены (чтобы AI не добавлял своё). */
function describeFurniture(elements: RoomElement[]): string[] {
  const counts = new Map<FurnitureType, number>();
  for (const el of elements) {
    if (el.type !== "furniture") continue;
    const t = (el.furnitureType ?? "table") as FurnitureType;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([t, n]) => {
    const [one, many] = FURNITURE_PHRASES[t] ?? [t, t + "s"];
    return `${n} ${n > 1 ? many : one}`;
  });
}

export function buildFrozenCeilingScenePrompt(input: SceneSourcePromptInput): string {
  const g = groupElements(input.elements);
  const furniture = describeFurniture(input.elements);
  const surfaces: string[] = [];
  if (input.floorPromptDesc) surfaces.push(`real ${input.floorPromptDesc} with visible grain and soft natural reflections`);
  if (input.wallPromptDesc) surfaces.push(`real matte ${input.wallPromptDesc} with subtle plaster texture and soft light gradients`);
  const tempHint = resolveLightTempHint(input);
  // Привязываем температуру и к дневному свету, и к САМИМ фикстурам (не только ambient) —
  // иначе выбор мастера читается слабо.
  const lighting = `soft natural daylight from the window blended with ${tempHint}; ALL ceiling fixtures and LED glow emit exactly this ${tempHint} color temperature`;

  // Финиш влияет на блики потолка. При глянце просим отражения светильников/окна.
  const finishLine =
    input.finish === "glossy"
      ? "The ceiling surface is HIGH-GLOSS lacquered stretch fabric — add soft mirror-like reflections of the room, fixtures and window on it."
      : input.finish === "satin"
      ? "The ceiling surface is SATIN stretch fabric — very soft, gentle sheen, faint reflections."
      : "The ceiling surface is MATTE stretch fabric — soft, non-reflective, even.";

  // Инструкция по потолку зависит от типа. Парящий (floating) — свечение живёт на
  // ПЕРИМЕТРЕ / верху стены, ВНЕ маски заморозки → его обязан нарисовать AI, иначе
  // потолок выходит плоско-белым (проверено 08.08). Описываем периметр как ПЕРВИЧНЫЙ
  // источник света. Для остального ПЛОСКОГО потолка поле отдаём заморозке.
  // 09.10: парящий почти всегда стоит НЕ по всему периметру, а на 1-2 стенах (wallProfiles
  // мобилки) — старая формулировка «around the ENTIRE perimeter» заставляла AI светить
  // везде, а на нужной стене выходила бледная нитка. Теперь: только размеченные стены
  // (в 3D-превью на них видна светящаяся полоска у потолка), яркое ядро + wash вниз.
  const floatingWalls = g.floating;
  const ceilingLine =
    floatingWalls > 0
      ? `CEILING — THIS IS THE HERO: a flat stretch ceiling with a FLOATING profile («парящий потолок») on ${floatingWalls === 1 ? "ONE wall only" : `${floatingWalls} walls only`} — exactly the wall${floatingWalls > 1 ? "s" : ""} where the 3D preview shows a thin glowing strip at the ceiling edge. Along ${floatingWalls === 1 ? "that wall" : "those walls"} render a continuous recessed LED cove: a crisp 2-3 cm glowing slot between the ceiling and the wall, with a BRIGHT ${tempHint} core along its full length, and a soft warm wash of light grazing down the wall about 40 cm, fading smoothly to the normal wall tone — like real photos of floating stretch ceilings. The ceiling appears to float, detached from that wall by the glowing gap. On ALL OTHER walls the ceiling meets the wall in a plain clean corner — NO glow, NO strip, NO cornice there. ${finishLine}`
      : `The ceiling is a flat stretch ceiling; its surface is composited back separately afterward, so keep it a clean plain light surface and spend the effort on the ROOM. ${finishLine}`;

  // Фикстуры НА плоскости потолка (споты/трек/линия/люстра/подвес) точный вид держит
  // заморозка из 3D, но перечисляем их, чтобы AI выдержал согласованное освещение и
  // НЕ дорисовывал случайных светильников (наблюдали ложный спот на стене).
  const ceilingFixtures: string[] = [];
  if (g.spots > 0) ceilingFixtures.push(`${g.spots} small recessed round LED spotlight${g.spots > 1 ? "s" : ""} flush in the ceiling`);
  if (g.tracks > 0) ceilingFixtures.push(`${g.tracks} slim magnetic track${g.tracks > 1 ? "s" : ""} with tiny LED spots`);
  if (g.lightlines > 0) ceilingFixtures.push(`${g.lightlines} recessed linear LED light line${g.lightlines > 1 ? "s" : ""}`);
  if (g.pendants > 0) ceilingFixtures.push(`${g.pendants} pendant light${g.pendants > 1 ? "s" : ""}`);
  if (g.chandeliers > 0) ceilingFixtures.push(`${g.chandeliers} chandelier${g.chandeliers > 1 ? "s" : ""}`);

  // Архитектурные элементы ВНЕ потолка (шторы/гардина/подшторник) — их заморозка НЕ
  // возвращает (они на стенах/окне), поэтому их обязан нарисовать AI, иначе исчезнут.
  const archNotes: string[] = [];
  if (g.curtains > 0) archNotes.push(`real floor-length fabric curtains framing the window`);
  if (g.builtinGardinas > 0) archNotes.push(`a recessed ceiling curtain niche (gardina) running along the window wall with drapes`);
  if (g.subcurtains > 0) archNotes.push(`a slim recessed curtain pocket where the ceiling meets the window wall`);
  if (g.showerCurtains > 0) archNotes.push(`a glass shower partition in that spot`);

  // 09.10 фидбек владельца: «чересчур много растений и лишнего» — AI ставил диван+кресло+
  // журнальный столик+шкафы+4 растения на месте ОДНОГО стола. Теперь мебель — строго по
  // составу сцены (тип и количество), без примеров «sofa → …», которые сами провоцировали
  // появление дивана; пустая сцена → пустая комната.
  const furnitureBlock =
    furniture.length > 0
      ? [
          `FURNITURE: the flat grey/CG objects in the preview are crude 3D PLACEHOLDERS — REPLACE each with a real, beautifully made piece of the SAME type, at the SAME spot and roughly the SAME size (solid wood, real fabric, brushed metal, visible texture). The room contains EXACTLY ${furniture.join(", ")} — nothing more: no extra sofa, armchair, coffee table, chairs, shelves, cabinets or wardrobes.`,
        ]
      : [
          "FURNITURE: the scene has NO furniture — keep the room EMPTY (a freshly renovated, unfurnished room). Do NOT add any furniture at all.",
        ];
  // Количество окон/дверей в текст НЕ выводим: дверь часто за спиной камеры, а «1 door»
  // заставлял AI дорисовать её на видимой стене (прогон 09.10). Только «как на превью».
  const openingsLine = `OPENINGS: windows and doors ONLY exactly where the preview shows them${g.windows + g.doors === 0 ? " (this room shows none)" : ""}. Do NOT add any window or door that is not visible in the preview — openings behind the camera stay unseen${g.windows > 0 ? "; windows → real glass with a soft hint of view outside" : ""}${g.doors > 0 ? "; doors → real painted/veneer door with frame & handle" : ""}.`;
  const wallLine = input.wallPromptDesc
    ? null
    : "Walls: plain, solid, light neutral painted walls (one calm color), no wallpaper pattern, no panels, no slats.";
  const lightingFull =
    floatingWalls > 0
      ? `${lighting}. Moderate ambient light — the walls must NOT be overexposed, so that the LED cove glow stands out clearly against the wall.`
      : `${lighting}.`;

  const parts: string[] = [
    "Generate a NEW image: a REAL photograph of this exact room, as if shot by a professional interior photographer on a full-frame DSLR — high-end magazine quality. The input is only a rough 3D CAD preview with flat CG shading; the output must look nothing like a render. The stretch ceiling is the HERO of the shot; the room is a calm, clean, minimal backdrop for it.",
    "Re-photograph EVERY surface outside the ceiling: real floor with visible material texture (wood grain and plank joints, or tile joints — matching the floor in the preview) and soft natural reflections; real matte painted walls with subtle texture and gentle light gradients; real materials on every object; natural photographic contrast. Remove CG artifacts (blown-out white patches on the floor, flat shading, plastic look). Minimal means FEW objects, not CG — every one photographed for real.",
    "",
    ...furnitureBlock,
    "",
    "NO EXTRA DECOR: no plants (at most ONE small plant in the whole frame, or none), no vases, no flowers, no rugs or carpets, no artwork or pictures, no books, no cushion piles, no floor or table lamps, no shelves with objects, no clutter. Keep the room clean and minimal.",
    "",
    openingsLine,
    ...(wallLine ? [wallLine] : []),
    ...(surfaces.length ? ["Room surfaces: " + surfaces.join("; ") + "."] : []),
    ...(archNotes.length ? ["", "Also render these room elements (they belong to this project): " + archNotes.join("; ") + "."] : []),
    "",
    `LIGHTING: ${lightingFull} Real soft shadows, gentle ambient occlusion in corners and under objects, subtle indirect bounce light — photographic depth, NOT flat even CG shading.`,
    ...(ceilingFixtures.length
      ? ["", `The ceiling has ONLY these fixtures (do not invent extra lights): ${ceilingFixtures.join("; ")}.`]
      : []),
    ...(input.linkedVariants && input.linkedVariants.length > 0
      ? [
          "",
          "REAL PRODUCTS from the master's catalog — match the appearance (shape, color, mounting) of the corresponding fixtures:",
          ...input.linkedVariants.map((v) => {
            const spec: string[] = [];
            if (v.physicalWidthMm) spec.push(`${v.physicalWidthMm}mm wide/diameter`);
            if (v.physicalHeightMm) spec.push(`${v.physicalHeightMm}mm depth/height`);
            if (v.colorHex) spec.push(`body color ${v.colorHex}`);
            if (v.mountingType) spec.push(`${v.mountingType}-mounted`);
            const specStr = spec.length > 0 ? ` — ${spec.join(", ")}` : "";
            return `  • ${v.category}: «${v.name}»${specStr}`;
          }),
        ]
      : []),
    "",
    "PALETTE: calm, cohesive, warm-minimalist — a tight neutral palette (warm whites, greige, natural oak). Serene, uncluttered, editorial. No garish colors, no busy patterns, no visual noise.",
    "",
    "KEEP THE SAME: overall room layout & proportions, wall positions, window & door positions, the ceiling fixtures, and the CAMERA angle & perspective. Do NOT add extra rooms, niches, columns or change the architecture. No people, no pets, no text, no watermark, no UI.",
    "",
    ceilingLine,
    "Ultra photorealistic, sharp focus, natural photographic lighting, 4K.",
  ];
  if (input.extraPrompt) parts.push("", "MASTER NOTE: " + input.extraPrompt);
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
