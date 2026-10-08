// Снапшот комнаты из мобильного конструктора → нормализованная сцена для веб-3D.
//
// Мобилка шлёт { vertices (см, замкнутый контур), ceilingHeight (см), elements,
// ceilingFinish?, ceilingColorId?, wallProfiles? }. Здесь:
//   1) validateSnapshot — защита сервера (размеры, числа, лимиты);
//   2) normalizeSnapshot — приводит к тому, что умеет рисовать веб-Scene3D:
//      - контур замыкается (последняя вершина = первая), как в getVertices веба;
//      - элементы: только известные типы и поля, круглые (shape:"circle") трек/
//        светолиния → замкнутая ломаная из 24 отрезков;
//      - wallProfiles: «парящий» → элемент floating на стене, «подшторник» →
//        subcurtain, «теневой» → shadowGapWalls (Scene3D рисует тёмный зазор).
// Модуль без React/Three — импортится и сервером (API), и клиентом (/render-scene).

import type { ElementType, FurnitureType, RoomElement, Vertex2D } from "./room-types";

export type CeilingFinishId = "matte" | "satin" | "glossy";
export type LightTempKeyId = "warm" | "neutral" | "cool";

export interface SceneSnapshot {
  vertices: Vertex2D[];
  ceilingHeight: number;
  elements: RoomElement[];
  ceilingFinish?: CeilingFinishId;
  ceilingColorId?: string;
  wallProfiles?: Record<string, string>;
}

export interface NormalizedScene {
  vertices: Vertex2D[];
  /** Длины стен (см) — Scene3D принимает, но не использует; заполняем для полноты. */
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  shadowGapWalls: number[];
  /** Сводка профилей для промпта/отчёта: { floating: 2, shadow: 1, ... }. */
  profileSummary: Record<string, number>;
}

/** Настройки «вида», которые уходят и в 3D (initialLook), и в AI-промпт. */
export interface ScenePresets {
  finish: CeilingFinishId;
  colorId: string;
  lightTempKey: LightTempKeyId;
  floorId?: string;
  wallId?: string;
}

const ELEMENT_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "spot", "pendant", "chandelier", "curtain", "subcurtain", "track", "lightline",
  "floating", "door", "window", "furniture", "builtin_gardina", "shower_curtain",
]);
const FURNITURE_TYPES: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
  "bed", "sofa", "table", "wardrobe", "tv", "nightstand", "chair", "desk", "radiator",
  "kitchen", "wall_panel",
]);

const MAX_VERTICES = 200;
const MAX_ELEMENTS = 600;
const MAX_POINTS = 200;
const MAX_ABS_CM = 100_000; // 1 км — всё, что больше, явно мусор
const CIRCLE_SEGMENTS = 24;

export class SnapshotError extends Error {}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const okCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) <= MAX_ABS_CM;

function cleanPoint(p: unknown): Vertex2D | null {
  if (!p || typeof p !== "object") return null;
  const { x, y } = p as { x?: unknown; y?: unknown };
  return okCoord(x) && okCoord(y) ? { x, y } : null;
}

/** Бросает SnapshotError с человеческим текстом, если снапшот непригоден. */
export function validateSnapshot(raw: unknown): SceneSnapshot {
  if (!raw || typeof raw !== "object") throw new SnapshotError("snapshot: ожидается объект");
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.vertices)) throw new SnapshotError("snapshot.vertices: ожидается массив");
  if (s.vertices.length < 3 || s.vertices.length > MAX_VERTICES) {
    throw new SnapshotError(`snapshot.vertices: от 3 до ${MAX_VERTICES} точек`);
  }
  const vertices: Vertex2D[] = [];
  for (const v of s.vertices) {
    const p = cleanPoint(v);
    if (!p) throw new SnapshotError("snapshot.vertices: точки {x,y} в см");
    vertices.push(p);
  }
  if (!isNum(s.ceilingHeight) || s.ceilingHeight < 150 || s.ceilingHeight > 800) {
    throw new SnapshotError("snapshot.ceilingHeight: см, 150..800");
  }
  const elements = Array.isArray(s.elements) ? s.elements : [];
  if (elements.length > MAX_ELEMENTS) throw new SnapshotError(`snapshot.elements: максимум ${MAX_ELEMENTS}`);
  const finish = s.ceilingFinish === "satin" || s.ceilingFinish === "glossy" ? s.ceilingFinish : s.ceilingFinish === "matte" ? "matte" : undefined;
  const wallProfiles: Record<string, string> = {};
  if (s.wallProfiles && typeof s.wallProfiles === "object" && !Array.isArray(s.wallProfiles)) {
    for (const [k, v] of Object.entries(s.wallProfiles as Record<string, unknown>)) {
      if (/^\d{1,3}$/.test(k) && typeof v === "string" && v.length <= 40) wallProfiles[k] = v;
    }
  }
  return {
    vertices,
    ceilingHeight: s.ceilingHeight,
    elements: elements as RoomElement[],
    ceilingFinish: finish,
    ceilingColorId: typeof s.ceilingColorId === "string" ? s.ceilingColorId.slice(0, 40) : undefined,
    wallProfiles,
  };
}

