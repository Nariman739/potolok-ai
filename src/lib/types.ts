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
}

export interface CustomDimensions {
  walls: CustomWall[];
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
  podshtornikType?: string;
  // Custom items per room
  customItems?: { itemId: string; quantity: number }[];
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
  subscriptionTier: "FREE" | "PRO";
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
}
