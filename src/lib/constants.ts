export type ProductCategory =
  | "canvas"
  | "profile"
  | "spot"
  | "chandelier"
  | "curtain"
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
  { code: "profile_galtel", name: "Профиль галтель", unit: "м.п.", defaultPrice: 600, category: "profile", description: "Плинтус/галтель" },
  { code: "profile_insert", name: "Профиль со вставкой", unit: "м.п.", defaultPrice: 800, category: "profile", description: "Стандартная вставка" },
  { code: "profile_shadow", name: "Теневой профиль", unit: "м.п.", defaultPrice: 1400, category: "profile", description: "Теневой зазор" },
  { code: "profile_floating", name: "Парящий профиль", unit: "м.п.", defaultPrice: 1600, category: "profile", description: "Парящий с подсветкой" },

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
  { code: "curtain_recessed", name: "Карниз встроенный", unit: "м.п.", defaultPrice: 7000, category: "curtain" },

  // Углы
  { code: "corner_standard", name: "Угол стандарт", unit: "шт.", defaultPrice: 500, category: "corner" },
  { code: "corner_premium", name: "Угол премиум", unit: "шт.", defaultPrice: 1000, category: "corner" },

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
