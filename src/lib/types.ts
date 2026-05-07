import type { CanvasType } from "./constants";

// ============================================
// Room Shapes
// ============================================

export type RoomShape = "rectangle" | "l-shape" | "t-shape" | "custom";

export interface LShapeDimensions {
  a: number; // top width (meters) →
  b: number; // right side going down (meters) ↓
  c: number; // step going left (meters) ← (new: clockwise)
  d: number; // inner side going down (meters) ↓ (new: clockwise)
  e?: number; // bottom width (meters) ← (new: clockwise, if undefined = old format)
  // Left wall F = b + d (derived)
  // Constraint: a = c + e
}

export interface TShapeDimensions {
  a: number; // top width (meters)
  b: number; // top height (meters)
  c: number; // stem width (meters)
  d: number; // stem height (meters)
}

export interface CustomWall {
  length: number;      // wall length in meters
  turnRight: boolean;  // true = right turn (interior 90°), false = left turn (exterior 90°)
  angle?: number;      // turn angle in degrees (overrides turnRight). +90 = right, -90 = left/step, any value for custom angles
}

export interface CustomDimensions {
  walls: CustomWall[];
}

// ============================================
// Доп. позиции (разовые)
// ============================================

/** Разовая позиция внутри комнаты (попадает в её итог) */
export interface OneOffItem {
  name: string;
  price: number;
  quantity: number;
  unit?: string;
}

/** Доп. работа на уровне всего КП (отдельный блок «Дополнительно») */
export interface ExtraItem {
  name: string;
  price: number;
  quantity: number;
  unit?: string;
}

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
  chandelierInstallCount: number;
  /** Подвесные светильники / бра — закладная + установка как у люстр, но дешевле. */
  pendantCount?: number;
  trackMagneticLength: number;
  lightLineLength: number;
  curtainRodLength: number;
  pipeBypasses: number;
  cornersCount: number;
  eurobrusCount: number;
  shape?: RoomShape;
  lShapeDims?: LShapeDimensions;
  tShapeDims?: TShapeDimensions;
  customDims?: CustomDimensions;
  // Component selection (master chooses)
  profileType?: string;
  spotType?: string;
  cornerType?: string;
  curtainType?: string;
  transformerCount?: number;
  // Gardina + Podshtornik
  gardinaLength: number;
  gardinaType?: string;
  podshtornikLength: number;
  /** Длина участка СТЕНЫ, покрытого подшторником (без глубины ниши).
   *  Используется для вычитания из периметра багета. Если не задано — fallback на podshtornikLength. */
  podshtornikOnWallLength?: number;
  podshtornikType?: string;
  /** Количество скруглённых углов комнаты — отдельная позиция в КП.
   *  Площадь и периметр уже скорректированы (Room.area/perimeter), но монтаж дороже. */
  roundedCornersCount?: number;
  /** Площадь мебели «до потолка» в м² — вычитается из площади натяжного потолка. */
  furnitureCeilingArea?: number;
  /** Изменение периметра профиля от обхода мебели до потолка (м, может быть отрицательным).
   *  perimeterDelta = (длина граней мебели «в комнату») − (длина граней «у стены»). */
  furnitureCeilingPerimeterDelta?: number;
  /** Углы профиля для обхода мебели до потолка — устаревшее (до 2026-05-07 считалось как штуки). Сохранено для совместимости. */
  furnitureCeilingCorners?: number;
  /** Длина обвода мебели до потолка (м.п.) — отдельная позиция в КП. */
  furnitureCeilingBypassM?: number;
  /** Углы под будущую мебель (planned) — отдельная позиция в КП. */
  furniturePlannedCorners?: number;
  /** Площадь planned мебели (м²) — для информации в КП (зарезервировано). */
  furniturePlannedArea?: number;
  // Custom items per room (из справочника /dashboard/prices)
  customItems?: { itemId: string; quantity: number }[];
  // Разовые позиции этой комнаты — мастер вводит руками, не сохраняются в каталог
  oneOffItems?: OneOffItem[];
  /** PNG-снимок 3D-сцены этой комнаты (Vercel Blob URL) — попадает в Estimate.room3dPreviewUrl и на публичную КП. */
  previewUrl3d?: string;
  // Raw data for Room Designer round-trip editing
  designerData?: {
    walls: number[];
    angles: number[];
    normalCorners: boolean[];
    area: number;
    perimeter: number;
    elements?: unknown[];
    arcBulges?: number[];
    columns?: unknown[];
  };
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

export interface RoomResult {
  roomId: string;
  roomName: string;
  area: number;
  perimeter: number;
  items: LineItem[];
  subtotal: number;
  heightMultiplied: boolean;
  subtotalAfterHeight: number;
}

export interface CalculationResult {
  rooms: RoomInput[];
  roomResults: RoomResult[];
  /** Дополнительные позиции вне комнат (блок «Дополнительно») */
  extraItems?: LineItem[];
  subtotal: number;
  minOrderApplied: boolean;
  total: number;
  totalArea: number;
  totalPerimeter: number;
  totalSpots: number;
  totalChandeliers: number;
  pricePerM2: number;
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
// Chat / Assistant
// ============================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  timestamp: string;
  quickActions?: QuickAction[];
  calculationResult?: CalculationResult;
}

export interface QuickAction {
  label: string;
  action: string;
  data?: Record<string, unknown>;
}

// ============================================
// Master Profile
// ============================================

export interface MasterProfile {
  id: string;
  phone: string;
  email?: string | null;
  firstName: string;
  lastName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  instagramUrl?: string | null;
  whatsappPhone?: string | null;
  address?: string | null;
  subscriptionTier: "FREE" | "PRO" | "PROPLUS";
  kpGeneratedThisMonth: number;
  telegramChatId?: string | null;
  // Contract settings
  contractType?: string | null;
  bin?: string | null;
  iin?: string | null;
  legalName?: string | null;
  legalAddress?: string | null;
  bankName?: string | null;
  iban?: string | null;
  kbe?: string | null;
  bik?: string | null;
  passportData?: string | null;
  prepaymentPercent: number;
  warrantyMaterials: number;
  warrantyInstall: number;
  contractCity?: string | null;
  onboardingCompleted: boolean;
}
