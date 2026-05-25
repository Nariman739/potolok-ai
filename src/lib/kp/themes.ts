import type {
  FontPair,
  KpConfig,
  KpFontPairId,
  KpTemplateId,
  KpTheme,
} from "./types";

// ============================================
// ШРИФТЫ
// ============================================
// Семейства лежат в @fontsource/* пакетах, на стороне @react-pdf шрифты
// регистрируются один раз в src/lib/kp/pdf/fonts.ts через Font.register().
// В HTML-превью те же шрифты подключаются через <link> на CDN @fontsource.

export const FONT_PAIRS: Record<KpFontPairId, FontPair> = {
  inter: {
    id: "inter",
    label: "Современный (Inter)",
    display: { family: "Inter", weight: 800 },
    body: { family: "Inter", weight: 400 },
  },
  "serif-modern": {
    id: "serif-modern",
    label: "Премиум (Playfair + Inter)",
    display: { family: "Playfair Display", weight: 700 },
    body: { family: "Inter", weight: 400 },
  },
  warm: {
    id: "warm",
    label: "Тёплый (Lora + Manrope)",
    display: { family: "Lora", weight: 700 },
    body: { family: "Manrope", weight: 400 },
  },
  classic: {
    id: "classic",
    label: "Классика (Cormorant + Inter)",
    display: { family: "Cormorant Garamond", weight: 700 },
    body: { family: "Inter", weight: 400 },
  },
};

// ============================================
// ТЕМЫ
// ============================================

const BASE_THEMES: Record<KpTemplateId, KpTheme> = {
  minimal: {
    id: "minimal",
    label: "Минимализм",
    segment: "Универсальный нейтральный стиль",
    defaultFontPair: "inter",
    palette: {
      coverBg: "#FFFFFF",
      coverText: "#0F172A",
      coverMuted: "#64748B",
      pageBg: "#FFFFFF",
      pageText: "#1F2933",
      pageMuted: "#64748B",
      hairline: "#E2E8F0",
      surface: "#F8FAFC",
      accent: "#1E3A5F",
      accentSoft: "#1E3A5F14",
      accentText: "#FFFFFF",
    },
    coverLayout: "photo-top",
    decor: { hairlineWidth: 0.5, sectionDividerStyle: "thin" },
  },
  "premium-dark": {
    id: "premium-dark",
    label: "Премиум Dark",
    segment: "Премиум-сегмент, элитная недвижимость",
    defaultFontPair: "serif-modern",
    palette: {
      coverBg: "#0F172A",
      coverText: "#F8FAFC",
      coverMuted: "#94A3B8",
      pageBg: "#FFFFFF",
      pageText: "#0F172A",
      pageMuted: "#475569",
      hairline: "#CBD5E1",
      surface: "#F1F5F9",
      accent: "#D4AF37",
      accentSoft: "#D4AF3722",
      accentText: "#0F172A",
    },
    coverLayout: "photo-top",
    decor: { hairlineWidth: 0.5, sectionDividerStyle: "double" },
  },
  "warm-handmade": {
    id: "warm-handmade",
    label: "Тёплый Hand-made",
    segment: "Семейные квартиры, уютная атмосфера",
    defaultFontPair: "warm",
    palette: {
      coverBg: "#FFF8F0",
      coverText: "#3D2E22",
      coverMuted: "#8B6F4E",
      pageBg: "#FFF8F0",
      pageText: "#3D2E22",
      pageMuted: "#8B6F4E",
      hairline: "#E8D5BD",
      surface: "#FFEEDB",
      accent: "#C8553D",
      accentSoft: "#C8553D1A",
      accentText: "#FFFFFF",
    },
    coverLayout: "typographic",
    decor: { hairlineWidth: 0.8, sectionDividerStyle: "dotted" },
  },
  "classic-architectural": {
    id: "classic-architectural",
    label: "Архитектурная классика",
    segment: "Дизайнерские квартиры и коттеджи",
    defaultFontPair: "classic",
    palette: {
      coverBg: "#FFFFFF",
      coverText: "#000000",
      coverMuted: "#525252",
      pageBg: "#FFFFFF",
      pageText: "#000000",
      pageMuted: "#525252",
      hairline: "#000000",
      surface: "#F5F5F5",
      accent: "#6B2737",
      accentSoft: "#6B273714",
      accentText: "#FFFFFF",
    },
    coverLayout: "typographic",
    decor: { hairlineWidth: 2, sectionDividerStyle: "thick-top-bottom" },
  },
  "bold-color": {
    id: "bold-color",
    label: "Bold Color",
    segment: "Молодой смелый бренд",
    defaultFontPair: "inter",
    palette: {
      coverBg: "#1E3A5F", // переопределяется master.brandColor
      coverText: "#FFFFFF",
      coverMuted: "#FFFFFFB3",
      pageBg: "#FFFFFF",
      pageText: "#1F2933",
      pageMuted: "#64748B",
      hairline: "#E2E8F0",
      surface: "#F8FAFC",
      accent: "#1E3A5F",
      accentSoft: "#1E3A5F14",
      accentText: "#FFFFFF",
    },
    coverLayout: "color-block",
    decor: { hairlineWidth: 0.5, sectionDividerStyle: "thin" },
  },
};

