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
