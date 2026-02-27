export type ProductCategory =
  | "canvas"
  | "profile"
  | "spot"
  | "chandelier"
  | "curtain"
  | "gardina"
  | "podshtornik"
  | "corner"
  | "other"
  | "special";

export interface ProductItem {
  code: string;
  name: string;
  unit: string;
  defaultPrice: number;
  category: ProductCategory;
  description?: string;
}

export const PRODUCT_ITEMS: ProductItem[] = [
  // Полотно (за м²)
  { code: "canvas_320", name: "Полотно матовое 320см", unit: "м²", defaultPrice: 1800, category: "canvas", description: "Ширина до 3.2м" },
  { code: "canvas_550", name: "Полотно сатиновое 550см", unit: "м²", defaultPrice: 2200, category: "canvas", description: "Ширина до 5.5м" },
  { code: "canvas_over", name: "Полотно глянцевое/цветное", unit: "м²", defaultPrice: 2800, category: "canvas", description: "Любая ширина" },

  // Профили (за м.п.)
  { code: "profile_plastic", name: "Пластиковый профиль", unit: "м.п.", defaultPrice: 500, category: "profile", description: "Багет (под галтель или вставку)" },
  { code: "insert", name: "Вставка", unit: "м.п.", defaultPrice: 100, category: "profile", description: "Маскировочная лента" },
  { code: "profile_shadow", name: "Теневой профиль", unit: "м.п.", defaultPrice: 1400, category: "profile", description: "Алюминиевый теневой зазор" },
  { code: "profile_floating", name: "Парящий профиль", unit: "м.п.", defaultPrice: 1600, category: "profile", description: "Алюминиевый с подсветкой" },

  // Светильники (за шт.)
  { code: "spot_client", name: "Споты (клиентские)", unit: "шт.", defaultPrice: 500, category: "spot", description: "Установка клиентских" },
  { code: "spot_ours", name: "Споты GX53 (наши)", unit: "шт.", defaultPrice: 1500, category: "spot", description: "GX53 в комплекте" },
  { code: "spot_double", name: "Споты двойные LED", unit: "шт.", defaultPrice: 2500, category: "spot", description: "Двойные LED-споты" },

  // Люстры
  { code: "chandelier", name: "Люстра (закладная)", unit: "шт.", defaultPrice: 2000, category: "chandelier" },
  { code: "transformer", name: "Трансформатор", unit: "шт.", defaultPrice: 3000, category: "chandelier" },
  { code: "track_magnetic", name: "Трек магнитный", unit: "м.п.", defaultPrice: 5000, category: "chandelier" },
  { code: "light_line", name: "Световая линия", unit: "м.п.", defaultPrice: 4500, category: "chandelier" },

  // Карнизы (за м.п.)
  { code: "curtain_ldsp", name: "Карниз ЛДСП", unit: "м.п.", defaultPrice: 3500, category: "curtain" },
  { code: "curtain_aluminum", name: "Карниз алюминиевый", unit: "м.п.", defaultPrice: 5000, category: "curtain" },

  // Гардина встроенная (за м.п.)
  { code: "gardina_plastic", name: "Гардина встроенная пластиковая", unit: "м.п.", defaultPrice: 3000, category: "gardina" },
  { code: "gardina_aluminum", name: "Гардина встроенная алюминиевая", unit: "м.п.", defaultPrice: 5000, category: "gardina" },

  // Подшторник (за м.п.)
  { code: "podshtornik_plastic", name: "Подшторник пластиковый (брус)", unit: "м.п.", defaultPrice: 2500, category: "podshtornik" },
  { code: "podshtornik_ldsp", name: "Подшторник ЛДСП", unit: "м.п.", defaultPrice: 3500, category: "podshtornik" },
  { code: "podshtornik_aluminum", name: "Подшторник алюминиевый", unit: "м.п.", defaultPrice: 5000, category: "podshtornik" },

  // Углы
  { code: "corner_plastic", name: "Угол пластик", unit: "шт.", defaultPrice: 1000, category: "corner", description: "Для галтели / вставки" },
  { code: "corner_aluminum", name: "Угол алюминий", unit: "шт.", defaultPrice: 5000, category: "corner", description: "Для теневого / парящего" },

  // Прочее
  { code: "pipe_bypass", name: "Обход трубы", unit: "шт.", defaultPrice: 800, category: "other" },
  { code: "eurobrus", name: "Евробрус", unit: "шт.", defaultPrice: 3500, category: "other" },

  // Спецпараметры
  { code: "min_order", name: "Минимальный заказ", unit: "₸", defaultPrice: 90000, category: "special" },
  { code: "height_coefficient", name: "Коэффициент высоты (>3м)", unit: "×", defaultPrice: 1.3, category: "special" },
];

