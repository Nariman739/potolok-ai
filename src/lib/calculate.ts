import type {
  RoomInput,
  LineItem,
  RoomVariant,
  Variant,
  VariantType,
  CalculationResult,
} from "./types";
import { PRODUCT_BY_CODE, DEFAULT_PRICES } from "./constants";

type PriceMap = Record<string, number>;

function getPrice(prices: PriceMap, code: string): number {
  return prices[code] ?? DEFAULT_PRICES[code] ?? 0;
}

function getItemName(code: string): string {
  return PRODUCT_BY_CODE[code]?.name ?? code;
}

function getUnit(code: string): string {
  return PRODUCT_BY_CODE[code]?.unit ?? "";
}

function makeLineItem(
  code: string,
  quantity: number,
  prices: PriceMap
): LineItem | null {
  if (quantity <= 0) return null;
  const unitPrice = getPrice(prices, code);
  return {
    itemCode: code,
    itemName: getItemName(code),
    quantity,
    unit: getUnit(code),
    unitPrice,
    total: Math.round(unitPrice * quantity),
  };
}

/**
 * Determine canvas code based on variant and room
 */
function getCanvasCode(
  room: RoomInput,
  variantType: VariantType
): string {
  if (variantType === "premium") return "canvas_over";

  if (variantType === "standard") {
    // Standard uses canvas_550 minimum, upgrades to canvas_over for glyanets/color
    if (room.canvasType === "glyanets" || room.canvasType === "color") {
      return "canvas_over";
    }
    return "canvas_550";
  }

  // Economy: cheapest canvas that fits the room width
  if (room.canvasType === "glyanets" || room.canvasType === "color") {
    return "canvas_over";
  }
  const minDim = Math.min(room.length, room.width);
  if (minDim <= 3.2) return "canvas_320";
  if (minDim <= 5.5) return "canvas_550";
  return "canvas_over";
}

interface VariantConfig {
  type: VariantType;
  label: string;
  profileCode: string;
  spotCode: string;
  includeTransformer: boolean;
  cornerCode: string;
  curtainCode: string;
}

const VARIANT_CONFIGS: VariantConfig[] = [
  {
    type: "economy",
    label: "Эконом",
    profileCode: "profile_galtel",
    spotCode: "spot_client",
    includeTransformer: false,
    cornerCode: "corner_standard",
    curtainCode: "curtain_ldsp",
  },
  {
    type: "standard",
    label: "Стандарт",
    profileCode: "profile_insert",
    spotCode: "spot_ours",
    includeTransformer: true,
    cornerCode: "corner_standard",
    curtainCode: "curtain_ldsp",
  },
  {
    type: "premium",
    label: "Премиум",
    profileCode: "profile_shadow",
    spotCode: "spot_double",
    includeTransformer: true,
    cornerCode: "corner_premium",
    curtainCode: "curtain_aluminum",
  },
];

function calculateRoomVariant(
  room: RoomInput,
  config: VariantConfig,
  prices: PriceMap
): RoomVariant {
  const area = room.length * room.width;
  const perimeter = 2 * (room.length + room.width);
  const items: LineItem[] = [];

  // Canvas
  const canvasCode = getCanvasCode(room, config.type);
  const canvasItem = makeLineItem(canvasCode, area, prices);
  if (canvasItem) items.push(canvasItem);

  // Profile
  const profileItem = makeLineItem(config.profileCode, perimeter, prices);
  if (profileItem) items.push(profileItem);

  // Spots
  const spotItem = makeLineItem(config.spotCode, room.spotsCount, prices);
  if (spotItem) items.push(spotItem);

  // Chandeliers
  if (room.chandelierCount > 0) {
    const chandelierItem = makeLineItem("chandelier", room.chandelierCount, prices);
    if (chandelierItem) items.push(chandelierItem);

    if (config.includeTransformer) {
      const transformerItem = makeLineItem("transformer", room.chandelierCount, prices);
      if (transformerItem) items.push(transformerItem);
    }
  }

  // Track magnetic
  if (room.trackMagneticLength > 0) {
    const trackItem = makeLineItem("track_magnetic", room.trackMagneticLength, prices);
    if (trackItem) items.push(trackItem);
  }

  // Light line
  if (room.lightLineLength > 0) {
    const lightItem = makeLineItem("light_line", room.lightLineLength, prices);
    if (lightItem) items.push(lightItem);
  }

  // Corners
  const cornersCount = room.cornersCount > 0 ? room.cornersCount : 4;
  const cornerItem = makeLineItem(config.cornerCode, cornersCount, prices);
  if (cornerItem) items.push(cornerItem);

  // Curtain rod
  if (room.curtainRodLength > 0) {
    const curtainItem = makeLineItem(config.curtainCode, room.curtainRodLength, prices);
    if (curtainItem) items.push(curtainItem);
  }

  // Pipe bypass
  if (room.pipeBypasses > 0) {
    const pipeItem = makeLineItem("pipe_bypass", room.pipeBypasses, prices);
    if (pipeItem) items.push(pipeItem);
  }

  // Eurobrus
  if (room.eurobrusCount > 0) {
    const eurobrusItem = makeLineItem("eurobrus", room.eurobrusCount, prices);
    if (eurobrusItem) items.push(eurobrusItem);
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  // Height multiplier
  const heightCoeff = getPrice(prices, "height_coefficient");
  const heightMultiplied = room.ceilingHeight > 3;
  const subtotalAfterHeight = heightMultiplied
    ? Math.round(subtotal * heightCoeff)
    : subtotal;

  return {
    roomId: room.id,
    roomName: room.name,
    area,
    perimeter,
    items,
    subtotal,
    heightMultiplied,
    subtotalAfterHeight,
  };
}

export function calculate(
  rooms: RoomInput[],
  prices: PriceMap
): CalculationResult {
  const totalArea = rooms.reduce((sum, r) => sum + r.length * r.width, 0);
  const totalPerimeter = rooms.reduce(
    (sum, r) => sum + 2 * (r.length + r.width),
    0
  );
  const totalSpots = rooms.reduce((sum, r) => sum + r.spotsCount, 0);
  const totalChandeliers = rooms.reduce(
    (sum, r) => sum + r.chandelierCount,
    0
  );

  const minOrder = getPrice(prices, "min_order");

  const variants: Variant[] = VARIANT_CONFIGS.map((config) => {
    const roomVariants = rooms.map((room) =>
      calculateRoomVariant(room, config, prices)
    );

    const subtotal = roomVariants.reduce(
      (sum, rv) => sum + rv.subtotalAfterHeight,
      0
    );

    const minOrderApplied = subtotal < minOrder;
    const total = Math.max(subtotal, minOrder);

    return {
      type: config.type,
      label: config.label,
      rooms: roomVariants,
      subtotal,
      minOrderApplied,
      total,
      pricePerM2: totalArea > 0 ? Math.round(total / totalArea) : 0,
    };
  });

  return {
    rooms,
    variants,
    totalArea,
    totalPerimeter,
    totalSpots,
    totalChandeliers,
    calculatedAt: new Date().toISOString(),
  };
}
