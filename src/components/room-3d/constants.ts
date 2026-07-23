export const DOOR_HEIGHT_M = 2.0;
export const DOOR_THICKNESS_M = 0.04;
export const WINDOW_HEIGHT_M = 1.4;
export const WINDOW_SILL_M = 0.85;

export const CEILING_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: "white",  label: "Белый",   hex: "#F8FAFC" },
  { id: "ivory",  label: "Слоновая кость", hex: "#F4ECD8" },
  { id: "beige",  label: "Бежевый", hex: "#E5DCC4" },
  { id: "graphite", label: "Графит", hex: "#1F2937" },
  { id: "champagne", label: "Шампань", hex: "#D4B886" },
  { id: "blue", label: "Синий", hex: "#3B5BA9" },
];

export const LIGHT_TEMPERATURES = [
  { key: "warm",    kelvin: 2700, hex: "#FFB37A", label: "Тёплый",      promptHint: "warm 2700K LED lighting, cozy evening atmosphere" },
  { key: "neutral", kelvin: 4000, hex: "#FFE1B3", label: "Нейтральный", promptHint: "neutral 4000K white lighting, balanced atmosphere" },
  { key: "cool",    kelvin: 6500, hex: "#FFFFFF", label: "Холодный",    promptHint: "cool 6500K daylight, modern fresh atmosphere" },
] as const;

export type LightTempKey = typeof LIGHT_TEMPERATURES[number]["key"];
export const DEFAULT_LIGHT_TEMP: LightTempKey = "neutral";

export function getLightTempByKey(key: string): typeof LIGHT_TEMPERATURES[number] {
  return LIGHT_TEMPERATURES.find((t) => t.key === key) ?? LIGHT_TEMPERATURES[1];
}

// Пресеты пола/стен для realtime 3D + AI-промпта.
// textureUrl null → используется plain color. Реальные PBR-текстуры
// (Poly Haven CC0) кладутся в public/textures/floor/{id}.jpg
// и public/textures/wall/{id}.jpg — компонент Room3D подхватит при наличии.
// normalUrl/roughUrl — настоящие PBR-карты (рельеф + шероховатость) с ambientCG
// (CC0). Где заданы — материал перестаёт быть «наклейкой»: дерево ловит свет по
// фактуре доски, штукатурка — по зерну. null = обычная текстура + дешёвый bump.
const WOOD_PBR = {
  color: "/textures/pbr/floor_wood_color.jpg",
  normal: "/textures/pbr/floor_wood_normal.jpg",
  rough: "/textures/pbr/floor_wood_rough.jpg",
};
export const FLOOR_PRESETS = [
  { id: "wood_premium",  label: "Дерево (реализм)", color: "#B08856", roughness: 0.55, textureUrl: WOOD_PBR.color, normalUrl: WOOD_PBR.normal as string | null, roughUrl: WOOD_PBR.rough as string | null, promptDesc: "realistic wood plank flooring" },
  { id: "oak_parquet",   label: "Дуб (паркет)",    color: "#A47148", roughness: 0.45, textureUrl: "/textures/floor/oak_parquet.jpg",   normalUrl: null as string | null, roughUrl: null as string | null, promptDesc: "warm oak parquet flooring" },
  { id: "light_laminate", label: "Светлый ламинат", color: "#C9A876", roughness: 0.50, textureUrl: "/textures/floor/light_laminate.jpg", normalUrl: null as string | null, roughUrl: null as string | null, promptDesc: "light beige laminate flooring" },
  { id: "gray_tile",     label: "Серая плитка",   color: "#8E8E93", roughness: 0.20, textureUrl: "/textures/floor/gray_tile.jpg",    normalUrl: null as string | null, roughUrl: null as string | null, promptDesc: "matte gray ceramic tile flooring" },
  { id: "dark_parquet",  label: "Тёмный паркет",   color: "#3E2723", roughness: 0.35, textureUrl: "/textures/floor/dark_parquet.jpg",  normalUrl: null as string | null, roughUrl: null as string | null, promptDesc: "dark walnut parquet flooring" },
] as const;
export type FloorPresetId = typeof FLOOR_PRESETS[number]["id"];
export const DEFAULT_FLOOR: FloorPresetId = "wood_premium";

// Общий рельеф штукатурки для всех стен — микрофактура вместо плоской заливки.
const WALL_NORMAL = "/textures/pbr/wall_plaster_normal.jpg";
const WALL_ROUGH = "/textures/pbr/wall_plaster_rough.jpg";
export const WALL_PRESETS = [
  { id: "white_paint",   label: "Белая краска",   color: "#F5F5F5", roughness: 0.90, textureUrl: "/textures/wall/white_paint.jpg",   normalUrl: WALL_NORMAL as string | null, roughUrl: WALL_ROUGH as string | null, promptDesc: "smooth white matte painted walls" },
  { id: "light_gray",    label: "Светло-серый",   color: "#D7D7D7", roughness: 0.90, textureUrl: "/textures/wall/light_gray.jpg",    normalUrl: WALL_NORMAL as string | null, roughUrl: WALL_ROUGH as string | null, promptDesc: "light gray matte painted walls" },
  { id: "beige_wallpaper", label: "Бежевые обои", color: "#E8DCC4", roughness: 0.95, textureUrl: "/textures/wall/beige_wallpaper.jpg", normalUrl: WALL_NORMAL as string | null, roughUrl: WALL_ROUGH as string | null, promptDesc: "beige neutral wallpaper" },
  { id: "decorative_plaster", label: "Декор. штукатурка", color: "#E0D9CC", roughness: 0.85, textureUrl: "/textures/wall/decorative_plaster.jpg", normalUrl: WALL_NORMAL as string | null, roughUrl: WALL_ROUGH as string | null, promptDesc: "subtle decorative plaster walls" },
] as const;
export type WallPresetId = typeof WALL_PRESETS[number]["id"];
export const DEFAULT_WALL: WallPresetId = "white_paint";

export function getFloorPreset(id: string): typeof FLOOR_PRESETS[number] {
  return FLOOR_PRESETS.find((f) => f.id === id) ?? FLOOR_PRESETS[1];
}
export function getWallPreset(id: string): typeof WALL_PRESETS[number] {
  return WALL_PRESETS.find((w) => w.id === id) ?? WALL_PRESETS[0];
}