export const DEFAULT_PRICES: Record<string, number> = Object.fromEntries(
  PRODUCT_ITEMS.map((item) => [item.code, item.defaultPrice])
);

export const PRODUCT_BY_CODE: Record<string, ProductItem> = Object.fromEntries(
  PRODUCT_ITEMS.map((item) => [item.code, item])
);

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  canvas: "Полотно",
  profile: "Профили",
  spot: "Светильники",
  chandelier: "Люстры и свет",
  curtain: "Карнизы",
  gardina: "Гардина встроенная",
  podshtornik: "Подшторник",
  corner: "Углы",
  other: "Прочее",
  special: "Спецпараметры",
};

export const CANVAS_TYPES = [
  { value: "mat", label: "Матовый", code: "canvas_320" },
  { value: "satin", label: "Сатиновый", code: "canvas_550" },
  { value: "glyanets", label: "Глянцевый", code: "canvas_over" },
  { value: "color", label: "Цветной", code: "canvas_over" },
] as const;

export type CanvasType = (typeof CANVAS_TYPES)[number]["value"];

export const PROFILE_TYPES = [
  { code: "profile_galtel", label: "Под галтель", description: "Только профиль" },
  { code: "profile_insert", label: "Со вставкой", description: "Профиль + вставка" },
  { code: "profile_shadow", label: "Теневой", description: "Алюминиевый" },
  { code: "profile_floating", label: "Парящий", description: "Алюминиевый" },
] as const;

export const SPOT_TYPES = [
  { code: "spot_client", label: "Клиентские" },
  { code: "spot_ours", label: "GX53 (наши)" },
  { code: "spot_double", label: "Двойные LED" },
] as const;

export const CORNER_TYPES = [
  { code: "corner_plastic", label: "Пластик" },
  { code: "corner_aluminum", label: "Алюминий" },
] as const;

/** Map profile type → corner code (auto-selection) */
export const PROFILE_CORNER_MAP: Record<string, string> = {
  profile_galtel: "corner_plastic",
  profile_insert: "corner_plastic",
  profile_shadow: "corner_aluminum",
  profile_floating: "corner_aluminum",
};

export const CURTAIN_TYPES = [
  { code: "curtain_ldsp", label: "ЛДСП" },
  { code: "curtain_aluminum", label: "Алюминиевый" },
] as const;

export const GARDINA_TYPES = [
  { code: "gardina_plastic", label: "Пластиковая" },
  { code: "gardina_aluminum", label: "Алюминиевая" },
] as const;

export const PODSHTORNIK_TYPES = [
  { code: "podshtornik_plastic", label: "Пластиковый" },
  { code: "podshtornik_ldsp", label: "ЛДСП" },
  { code: "podshtornik_aluminum", label: "Алюминиевый" },
] as const;

export const ROOM_PRESETS = [
  "Зал",
  "Спальня",
  "Кухня",
  "Коридор",
  "Детская",
  "Ванная",
  "Санузел",
  "Гостиная",
  "Кабинет",
  "Прихожая",
] as const;

export const KP_LIMITS = {
  FREE: 5,
  PRO: Infinity,
} as const;
