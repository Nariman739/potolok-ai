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

export type KpConfig = {
  template: KpTemplateId;
  fontPair: KpFontPairId | null; // null = дефолт темы
  sections: KpSection[];
  format?: KpFormat; // дефолт "full"
  quick?: QuickContentOverrides | null;
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
  palette: ThemePalette;
  coverLayout: CoverLayout;
  // Декоративные нюансы — толщина линий, стиль разделителей
  decor: {
    hairlineWidth: number; // в pt
    sectionDividerStyle: "thin" | "thick-top-bottom" | "dotted" | "double";
  };
};
