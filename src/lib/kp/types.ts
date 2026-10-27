// Конфигурация конструктора КП. Сохраняется в Master.kpConfig (Json).
// Источник истины по структуре и поведению визуального редактора КП.

export type KpTemplateId =
  | "minimal"
  | "premium-dark"
  | "warm-handmade"
  | "classic-architectural"
  | "bold-color";

export type KpFontPairId =
  | "inter"
  | "serif-modern"
  | "warm"
  | "classic";

export type WarrantyItem = { title: string; value: string };
export type FaqItem = { q: string; a: string };

export type KpSection =
  | { type: "cover" }
  | { type: "breakdown" }
  /** «Как это будет выглядеть» — фото по типам элементов из КП (26.10.2026) */
  | { type: "gallery"; enabled: boolean }
  | { type: "portfolio"; enabled: boolean }
  | { type: "warranties"; enabled: boolean; items: WarrantyItem[] }
  | { type: "reviews"; enabled: boolean }
  | { type: "faq"; enabled: boolean; items: FaqItem[] }
  | { type: "about"; enabled: boolean; title: string; body: string }
  | { type: "contacts" };

// Формат КП:
//   "full"  — полноценное предложение (5+ страниц с темой)
//   "quick" — одностраничное «примерное» предложение, когда замера ещё не было
//             (клиент в WhatsApp спрашивает «а сколько примерно?»)
export type KpFormat = "full" | "quick";

// Пункт в блоке «Что вы получаете» на Quick КП.
// Мастер может переписать заголовок и описание — чтобы у всех мастеров
// не было одинаковых текстов. AI-ассистент подсказывает варианты.
export type QuickIncludedItem = { title: string; body: string };

// Кастомизация текстов Quick КП. Любое из полей может быть null —
// тогда используется дефолт темы (см. src/lib/kp/templates.ts).
export type QuickContentOverrides = {
  heroTitle?: string | null;       // главное обращение к клиенту
  pricePreLabel?: string | null;   // лейбл над ценой
  priceDisclaimer?: string | null; // объяснение под ценой
  itemsTitle?: string | null;      // «Что вы получаете»
  items?: QuickIncludedItem[] | null; // 3 квадрата
  ctaLabel?: string | null;        // подпись над номером WhatsApp
};

/**
 * Как клиент видит цены в КП (16.10.2026):
 * - detailed — количество × цена по каждой позиции (как было всегда);
 * - summary  — только названия позиций и итог по комнате, без количества и
 *   цен за единицу: клиент не пересылает смету конкурентам «для кастинга».
 * Хранится у каждого КП (Estimate.priceView); в kpConfig — дефолт мастера для новых.
 */
export type KpPriceView = "detailed" | "summary";
export const KP_PRICE_VIEWS: KpPriceView[] = ["detailed", "summary"];
export function asPriceView(v: unknown): KpPriceView {
  return v === "summary" ? "summary" : "detailed";
}

/**
 * Стиль плана комнат по замеру в КП (26.10.2026):
 * - notebook  — «лист из тетради»: карандаш на бумаге в клетку, подписи от руки;
 * - drawing   — ровные тонкие линии в фирменном цвете мастера на чистом фоне;
 * - blueprint — белые линии на синем чертёжном листе, как у архитектора.
 * null/нет поля — дефолт темы (KpTheme.defaultPlanStyle).
 */
export type KpPlanStyle = "notebook" | "drawing" | "blueprint";
export const KP_PLAN_STYLES: KpPlanStyle[] = ["notebook", "drawing", "blueprint"];
export const KP_PLAN_STYLE_LABELS: Record<KpPlanStyle, { label: string; hint: string }> = {
  notebook: { label: "Тетрадь", hint: "Карандашом на бумаге в клетку, подписи от руки" },
  drawing: { label: "Чертёж", hint: "Ровные линии в фирменном цвете на чистом фоне" },
  blueprint: { label: "Blueprint", hint: "Белые линии на синем листе, как у архитектора" },
};
export function asPlanStyle(v: unknown): KpPlanStyle | null {
  return v === "notebook" || v === "drawing" || v === "blueprint" ? v : null;
}

export type KpConfig = {
  template: KpTemplateId;
  fontPair: KpFontPairId | null; // null = дефолт темы
  sections: KpSection[];
  format?: KpFormat; // дефолт "full"
  quick?: QuickContentOverrides | null;
  /** Дефолтный вид цен для новых КП мастера; у самого КП своё поле. */
  priceView?: KpPriceView;
  /** Стиль плана комнат; null/нет — дефолт темы */
  planStyle?: KpPlanStyle | null;
};

// Шрифтовая пара (display + body), используется и в @react-pdf, и в HTML CSS
export type FontPair = {
  id: KpFontPairId;
  label: string;
  display: { family: string; weight: number };
  body: { family: string; weight: number };
};

// Палитра темы. Цвет `accent` всегда переопределяется master.brandColor —
// здесь хранится фолбэк на случай если brandColor совсем не подходит к теме.
export type ThemePalette = {
  // Обложка (страница 1) — может быть тёмной/цветной у некоторых тем
  coverBg: string;
  coverText: string;
  coverMuted: string;
  // Внутренние страницы — всегда светлые
  pageBg: string;
  pageText: string;
  pageMuted: string;
  // Линии, фоны карточек
  hairline: string;
  surface: string;
  // Аксент-цвет — заголовки, цены, кнопки (заменяется master.brandColor)
  accent: string;
  accentSoft: string;
  accentText: string; // контрастный к accent (для текста на цветном фоне)
};

export type CoverLayout =
  | "photo-top" // 3D-превью или coverPhoto в верхней половине
  | "photo-full" // фон на всю страницу
  | "typographic" // только текст, 3D-превью внутри (стр.2)
  | "color-block"; // фон в цвет accent целиком

export type KpTheme = {
  id: KpTemplateId;
  label: string;
  segment: string;
  defaultFontPair: KpFontPairId;
  /** Стиль плана по замеру, если мастер не выбрал свой */
  defaultPlanStyle: KpPlanStyle;
  palette: ThemePalette;
  coverLayout: CoverLayout;
  // Декоративные нюансы — толщина линий, стиль разделителей
  decor: {
    hairlineWidth: number; // в pt
    sectionDividerStyle: "thin" | "thick-top-bottom" | "dotted" | "double";
  };
};