// ============================================
// ФАБРИКА ТЕМЫ
// ============================================

type MasterThemeInputs = {
  brandColor?: string | null;
  kpConfig?: Partial<KpConfig> | null;
};

// Темы, где аксент-цвет — часть характера и НЕ должен перебиваться brandColor:
// premium-dark (золото), warm-handmade (терракот), classic-architectural (бордо).
// В minimal, bold-color аксент = brandColor мастера всегда.
const THEMES_WITH_FIXED_ACCENT: KpTemplateId[] = [
  "premium-dark",
  "warm-handmade",
  "classic-architectural",
];

export function themeFor(master: MasterThemeInputs): {
  theme: KpTheme;
  fonts: FontPair;
  templateId: KpTemplateId;
  fontPairId: KpFontPairId;
} {
  const templateId: KpTemplateId =
    (master.kpConfig?.template as KpTemplateId) ?? "minimal";
  const base = BASE_THEMES[templateId] ?? BASE_THEMES.minimal;
  const fontPairId: KpFontPairId =
    (master.kpConfig?.fontPair as KpFontPairId) ?? base.defaultFontPair;
  const fonts = FONT_PAIRS[fontPairId] ?? FONT_PAIRS.inter;

  // Если тема имеет «фирменный» цвет — оставляем его (золото/терракот/бордо),
  // brandColor мастера используется только во вторичных элементах (badges).
  // Иначе — accent = brandColor мастера.
  const accent = THEMES_WITH_FIXED_ACCENT.includes(templateId)
    ? base.palette.accent
    : (master.brandColor || base.palette.accent);

  const accentSoft = accent + "1F"; // ~12% alpha — чуть сильнее, чтобы блоки читались
  const accentText = isLight(accent) ? "#0F172A" : "#FFFFFF";

  // Для bold-color обложка целиком окрашивается в accent
  const coverBg =
    base.coverLayout === "color-block" ? accent : base.palette.coverBg;
  const coverText =
    base.coverLayout === "color-block"
      ? isLight(accent)
        ? "#0F172A"
        : "#FFFFFF"
      : base.palette.coverText;
  const coverMuted =
    base.coverLayout === "color-block"
      ? isLight(accent)
        ? "#0F172AB3"
        : "#FFFFFFB3"
      : base.palette.coverMuted;

  return {
    theme: {
      ...base,
      palette: {
        ...base.palette,
        accent,
        accentSoft,
        accentText,
        coverBg,
        coverText,
        coverMuted,
      },
    },
    fonts,
    templateId,
    fontPairId,
  };
}

export function getThemeById(id: KpTemplateId): KpTheme {
  return BASE_THEMES[id] ?? BASE_THEMES.minimal;
}

export const ALL_TEMPLATES: KpTemplateId[] = [
  "minimal",
  "premium-dark",
  "warm-handmade",
  "classic-architectural",
  "bold-color",
];

// Простая эвристика «светлый цвет?» по luminance
function isLight(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65;
}
