import type {
  RoomInput,
  LineItem,
  RoomResult,
  CalculationResult,
} from "./types";
import { PRODUCT_BY_CODE, DEFAULT_PRICES, PROFILE_CORNER_MAP, CANVAS_TYPES } from "./constants";
import { computeArea, computePerimeter, getBoundingBoxMinDim } from "./room-geometry";

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
 * Determine canvas code based on master's canvas type choice
 */
function getCanvasCode(room: RoomInput): string {
  const entry = CANVAS_TYPES.find((ct) => ct.value === room.canvasType);
  if (entry) return entry.code;
  // Fallback for old data without canvasType
  const minDim = getBoundingBoxMinDim(room);
  if (minDim <= 3.2) return "canvas_320";
  if (minDim <= 5.5) return "canvas_550";
  return "canvas_over";
}

function calculateRoom(
  room: RoomInput,
  prices: PriceMap
): RoomResult {
  const area = computeArea(room);
  const perimeter = computePerimeter(room);
  const items: LineItem[] = [];

  // Canvas
  const canvasCode = getCanvasCode(room);
  const canvasItem = makeLineItem(canvasCode, area, prices);
  if (canvasItem) items.push(canvasItem);

  // Profile — master's choice or default
  const profileCode = room.profileType || "profile_insert";
  if (profileCode === "profile_galtel") {
    // Plastic profile only (galtel installed by others)
    const plasticItem = makeLineItem("profile_plastic", perimeter, prices);
    if (plasticItem) items.push(plasticItem);
  } else if (profileCode === "profile_insert") {
    // Plastic profile + insert strip (2 line items)
    const plasticItem = makeLineItem("profile_plastic", perimeter, prices);
    if (plasticItem) items.push(plasticItem);
    const insertItem = makeLineItem("insert", perimeter, prices);
    if (insertItem) items.push(insertItem);
  } else {
    // Shadow or floating — single aluminum profile
    const profileItem = makeLineItem(profileCode, perimeter, prices);
    if (profileItem) items.push(profileItem);
  }

  // Spots — master's choice or default
  if (room.spotsCount > 0) {
    const spotCode = room.spotType || "spot_ours";
    const spotItem = makeLineItem(spotCode, room.spotsCount, prices);
    if (spotItem) items.push(spotItem);
  }

  // Chandeliers
  if (room.chandelierCount > 0) {
    const chandelierItem = makeLineItem("chandelier", room.chandelierCount, prices);
    if (chandelierItem) items.push(chandelierItem);

    // Transformer — master's choice (default: include)
    const includeTransformer = room.includeTransformer ?? true;
    if (includeTransformer) {
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

  // Corners — auto-determined by profile type
  const cornersCount = room.cornersCount > 0 ? room.cornersCount : 4;
  const cornerCode = PROFILE_CORNER_MAP[profileCode] || "corner_plastic";
  const cornerItem = makeLineItem(cornerCode, cornersCount, prices);
  if (cornerItem) items.push(cornerItem);

  // Curtain rod — master's choice or default
  if (room.curtainRodLength > 0) {
    const curtainCode = room.curtainType || "curtain_ldsp";
    const curtainItem = makeLineItem(curtainCode, room.curtainRodLength, prices);
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
  const totalArea = rooms.reduce((sum, r) => sum + computeArea(r), 0);
  const totalPerimeter = rooms.reduce(
    (sum, r) => sum + computePerimeter(r),
    0
  );
  const totalSpots = rooms.reduce((sum, r) => sum + r.spotsCount, 0);
  const totalChandeliers = rooms.reduce(
    (sum, r) => sum + r.chandelierCount,
    0
  );

  const roomResults = rooms.map((room) => calculateRoom(room, prices));

  const subtotal = roomResults.reduce(
    (sum, rr) => sum + rr.subtotalAfterHeight,
    0
  );

  const minOrder = getPrice(prices, "min_order");
  const minOrderApplied = subtotal < minOrder;
  const total = Math.max(subtotal, minOrder);

  return {
    rooms,
    roomResults,
    subtotal,
    minOrderApplied,
    total,
    totalArea,
    totalPerimeter,
    totalSpots,
    totalChandeliers,
    pricePerM2: totalArea > 0 ? Math.round(total / totalArea) : 0,
    calculatedAt: new Date().toISOString(),
  };
}
