import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { asCurrency, type CurrencyCode } from "@/lib/currency";
import type { CalculationResult, LineItem, RoomResult } from "@/lib/types";
import { themeFor } from "./themes";
import type { PlanRoom } from "@/lib/work-order-plan";
import { kindFromItemName, kindsFromRoom, mergeKinds, type KpKind } from "./kinds";
import { pickGalleryPhotos, type GalleryPhoto } from "./library";
import { inlinePdfImages } from "./pdf-images";
import { DEFAULT_KP_CONFIG } from "./templates";
import { asPriceView, asPlanStyle, type KpConfig, type KpTheme, type FontPair, type KpSection, type KpPriceView } from "./types";

// ============================================
// Структура данных, которую читают и PDF-рендерер, и HTML-превью
// ============================================

// Геометрия комнаты из замера — используется для рендера 2D-плана в PDF.
// Стены/углы заполняются Room Designer-ом (web/mobile), элементы — это
// расставленные мастером софиты, люстры, гардины, подшторники.
export type RoomDesignerElement = {
  type: string; // "spot" | "chandelier" | "gardina" | "subcurtain" | "furniture" | ...
  x?: number;
  y?: number;
  // Доп.поля для не-точечных элементов (мы их пока не рендерим в схеме)
  [k: string]: unknown;
};
export type RoomDesignerData = {
  walls: number[];
  angles: number[];
  normalCorners?: boolean[];
  area?: number;
  perimeter?: number;
  elements?: RoomDesignerElement[];
  arcBulges?: number[];
} | null;

export type PdfRoom = {
  id: string;
  name: string;
  area: number;
  items: PdfLineItem[];
  total: number;
  designerData: RoomDesignerData;
  /**
   * Комната из замера (Estimate.roomsData: стены, углы, дуги, софиты, люстры,
   * гардины, треки — в сантиметрах). Из неё рисуется план для клиента на
   * обложке и в составе работ (26.10.2026). null — замера с геометрией нет.
   */
  plan: PlanRoom | null;
};

export type PdfLineItem = {
  /** код позиции из снапшота; "min_order" — доплата до минимального заказа (без кол-ва) */
  itemCode?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  photoUrl?: string;
};

export type PdfPortfolioItem = {
  id: string;
  title: string | null;
  ceilingType: string | null;
  photoUrl: string | null;
};

export type PdfReview = {
  id: string;
  clientName: string;
  rating: number;
  text: string;
  location: string | null;
};

export type PdfMasterBranding = {
  companyName: string;
  ownerName: string;
  phone: string;
  whatsappPhone: string;
  instagramUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  coverPhotoUrl: string | null;
  brandColor: string;
  // Реквизиты для подвала контактной страницы
  legalName: string | null;
  bin: string | null;
  iban: string | null;
  prepaymentPercent: number;
  warrantyMaterials: number;
  warrantyInstall: number;
  /** Валюта цен (владельца компании): знак в КП — ₸ или ₽ (07.10.2026) */
  currency: CurrencyCode;
};

export type PdfEstimate = {
  id: string;
  publicId: string;
  clientName: string;
  /** Имя клиента как есть (null, если не указано) — для имени файла, без заглушки «Клиент» */
  clientNameRaw: string | null;
  /** Заголовок обложки: имя клиента, а без имени — «Ваш новый потолок», не слово «Клиент» */
  coverTitle: string;
  clientAddress: string;
  total: number;
  discountPercent: number;
  /** Скидка в ₸ — источник истины; discountPercent > 0 только если мастер вводил % */
  discountAmount: number;
  totalArea: number;
  validUntil: Date | null;
  createdAt: Date;
  room3dPreviewUrl: string | null;
  rooms: PdfRoom[];
  extraItems: PdfLineItem[];
  subtotal: number;
  isQuick: boolean; // true когда мастер пометил calc.quickEstimate (быстрый расчёт без замера)
  /** summary — без количества и цен за единицу, только названия и итоги (16.10.2026) */
  priceView: KpPriceView;
};

