import QRCode from "qrcode";
import { themeFor } from "./themes";
import { DEFAULT_KP_CONFIG, getDefaultConfigForTemplate } from "./templates";
import type { PdfData } from "./pdf-data";
import type { KpConfig, KpTemplateId } from "./types";

// Моковые данные для превью КП без реального Estimate.
// Используется в конструкторе /dashboard/branding и в /api/master/me/sample-pdf.

type MockOverrides = {
  brandColor?: string;
  config?: KpConfig;
  template?: KpTemplateId;
  master?: Partial<PdfData["master"]>;
};

const MOCK_PUBLIC_URL = "https://potolok.ai/kp/sample-preview";

export async function buildMockPdfData(overrides: MockOverrides = {}): Promise<PdfData> {
  const config =
    overrides.config ??
    (overrides.template
      ? getDefaultConfigForTemplate(overrides.template)
      : JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG)));

  // По умолчанию в моках берём заметный цвет — чтобы при выборе темы
  // сразу было видно, как живёт акцент. Реальный мастер задаёт свой.
  const brandColor = overrides.brandColor || "#E85D04";

  const { theme, fonts } = themeFor({ brandColor, kpConfig: config });

  const qrDataUrl = await QRCode.toDataURL(MOCK_PUBLIC_URL, {
    margin: 1,
    width: 360,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });

  const master: PdfData["master"] = {
    companyName: overrides.master?.companyName ?? "Студия Уют",
    ownerName: overrides.master?.ownerName ?? "Аслан Серикович",
    phone: overrides.master?.phone ?? "+7 700 123 45 67",
    whatsappPhone: overrides.master?.whatsappPhone ?? "+77001234567",
    instagramUrl: overrides.master?.instagramUrl ?? "https://instagram.com/uyut.ceiling",
    logoUrl: overrides.master?.logoUrl ?? null,
    tagline: overrides.master?.tagline ?? "Натяжные потолки в Астане с 2018",
    coverPhotoUrl:
      overrides.master?.coverPhotoUrl ??
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&q=80",
    brandColor,
    legalName: overrides.master?.legalName ?? "ИП Серикович А.",
    bin: overrides.master?.bin ?? "850101300123",
    iban: overrides.master?.iban ?? "KZ86601A801234567891",
    prepaymentPercent: overrides.master?.prepaymentPercent ?? 50,
    warrantyMaterials: overrides.master?.warrantyMaterials ?? 10,
    warrantyInstall: overrides.master?.warrantyInstall ?? 2,
  };

  // Тестовая 3-комнатная квартира. designerData — реальная геометрия как
  // её даёт Room Designer (web/mobile): walls — длины стен в обходе,
  // angles — углы между ними, elements — координаты софитов/люстр.
  const rooms = [
    {
      id: "r1",
      name: "Гостиная",
      area: 22.5,
      items: [
        { name: "Полотно MSD матовое белое", quantity: 22.5, unit: "м²", unitPrice: 3800, total: 85500 },
        { name: "Профиль теневой EuroKraab", quantity: 18.2, unit: "м.п.", unitPrice: 1400, total: 25480 },
        { name: "Софиты LED 7Вт", quantity: 8, unit: "шт", unitPrice: 3500, total: 28000 },
        { name: "Монтаж", quantity: 22.5, unit: "м²", unitPrice: 1200, total: 27000 },
      ],
      total: 165980,
      designerData: {
        walls: [5.0, 4.5, 5.0, 4.5],
        angles: [90, 90, 90, 90],
        elements: [
          { type: "chandelier", x: 250, y: 200 },
          { type: "spot", x: 100, y: 80 },
          { type: "spot", x: 400, y: 80 },
          { type: "spot", x: 100, y: 320 },
          { type: "spot", x: 400, y: 320 },
          { type: "spot", x: 100, y: 200 },
          { type: "spot", x: 400, y: 200 },
          { type: "spot", x: 250, y: 80 },
          { type: "spot", x: 250, y: 320 },
        ],
      },
    },
    {
      id: "r2",
      name: "Спальня",
      area: 15.0,
      items: [
        { name: "Полотно MSD сатин слоновая кость", quantity: 15.0, unit: "м²", unitPrice: 4100, total: 61500 },
        { name: "Профиль ПВХ + маскировочная лента", quantity: 16.0, unit: "м.п.", unitPrice: 950, total: 15200 },
        { name: "Софиты LED 5Вт", quantity: 4, unit: "шт", unitPrice: 3200, total: 12800 },
        { name: "Подсветка по периметру", quantity: 16, unit: "м.п.", unitPrice: 1800, total: 28800 },
        { name: "Монтаж", quantity: 15.0, unit: "м²", unitPrice: 1200, total: 18000 },
      ],
      total: 136300,
      designerData: {
        walls: [4.0, 3.75, 4.0, 3.75],
        angles: [90, 90, 90, 90],
        elements: [
          { type: "chandelier", x: 200, y: 188 },
          { type: "spot", x: 80, y: 80 },
          { type: "spot", x: 320, y: 80 },
          { type: "spot", x: 80, y: 296 },
          { type: "spot", x: 320, y: 296 },
        ],
      },
    },
    {
      id: "r3",
      name: "Детская",
      area: 12.0,
      items: [
        { name: "Полотно MSD глянцевое розовый перламутр", quantity: 12.0, unit: "м²", unitPrice: 4400, total: 52800 },
        { name: "Профиль ПВХ", quantity: 14.0, unit: "м.п.", unitPrice: 900, total: 12600 },
        { name: "Софиты LED 5Вт", quantity: 4, unit: "шт", unitPrice: 3200, total: 12800 },
        { name: "Звезды Swarovski 30 точек", quantity: 1, unit: "комплект", unitPrice: 18000, total: 18000 },
        { name: "Монтаж", quantity: 12.0, unit: "м²", unitPrice: 1200, total: 14400 },
      ],
      total: 110600,
      designerData: {
        walls: [3.5, 3.43, 3.5, 3.43],
        angles: [90, 90, 90, 90],
        elements: [
          { type: "chandelier", x: 175, y: 172 },
          { type: "spot", x: 60, y: 60 },
          { type: "spot", x: 290, y: 60 },
          { type: "spot", x: 60, y: 284 },
          { type: "spot", x: 290, y: 284 },
        ],
      },
    },
  ];

  const subtotal = rooms.reduce((s, r) => s + r.total, 0);
  const extraItems = [
    { name: "Демонтаж старого потолка (3 комнаты)", quantity: 1, unit: "услуга", unitPrice: 12000, total: 12000 },
    { name: "Вынос мусора", quantity: 1, unit: "услуга", unitPrice: 5000, total: 5000 },
  ];
  const extraTotal = extraItems.reduce((s, x) => s + x.total, 0);
  const total = subtotal + extraTotal;

  // Реальные фото потолков/интерьеров из Unsplash для демо.
  // В продакшене мастер грузит свои в PortfolioWork.
  const portfolio: PdfData["portfolio"] = [
    { id: "p1", title: "Двухуровневый потолок с подсветкой", ceilingType: "Парящий", photoUrl: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800" },
    { id: "p2", title: "Глянцевый потолок в гостиной", ceilingType: "Глянцевый", photoUrl: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800" },
    { id: "p3", title: "Световая линия в коридоре", ceilingType: "Световая линия", photoUrl: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800" },
    { id: "p4", title: "Сатиновый потолок в спальне", ceilingType: "Сатин", photoUrl: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800" },
    { id: "p5", title: "Парящий потолок в кухне-гостиной", ceilingType: "Парящий", photoUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800" },
    { id: "p6", title: "Матовый потолок в офисе", ceilingType: "Матовый", photoUrl: "https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=800" },
  ];

  const reviews: PdfData["reviews"] = [
    {
      id: "rev1",
      clientName: "Айгуль К.",
      rating: 5,
      text: "Всё чётко: приехали вовремя, работали аккуратно, оставили чисто. Потолок выглядит отлично уже год — никаких нареканий. Рекомендую!",
      location: "Астана, Есиль",
    },
    {
      id: "rev2",
      clientName: "Серикбай М.",
      rating: 5,
      text: "Сделали трёшку за один день. Цена в договоре не поменялась. Гарантию выдали, чек тоже. Профессионально.",
      location: "Астана, Алматинский",
    },
  ];

  return {
    master,
    estimate: {
      id: "sample-preview",
      publicId: "sample-preview",
      clientName: "Айгуль Серикова",
      clientAddress: "Астана, ул. Кабанбай батыра 49, кв. 87",
      total,
      discountPercent: 0,
      totalArea: 49.5,
      validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdAt: new Date(),
      room3dPreviewUrl: null,
      rooms,
      extraItems,
      subtotal,
      isQuick: false,
    },
    portfolio,
    reviews,
    qrDataUrl,
    publicUrl: MOCK_PUBLIC_URL,
    config,
    theme,
    fonts,
  };
}
