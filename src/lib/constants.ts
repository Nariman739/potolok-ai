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
  | "special"
  | "install";

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
  { code: "canvas_320", name: "Полотно матовое 320см", unit: "м²", defaultPrice: 2000, category: "canvas", description: "Ширина до 3.2м" },
  { code: "canvas_550", name: "Полотно сатиновое 550см", unit: "м²", defaultPrice: 2700, category: "canvas", description: "Ширина до 5.5м" },
  { code: "canvas_over", name: "Полотно глянцевое/цветное", unit: "м²", defaultPrice: 3700, category: "canvas", description: "Любая ширина" },

  // Профили (за м.п.)
  { code: "profile_plastic", name: "Пластиковый профиль", unit: "м.п.", defaultPrice: 500, category: "profile", description: "Багет (под галтель или вставку)" },
  { code: "insert", name: "Вставка", unit: "м.п.", defaultPrice: 1000, category: "profile", description: "Маскировочная лента" },
  { code: "profile_shadow", name: "Теневой профиль", unit: "м.п.", defaultPrice: 7000, category: "profile", description: "Алюминиевый теневой зазор" },
  { code: "profile_floating", name: "Парящий профиль", unit: "м.п.", defaultPrice: 14000, category: "profile", description: "Алюминиевый с подсветкой" },

  // Светильники (за шт.)
  { code: "spot_client", name: "Споты (клиентские)", unit: "шт.", defaultPrice: 2500, category: "spot", description: "Установка клиентских" },
  { code: "spot_ours", name: "Споты GX53 (наши)", unit: "шт.", defaultPrice: 5000, category: "spot", description: "GX53 в комплекте" },
  { code: "spot_gu10", name: "Споты GU10", unit: "шт.", defaultPrice: 4500, category: "spot", description: "Цоколь GU10" },
  { code: "spot_mr16", name: "Споты MR16", unit: "шт.", defaultPrice: 4000, category: "spot", description: "Цоколь GU5.3 / MR16" },
  { code: "spot_swivel", name: "Споты поворотные", unit: "шт.", defaultPrice: 7000, category: "spot", description: "С регулировкой угла" },
  { code: "spot_overhead", name: "Споты накладные", unit: "шт.", defaultPrice: 5500, category: "spot", description: "Накладные на потолок" },
  { code: "spot_double", name: "Споты двойные LED", unit: "шт.", defaultPrice: 6000, category: "spot", description: "Двойные LED-споты" },
  { code: "spot_pair", name: "Софиты двойные (пара)", unit: "пара", defaultPrice: 9000, category: "spot", description: "2 софита рядом — отдельная цена за пару" },
  { code: "spot_triple", name: "Софиты тройные", unit: "шт.", defaultPrice: 13000, category: "spot", description: "3 софита рядом — отдельная цена за тройку" },
  // Подвесной светильник / бра — отдельная категория (меньше люстры)
  { code: "pendant", name: "Подвесной светильник", unit: "шт.", defaultPrice: 1500, category: "spot", description: "Закладная под подвесной светильник" },
  { code: "pendant_install", name: "Установка подвесного светильника", unit: "шт.", defaultPrice: 3000, category: "spot", description: "Монтаж подвесного светильника / бра" },

  // Люстры
  { code: "chandelier", name: "Закладная под люстру", unit: "шт.", defaultPrice: 2000, category: "chandelier" },
  { code: "chandelier_install", name: "Установка люстры", unit: "шт.", defaultPrice: 5000, category: "chandelier" },
  { code: "transformer", name: "Трансформатор", unit: "шт.", defaultPrice: 10000, category: "chandelier" },
  { code: "track_magnetic", name: "Трек магнитный", unit: "м.п.", defaultPrice: 27000, category: "chandelier" },
  { code: "light_line", name: "Световая линия", unit: "м.п.", defaultPrice: 15000, category: "chandelier" },

  // Карнизы (за м.п.)
  { code: "curtain_ldsp", name: "Карниз ЛДСП", unit: "м.п.", defaultPrice: 3500, category: "curtain" },
  { code: "curtain_aluminum", name: "Карниз алюминиевый", unit: "м.п.", defaultPrice: 5000, category: "curtain" },

  // Гардины (за м.п.)
  { code: "gardina_plastic", name: "Пластиковая гардина на потолок", unit: "м.п.", defaultPrice: 5000, category: "gardina" },
  { code: "gardina_aluminum", name: "Встроенная гардина в потолок", unit: "м.п.", defaultPrice: 17000, category: "gardina" },

  // Подшторник (за м.п.)
  { code: "podshtornik_plastic", name: "Подшторник пластиковый (брус)", unit: "м.п.", defaultPrice: 2500, category: "podshtornik" },
  { code: "podshtornik_ldsp", name: "Подшторник ЛДСП (под галтели)", unit: "м.п.", defaultPrice: 5500, category: "podshtornik" },
  { code: "podshtornik_aluminum", name: "Подшторник алюминиевый", unit: "м.п.", defaultPrice: 8000, category: "podshtornik" },

  // Углы
  { code: "corner_plastic", name: "Угол пластик", unit: "шт.", defaultPrice: 1000, category: "corner", description: "Для галтели / вставки" },
  { code: "corner_aluminum", name: "Угол алюминий", unit: "шт.", defaultPrice: 5000, category: "corner", description: "Для теневого / парящего" },
  { code: "corner_rounded", name: "Скруглённый угол", unit: "шт.", defaultPrice: 5000, category: "corner", description: "Дуга вместо обычного угла — сложнее в монтаже" },
  { code: "corner_furniture_bypass", name: "Обвод мебели до потолка", unit: "м.п.", defaultPrice: 2000, category: "corner", description: "Профиль обходит мебель по контуру — доп. работа" },
  { code: "corner_furniture_planned", name: "Уголок под будущую мебель", unit: "шт.", defaultPrice: 1500, category: "corner", description: "Подготовка под установку мебели мебельщиком после нас" },

  // Прочее
  { code: "pipe_bypass", name: "Обход трубы", unit: "шт.", defaultPrice: 2000, category: "other" },
  { code: "eurobrus", name: "Евробрус", unit: "м.п.", defaultPrice: 5500, category: "other" },

  // Спецпараметры
  { code: "min_order", name: "Минимальный заказ", unit: "₸", defaultPrice: 90000, category: "special" },
  { code: "height_coefficient", name: "Коэффициент высоты (>3м)", unit: "×", defaultPrice: 1.3, category: "special" },

  // Монтажные цены (для КП монтажникам)
  { code: "install_canvas", name: "Монтаж полотна", unit: "м²", defaultPrice: 800, category: "install", description: "Натяжка полотна" },
  { code: "install_profile", name: "Монтаж профиля", unit: "м.п.", defaultPrice: 300, category: "install", description: "Установка багета" },
  { code: "install_spot", name: "Монтаж софита", unit: "шт.", defaultPrice: 1000, category: "install", description: "Установка светильника" },
  { code: "install_chandelier", name: "Монтаж люстры", unit: "шт.", defaultPrice: 3000, category: "install", description: "Установка люстры" },
  { code: "install_track", name: "Монтаж трека", unit: "м.п.", defaultPrice: 5000, category: "install", description: "Монтаж магнитного трека" },
  { code: "install_lightline", name: "Монтаж световой линии", unit: "м.п.", defaultPrice: 4000, category: "install", description: "Монтаж световой линии" },
  { code: "install_curtain", name: "Монтаж карниза", unit: "м.п.", defaultPrice: 1500, category: "install", description: "Установка карниза" },
  { code: "install_gardina", name: "Монтаж гардины", unit: "м.п.", defaultPrice: 2000, category: "install", description: "Установка гардины (пластиковой или встроенной)" },
  { code: "install_corner", name: "Обработка угла", unit: "шт.", defaultPrice: 500, category: "install", description: "Доп. обработка угла" },
  { code: "install_pipe", name: "Обход трубы (работа)", unit: "шт.", defaultPrice: 1000, category: "install", description: "Обход трубы" },
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
  gardina: "Гардины",
  podshtornik: "Подшторник",
  corner: "Углы",
  other: "Прочее",
  special: "Спецпараметры",
  install: "Монтаж (для монтажников)",
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
  { code: "spot_gu10", label: "GU10" },
  { code: "spot_mr16", label: "MR16" },
  { code: "spot_swivel", label: "Поворотные" },
  { code: "spot_overhead", label: "Накладные" },
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
  { code: "gardina_plastic", label: "Пластиковая на потолок" },
  { code: "gardina_aluminum", label: "Встроенная в потолок" },
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
  // TEMP: лимит снят на период тестирования (вернуть 5 после оплаты тарифов).
  FREE: Infinity,
  PRO: Infinity,
  PROPLUS: Infinity,
} as const;

export const SMM_LIMITS = {
  FREE: 3,    // Тестовый период — 3 поста бесплатно
  PRO: 10,
  PROPLUS: 15,
} as const;

export const LOGO_LIMITS = {
  FREE: 3,
  PRO: Infinity,
  PROPLUS: Infinity,
} as const;