export type PdfData = {
  master: PdfMasterBranding;
  estimate: PdfEstimate;
  portfolio: PdfPortfolioItem[];
  reviews: PdfReview[];
  /** Фото по типам элементов этого КП для страницы «Как это будет выглядеть» (26.10.2026) */
  gallery: GalleryPhoto[];
  /** QR на онлайн-версию УБРАН из PDF (Нариман 14.09.2026: клиент получает
   *  PDF в WhatsApp, 3D-визуализации по ссылке нет). Поле оставлено пустым,
   *  чтобы обложки тем (guard `data.qrDataUrl &&`) его просто не рисовали. */
  qrDataUrl: string;
  publicUrl: string;
  config: KpConfig;
  theme: KpTheme;
  fonts: FontPair;
};

// ============================================
// Сборка данных по ID реального КП
// ============================================

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.VERCEL_URL ||
  "https://potolok.ai";

export async function buildPdfData(estimateId: string, masterId?: string | string[]): Promise<PdfData> {
  const estimate = await prisma.estimate.findFirst({
    where: masterId
      ? { id: estimateId, masterId: Array.isArray(masterId) ? { in: masterId } : masterId, deletedAt: null }
      : { id: estimateId, deletedAt: null },
    include: {
      master: {
        include: {
          portfolioWorks: {
            where: { isPublished: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            // берём с запасом: работы без фото (видео) в PDF не попадают
            take: 12,
          },
          reviews: {
            where: { isPublished: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            take: 2,
          },
        },
      },
    },
  });
  if (!estimate) throw new Error("Estimate not found");
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master);

  const config = normalizeConfig(estimate.master.kpConfig);
  const { theme, fonts } = themeFor({
    brandColor: estimate.master.brandColor,
    kpConfig: config,
  });

  const calc = (estimate.calculationData ?? {}) as unknown as CalculationResult & {
    quickEstimate?: boolean;
  };
  const rooms = mapRooms(calc, estimate.roomsData);
  const extraItems = (calc.extraItems ?? []).map(mapLineItem);
  const subtotal = calc.subtotal ?? estimate.total ?? 0;
  const isQuick = !!calc.quickEstimate;

  const publicUrl = `${normalizeUrl(BASE_URL)}/kp/${estimate.publicId}`;
  const qrDataUrl = "";

  const gallery = await buildGallery(estimate.id, estimate.roomsData, rooms, extraItems);

  // Фото мастера (портфолио, обложка, логотип) ужимаются до печатного размера —
  // иначе КП весит до 14 МБ (см. pdf-images.ts)
  return inlinePdfImages({
    master: mapBranding(estimate.master),
    estimate: {
      id: estimate.id,
      publicId: estimate.publicId,
      clientName: estimate.clientName ?? "Клиент",
      clientNameRaw: estimate.clientName?.trim() || null,
      coverTitle: estimate.clientName?.trim() || "Ваш новый потолок",
      clientAddress: estimate.clientAddress ?? "",
      total: estimate.total ?? 0,
      discountPercent: estimate.discountPercent ?? 0,
      discountAmount: estimate.discountAmount ?? 0,
      totalArea: estimate.totalArea ?? 0,
      validUntil: estimate.validUntil,
      createdAt: estimate.createdAt,
      room3dPreviewUrl: estimate.room3dPreviewUrl,
      rooms,
      extraItems,
      subtotal,
      isQuick,
      priceView: asPriceView(estimate.priceView),
    },
    portfolio: estimate.master.portfolioWorks.map(mapPortfolio).filter((p) => p.photoUrl).slice(0, 6),
    reviews: estimate.master.reviews.map(mapReview),
    gallery,
    qrDataUrl,
    publicUrl,
    config,
    theme,
    fonts,
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Типы элементов КП (замер + позиции) → фото. Своё фото мастера к позиции
 * (PriceVariant.photoUrl в строке) идёт первым, остальное — из библиотеки.
 */
export async function buildGallery(seed: string, roomsData: unknown, rooms: PdfRoom[], extraItems: PdfLineItem[]): Promise<GalleryPhoto[]> {
  const fromRooms: KpKind[] = [];
  if (Array.isArray(roomsData)) for (const r of roomsData) fromRooms.push(...kindsFromRoom(r));
  const fromItems: KpKind[] = [];
  const own: Partial<Record<KpKind, string>> = {};
  for (const it of [...rooms.flatMap((r) => r.items), ...extraItems]) {
    const k = kindFromItemName(it.name);
    if (!k) continue;
    fromItems.push(k);
    if (it.photoUrl && !own[k]) own[k] = it.photoUrl;
  }
  // «spot» из замера уточняется видом софита из прайса — своё фото тогда тоже к нему
  const kinds = mergeKinds(fromRooms, fromItems);
  try {
    return await pickGalleryPhotos(kinds, own, seed);
  } catch (e) {
    console.warn("[kp gallery] skipped:", e);
    return [];
  }
}

export function normalizeConfig(raw: unknown): KpConfig {
  if (!raw || typeof raw !== "object") return JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG));
  const obj = raw as Partial<KpConfig>;
  // Если нет sections — берём дефолт целиком (включая дефолтные FAQ/гарантии)
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG)),
      template: obj.template ?? DEFAULT_KP_CONFIG.template,
      fontPair: obj.fontPair ?? null,
      ...(obj.priceView ? { priceView: asPriceView(obj.priceView) } : {}),
      planStyle: asPlanStyle(obj.planStyle),
    };
  }
  // Старые конфиги без секции «Как это будет выглядеть» — включаем её после разбора
  let sections = obj.sections as KpSection[];
  if (!sections.some((x) => x.type === "gallery")) {
    const i = sections.findIndex((x) => x.type === "breakdown");
    sections = [...sections];
    sections.splice(i >= 0 ? i + 1 : 1, 0, { type: "gallery", enabled: true });
  }
  return {
    template: obj.template ?? DEFAULT_KP_CONFIG.template,
    fontPair: obj.fontPair ?? null,
    sections,
    // Дефолт вида цен мастера (16.10.2026); остальные поля kpConfig здесь
    // по-прежнему не прокидываются — format решает роут PDF.
    ...(obj.priceView ? { priceView: asPriceView(obj.priceView) } : {}),
    // Стиль плана по замеру (26.10.2026); null — дефолт темы
    planStyle: asPlanStyle(obj.planStyle),
  };
}

