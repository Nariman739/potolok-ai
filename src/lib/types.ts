import type { CanvasType } from "./constants";

// ============================================
// Room Input
// ============================================

export interface RoomInput {
  id: string;
  name: string;
  length: number;
  width: number;
  ceilingHeight: number;
  canvasType: CanvasType;
  spotsCount: number;
  chandelierCount: number;
  trackMagneticLength: number;
  lightLineLength: number;
  curtainRodLength: number;
  pipeBypasses: number;
  cornersCount: number;
  eurobrusCount: number;
}

// ============================================
// Calculation Result
// ============================================

export interface LineItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface RoomVariant {
  roomId: string;
  roomName: string;
  area: number;
  perimeter: number;
  items: LineItem[];
  subtotal: number;
  heightMultiplied: boolean;
  subtotalAfterHeight: number;
}

export type VariantType = "economy" | "standard" | "premium";

export interface Variant {
  type: VariantType;
  label: string;
  rooms: RoomVariant[];
  subtotal: number;
  minOrderApplied: boolean;
  total: number;
  pricePerM2: number;
}

export interface CalculationResult {
  rooms: RoomInput[];
  variants: Variant[];
  totalArea: number;
  totalPerimeter: number;
  totalSpots: number;
  totalChandeliers: number;
  calculatedAt: string;
}

// ============================================
// Client Info
// ============================================

export interface ClientInfo {
  name?: string;
  phone?: string;
  address?: string;
}

// ============================================
// Master Profile
// ============================================

export interface MasterProfile {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  instagramUrl?: string | null;
  whatsappPhone?: string | null;
  address?: string | null;
  subscriptionTier: "FREE" | "PRO";
  kpGeneratedThisMonth: number;
}
