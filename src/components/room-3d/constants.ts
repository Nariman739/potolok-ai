export const DOOR_HEIGHT_M = 2.0;
export const DOOR_THICKNESS_M = 0.04;
export const WINDOW_HEIGHT_M = 1.4;
export const WINDOW_SILL_M = 0.85;

// Отдельный render-слой ТОЛЬКО для поверхности потолка. Используется при AI-захвате
// для второго прохода рендера: камера видит один этот слой → получаем пиксельно-точную
// маску потолка (белый потолок на чёрном фоне) прямо из Three.js, без AI-угадывания.
// Потом маской «замораживаем» точный потолок поверх AI-рендера комнаты.
export const CEILING_MASK_LAYER = 3;

// Отдельный слой для СВЕЧЕНИЯ парящего потолка (LED-периметр). Оно живёт на кромке/
// верху стены — ВНЕ маски плоскости потолка, поэтому заморозка его не возвращает.
// Снимаем его отдельным проходом → маска периметра → детерминированное мягкое
// пост-свечение по РЕАЛЬНОМУ месту (не «на глаз» от AI). См. AiSceneCapture + addGlow.
export const FLOATING_MASK_LAYER = 4;

// Слой «заслонок» для масок: стены комнаты. Перед проходом маски их рисуем чёрным
// (пишут глубину), чтобы потолок/свечение, скрытые за выступом стены (Г-образная
// комната), не попадали в маску. Светильники в этот слой НЕ входят — софиты/треки
// перед потолком должны оставаться внутри маски заморозки.
export const OCCLUDER_MASK_LAYER = 5;

// Цвета полотна, температуры света и пресеты пола/стен — как в приложении
// (potolok-integration/src/components/room-3d/constants.ts, 11.11.2026, паритет 3D);
// сверх приложения здесь только promptDesc/promptHint для AI-промпта «Фото клиенту».
export const CEILING_COLORS: Array<{ id: string; label: string; hex: string }> = [
  // Белый мат на фото ≈ #EDEDEA–#F2F2EF (нейтральный, без синевы); прежний
  // #F8FAFC имел голубой оттенок и под тёплым светом уходил в серый.
  { id: "white", label: "Белый", hex: "#F3F3F1" },
  { id: "ivory", label: "Слоновая кость", hex: "#F4ECD8" },
  { id: "beige", label: "Бежевый", hex: "#E5DCC4" },
  { id: "graphite", label: "Графит", hex: "#1F2937" },
  { id: "champagne", label: "Шампань", hex: "#D4B886" },
  { id: "blue", label: "Синий", hex: "#3B5BA9" },
];

export const LIGHT_TEMPERATURES = [
  // Цвета по фото (аудит 02.11): 3000K #FFE3BF, 4000K #FBF7F0 (не кремовый), 6000K #ECF2FF.
  { key: "warm", kelvin: 3000, hex: "#FFE3BF", label: "Тёплый", promptHint: "warm 3000K LED lighting, cozy evening atmosphere" },
  { key: "neutral", kelvin: 4000, hex: "#FBF7F0", label: "Нейтральный", promptHint: "neutral 4000K white lighting, balanced atmosphere" },
  { key: "cool", kelvin: 6000, hex: "#ECF2FF", label: "Холодный", promptHint: "cool 6000K daylight, modern fresh atmosphere" },
] as const;

export type LightTempKey = typeof LIGHT_TEMPERATURES[number]["key"];
export const DEFAULT_LIGHT_TEMP: LightTempKey = "neutral";

export function getLightTempByKey(key: string): typeof LIGHT_TEMPERATURES[number] {
  return LIGHT_TEMPERATURES.find((t) => t.key === key) ?? LIGHT_TEMPERATURES[1];
}

// Текстуры пола/стен — те же картинки, что в приложении (public/textures/app/, см.
// textures.ts: веб-версия платформенного модуля). tileM — сколько метров покрывает 1 тайл.
export const FLOOR_PRESETS = [
  { id: "oak_parquet",   label: "Дуб (паркет)",     color: "#A47148", roughness: 0.45, pattern: "wood" as const, tileM: 1.6, promptDesc: "warm oak parquet flooring" },
  { id: "light_laminate",label: "Светлый ламинат",   color: "#C9A876", roughness: 0.45, pattern: "wood" as const, tileM: 1.8, promptDesc: "light beige laminate flooring" },
  { id: "gray_tile",     label: "Серая плитка",      color: "#9A9A9F", roughness: 0.28, pattern: "tile" as const, tileM: 1.2, promptDesc: "matte gray ceramic tile flooring" },
  { id: "dark_parquet",  label: "Тёмный паркет",     color: "#5A4233", roughness: 0.45, pattern: "wood" as const, tileM: 1.6, promptDesc: "dark walnut parquet flooring" },
] as const;
export type FloorPresetId = typeof FLOOR_PRESETS[number]["id"];
export const DEFAULT_FLOOR: FloorPresetId = "light_laminate";

export const WALL_PRESETS = [
  // Дефолт — тёплый off-white (аудит по фото 02.11): серые стены как дефолт — CG-признак.
  { id: "white_paint",        label: "Светлые",            color: "#E4DFD7", roughness: 0.90, pattern: "plaster" as const,  tileM: 2.4, promptDesc: "smooth white matte painted walls" },
  { id: "light_gray",         label: "Светло-серый",        color: "#BBB9B4", roughness: 0.90, pattern: "plaster" as const,  tileM: 2.4, promptDesc: "light gray matte painted walls" },
  { id: "beige_wallpaper",    label: "Бежевые обои",        color: "#E6DAC2", roughness: 0.95, pattern: "wallpaper" as const, tileM: 1.0, promptDesc: "beige neutral wallpaper" },
  { id: "decorative_plaster", label: "Декор. штукатурка",   color: "#DED7CA", roughness: 0.85, pattern: "plaster" as const,  tileM: 1.6, promptDesc: "subtle decorative plaster walls" },
] as const;
export type WallPresetId = typeof WALL_PRESETS[number]["id"];
export const DEFAULT_WALL: WallPresetId = "white_paint";

export function getFloorPreset(id: string): typeof FLOOR_PRESETS[number] {
  return FLOOR_PRESETS.find((f) => f.id === id) ?? FLOOR_PRESETS[1];
}
export function getWallPreset(id: string): typeof WALL_PRESETS[number] {
  return WALL_PRESETS.find((w) => w.id === id) ?? WALL_PRESETS[0];
}

export const MAX_POINT_LIGHTS = 14;