/** Комната замера с геометрией (стены ≥ 3) — иначе плана нет. */
export function planRoomOf(raw: unknown): PlanRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let walls = r.walls;
  // Старый веб-калькулятор пишет комнату как ширина × длина (в метрах) без стен —
  // рисуем прямоугольник, чтобы и у таких КП был план
  if (!Array.isArray(walls) && typeof r.width === "number" && typeof r.length === "number" && r.width > 0 && r.length > 0 && Number.isFinite(r.width) && Number.isFinite(r.length)) {
    const w = Math.round(r.width * 100), l = Math.round(r.length * 100);
    walls = [w, l, w, l];
  }
  if (!Array.isArray(walls) || walls.length < 3 || !walls.every((w) => typeof w === "number" && Number.isFinite(w) && w > 0)) return null;
  // Числовые массивы берём только целиком «здоровые»: один undefined в angles
  // давал NaN во всех вершинах и пустой план вместо старой иконки
  const nums = (v: unknown): number[] | null =>
    Array.isArray(v) && v.length === walls.length && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : null;
  const elements = Array.isArray(r.elements)
    ? r.elements.filter((e) => {
        if (!e || typeof e !== "object") return false;
        const o = e as { x?: unknown; y?: unknown; points?: unknown };
        if (o.x !== undefined && !Number.isFinite(o.x)) return false;
        if (o.y !== undefined && !Number.isFinite(o.y)) return false;
        if (o.points !== undefined && (!Array.isArray(o.points) || !o.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)))) return false;
        return true;
      })
    : [];
  return {
    walls: walls as number[],
    angles: nums(r.angles),
    normalCorners: Array.isArray(r.normalCorners) && r.normalCorners.length === walls.length ? (r.normalCorners as boolean[]) : null,
    bulges: nums(r.bulges),
    cornerRadii: nums(r.cornerRadii),
    elements,
    wallProfiles: r.wallProfiles,
  };
}