function cleanElement(raw: unknown, idx: number): RoomElement | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const type = e.type as ElementType;
  if (!ELEMENT_TYPES.has(type)) return null;
  const out: RoomElement = {
    id: typeof e.id === "string" && e.id.length <= 80 ? e.id : `el-${idx}`,
    type,
  };
  if (okCoord(e.x)) out.x = e.x;
  if (okCoord(e.y)) out.y = e.y;
  if (Number.isInteger(e.wallIndex) && (e.wallIndex as number) >= 0 && (e.wallIndex as number) < MAX_VERTICES) {
    out.wallIndex = e.wallIndex as number;
  }
  if (isNum(e.wallPosition) && e.wallPosition > -2 && e.wallPosition < 3) out.wallPosition = e.wallPosition;
  if (isNum(e.length) && e.length > 0 && e.length <= MAX_ABS_CM) out.length = e.length;
  if (e.variant === "ours" || e.variant === "client") out.variant = e.variant;
  if (typeof e.furnitureType === "string" && FURNITURE_TYPES.has(e.furnitureType as FurnitureType)) {
    out.furnitureType = e.furnitureType as FurnitureType;
  }
  if (isNum(e.width) && e.width > 0 && e.width <= MAX_ABS_CM) out.width = e.width;
  if (isNum(e.height) && e.height > 0 && e.height <= MAX_ABS_CM) out.height = e.height;
  if (isNum(e.rotation)) out.rotation = e.rotation;
  if (e.closed === true) out.closed = true;
  if (e.ceilingMode === "decor" || e.ceilingMode === "to-ceiling" || e.ceilingMode === "planned") {
    out.ceilingMode = e.ceilingMode;
  }
  if (Array.isArray(e.points)) {
    const pts = (e.points as unknown[]).slice(0, MAX_POINTS).map(cleanPoint).filter((p): p is Vertex2D => !!p);
    if (pts.length >= 2) out.points = pts;
  }
  // Мобилка: круглая светолиния/трек — центр cx/cy + radius. Веб-3D круги не умеет →
  // аппроксимируем замкнутой ломаной (Scene3D рисует все отрезки ломаной).
  if (e.shape === "circle" && okCoord(e.cx) && okCoord(e.cy) && isNum(e.radius) && e.radius > 1 && e.radius < 5000) {
    const pts: Vertex2D[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: e.cx + Math.cos(a) * e.radius, y: e.cy + Math.sin(a) * e.radius });
    }
    out.points = pts;
    out.closed = true;
    delete out.wallIndex;
  }
  // Мебель произвольной формы: веб рисует по width/height, polygonPoints пропускаем.
  return out;
}

function closeContour(vertices: Vertex2D[]): Vertex2D[] {
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (Math.abs(first.x - last.x) < 0.5 && Math.abs(first.y - last.y) < 0.5) return vertices;
  return [...vertices, { ...first }];
}

export function normalizeSnapshot(snap: SceneSnapshot): NormalizedScene {
  const vertices = closeContour(snap.vertices);
  const wallCount = vertices.length - 1;
  const walls: number[] = [];
  for (let i = 0; i < wallCount; i++) {
    walls.push(Math.hypot(vertices[i + 1].x - vertices[i].x, vertices[i + 1].y - vertices[i].y));
  }

  const elements: RoomElement[] = [];
  snap.elements.forEach((raw, i) => {
    const el = cleanElement(raw, i);
    if (!el) return;
    if (el.wallIndex !== undefined && el.wallIndex >= wallCount) delete el.wallIndex;
    elements.push(el);
  });

  // Профили периметра (мобильный wallProfiles: { "0": "floating", "2": "shadow" }).
  const shadowGapWalls: number[] = [];
  const profileSummary: Record<string, number> = {};
  for (const [k, profile] of Object.entries(snap.wallProfiles ?? {})) {
    const wi = Number(k);
    if (!Number.isInteger(wi) || wi < 0 || wi >= wallCount) continue;
    profileSummary[profile] = (profileSummary[profile] ?? 0) + 1;
    const has = (t: ElementType) => elements.some((e) => e.type === t && e.wallIndex === wi);
    if (profile === "floating") {
      if (!has("floating")) {
        elements.push({ id: `profile-floating-${wi}`, type: "floating", wallIndex: wi, wallPosition: 0.5 });
      }
    } else if (profile === "subcurtain" || profile === "subcurtain_light") {
      if (!has("subcurtain")) {
        elements.push({ id: `profile-subcurtain-${wi}`, type: "subcurtain", wallIndex: wi, wallPosition: 0.5 });
      }
    } else if (profile === "shadow") {
      shadowGapWalls.push(wi);
    }
  }

  return { vertices, walls, ceilingHeight: snap.ceilingHeight, elements, shadowGapWalls, profileSummary };
}

const KELVIN_TO_KEY: Record<number, LightTempKeyId> = { 2700: "warm", 4000: "neutral", 6500: "cool" };

export function presetsFromRequest(
  snap: SceneSnapshot,
  req: { kelvin?: unknown; finish?: unknown; floorPresetId?: unknown; wallPresetId?: unknown; ceilingColorId?: unknown },
): ScenePresets {
  const finishRaw = req.finish ?? snap.ceilingFinish;
  const finish: CeilingFinishId = finishRaw === "satin" || finishRaw === "glossy" ? finishRaw : "matte";
  const lightTempKey = (typeof req.kelvin === "number" && KELVIN_TO_KEY[req.kelvin]) || "neutral";
  const colorId =
    (typeof req.ceilingColorId === "string" && req.ceilingColorId) || snap.ceilingColorId || "white";
  return {
    finish,
    colorId: colorId.slice(0, 40),
    lightTempKey,
    floorId: typeof req.floorPresetId === "string" ? req.floorPresetId.slice(0, 40) : undefined,
    wallId: typeof req.wallPresetId === "string" ? req.wallPresetId.slice(0, 40) : undefined,
  };
}
