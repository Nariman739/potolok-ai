import { prisma } from "@/lib/prisma";
import type { CalculationResult, LineItem, RoomResult } from "@/lib/types";
import QRCode from "qrcode";
import { themeFor } from "./themes";
import { DEFAULT_KP_CONFIG } from "./templates";
import type { KpConfig, KpTheme, FontPair, KpSection } from "./types";

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
};

export type PdfLineItem = {
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
};

export type PdfEstimate = {
  id: string;
  publicId: string;
  clientName: string;
  clientAddress: string;
  total: number;
  discountPercent: number;
  totalArea: number;
  validUntil: Date | null;
  createdAt: Date;
  room3dPreviewUrl: string | null;
  rooms: PdfRoom[];
  extraItems: PdfLineItem[];
  subtotal: number;
  isQuick: boolean; // true когда мастер пометил calc.quickEstimate (быстрый расчёт без замера)
};

export type PdfData = {
  master: PdfMasterBranding;
  estimate: PdfEstimate;
  portfolio: PdfPortfolioItem[];
  reviews: PdfReview[];
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

export async function buildPdfData(estimateId: string, masterId?: string): Promise<PdfData> {
  const estimate = await prisma.estimate.findFirst({
    where: masterId ? { id: estimateId, masterId } : { id: estimateId },
    include: {
      master: {
        include: {
          portfolioWorks: {
            where: { isPublished: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            take: 6,
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

  const config = normalizeConfig(estimate.master.kpConfig);
  const { theme, fonts } = themeFor({
    brandColor: estimate.master.brandColor,
    kpConfig: config,
  });

  const calc = (estimate.calculationData ?? {}) as unknown as CalculationResult & {
    quickEstimate?: boolean;
  };
  const rooms = mapRooms(calc);
  const extraItems = (calc.extraItems ?? []).map(mapLineItem);
  const subtotal = calc.subtotal ?? estimate.total ?? 0;
  const isQuick = !!calc.quickEstimate;

  const publicUrl = `${normalizeUrl(BASE_URL)}/kp/${estimate.publicId}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    margin: 1,
    width: 360,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });

  return {
    master: mapBranding(estimate.master),
    estimate: {
      id: estimate.id,
      publicId: estimate.publicId,
      clientName: estimate.clientName ?? "Клиент",
      clientAddress: estimate.clientAddress ?? "",
      total: estimate.total ?? 0,
      discountPercent: estimate.discountPercent ?? 0,
      totalArea: estimate.totalArea ?? 0,
      validUntil: estimate.validUntil,
      createdAt: estimate.createdAt,
      room3dPreviewUrl: estimate.room3dPreviewUrl,
      rooms,
      extraItems,
      subtotal,
      isQuick,
    },
    portfolio: estimate.master.portfolioWorks.map(mapPortfolio),
    reviews: estimate.master.reviews.map(mapReview),
    qrDataUrl,
    publicUrl,
    config,
    theme,
    fonts,
  };
}

// ============================================
// Helpers
// ============================================

export function normalizeConfig(raw: unknown): KpConfig {
  if (!raw || typeof raw !== "object") return JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG));
  const obj = raw as Partial<KpConfig>;
  // Если нет sections — берём дефолт целиком (включая дефолтные FAQ/гарантии)
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG)),
      template: obj.template ?? DEFAULT_KP_CONFIG.template,
      fontPair: obj.fontPair ?? null,
    };
  }
  return {
    template: obj.template ?? DEFAULT_KP_CONFIG.template,
    fontPair: obj.fontPair ?? null,
    sections: obj.sections as KpSection[],
  };
}

function mapRooms(calc: CalculationResult): PdfRoom[] {
  const results = calc.roomResults ?? [];
  const inputs = calc.rooms ?? [];
  return results.map((r: RoomResult) => {
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
    };
  });
}

function mapLineItem(li: LineItem): PdfLineItem {
  return {
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
}): PdfMasterBranding {
  return {
    companyName: m.companyName || `${m.firstName} ${m.lastName ?? ""}`.trim() || "potolok.ai",
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
  };
}

function mapPortfolio(p: {
  id: string;
  title: string | null;
  ceilingType: string | null;
  photos: string[];
}): PdfPortfolioItem {
  return {
    id: p.id,
    title: p.title,
    ceilingType: p.ceilingType,
    photoUrl: p.photos?.[0] ?? null,
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