function mapRooms(calc: CalculationResult, roomsData: unknown): PdfRoom[] {
  const results = calc.roomResults ?? [];
  const inputs = calc.rooms ?? [];
  const measured: Array<Record<string, unknown>> = Array.isArray(roomsData)
    ? (roomsData as Array<Record<string, unknown>>)
    : [];
  return results.map((r: RoomResult, idx: number) => {
    // Замер к позиции расчёта: по id комнаты, иначе по имени, иначе по порядку
    const raw =
      (r.roomId ? measured.find((m) => m.id === r.roomId) : undefined) ??
      (r.roomName ? measured.find((m) => m.name === r.roomName) : undefined) ??
      (measured.length === results.length ? measured[idx] : undefined);
    const plan = planRoomOf(raw);
    const input = inputs.find(
      (i) =>
        (i as unknown as { id?: string; roomId?: string }).id === r.roomId ||
        (i as unknown as { id?: string; roomId?: string }).roomId === r.roomId
    );
    const designerData =
      (input as unknown as { designerData?: RoomDesignerData })?.designerData ??
      null;
    return {
      id: r.roomId,
      name: r.roomName,
      area: r.area,
      items: (r.items ?? []).map(mapLineItem),
      total: r.subtotalAfterHeight ?? r.subtotal,
      designerData,
      plan,
    };
  });
}

function mapLineItem(li: LineItem): PdfLineItem {
  return {
    itemCode: li.itemCode,
    name: li.itemName,
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    total: li.total,
    photoUrl: li.photoUrl,
  };
}

function mapBranding(m: {
  companyName: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  whatsappPhone: string | null;
  instagramUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  coverPhotoUrl: string | null;
  brandColor: string;
  legalName: string | null;
  bin: string | null;
  iban: string | null;
  prepaymentPercent: number;
  warrantyMaterials: number;
  warrantyInstall: number;
  currency?: string | null;
}): PdfMasterBranding {
  return {
    // Мастер без названия компании — это он сам, а не мы. КП «от potolok.ai»
    // клиенту отправлять нельзя: мастера прячут свои инструменты
    // (аудит 24.09.2026).
    companyName: m.companyName || `${m.firstName} ${m.lastName ?? ""}`.trim() || "Мастер натяжных потолков",
    ownerName: `${m.firstName} ${m.lastName ?? ""}`.trim() || m.firstName,
    phone: m.phone,
    whatsappPhone: m.whatsappPhone || m.phone,
    instagramUrl: m.instagramUrl,
    logoUrl: m.logoUrl,
    tagline: m.tagline,
    coverPhotoUrl: m.coverPhotoUrl,
    brandColor: m.brandColor,
    legalName: m.legalName,
    bin: m.bin,
    iban: m.iban,
    prepaymentPercent: m.prepaymentPercent,
    warrantyMaterials: m.warrantyMaterials,
    warrantyInstall: m.warrantyInstall,
    // estimate.master уже подменён на владельца (ownerBrandFor) — валюта его
    currency: asCurrency(m.currency),
  };
}

function mapPortfolio(p: {
  id: string;
  title: string | null;
  ceilingType: string | null;
  photos: string[];
}): PdfPortfolioItem {
  // В photos бывают и видео (mp4/mov) — в PDF такое не вставить, берём первое фото
  const photo = (p.photos ?? []).find((u) => !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u));
  return {
    id: p.id,
    title: p.title,
    ceilingType: p.ceilingType,
    photoUrl: photo ?? null,
  };
}

function mapReview(r: {
  id: string;
  clientName: string;
  rating: number;
  text: string;
  location: string | null;
}): PdfReview {
  return {
    id: r.id,
    clientName: r.clientName,
    rating: r.rating,
    text: r.text,
    location: r.location,
  };
}

function normalizeUrl(u: string): string {
  if (!u) return "https://potolok.ai";
  if (u.startsWith("http")) return u.replace(/\/$/, "");
  return `https://${u}`.replace(/\/$/, "");
}
