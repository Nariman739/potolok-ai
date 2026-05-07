import type {
  RoomInput,
  LineItem,
  RoomResult,
  CalculationResult,
  ExtraItem,
} from "./types";
import { PRODUCT_BY_CODE, DEFAULT_PRICES, PROFILE_CORNER_MAP } from "./constants";
import { computeArea, computePerimeter, getBoundingBoxMinDim } from "./room-geometry";

type PriceMap = Record<string, number>;

export interface CustomItemInfo {
  code: string;
  name: string;
  unit: string;
  price: number;
}

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
 * Цена полотна определяется автоматически по короткой стороне комнаты.
 * Это ширина рулона плёнки: ≤3.2м, ≤5.5м или больше — без шва на потолке.
 */
function getCanvasCode(room: RoomInput): string {
  const minDim = getBoundingBoxMinDim(room);
  if (minDim <= 3.2) return "canvas_320";
  if (minDim <= 5.5) return "canvas_550";
  return "canvas_over";
}

function calculateRoom(
  room: RoomInput,
  prices: PriceMap,
  customItemsMap?: Record<string, CustomItemInfo>
): RoomResult {
  // Площадь натяжного потолка: вычитаем мебель «до потолка» (она съедает площадь).
  const furnitureArea = room.furnitureCeilingArea ?? 0;
  const area = Math.max(0, computeArea(room) - furnitureArea);
  const perimeter = computePerimeter(room);
  const items: LineItem[] = [];

  // Багет/вставка идут только по стенам, НЕ под подшторником.
  // + Учитываем обход мебели до потолка: in-room грани добавляются, at-wall грани вычитаются.
  // Fallback на podshtornikLength для старых данных без onWall-поля.
  const podOnWallM = room.podshtornikOnWallLength ?? room.podshtornikLength ?? 0;
  const furniturePerimDelta = room.furnitureCeilingPerimeterDelta ?? 0;
  const profilePerimeter = Math.max(0, perimeter - podOnWallM + furniturePerimDelta);
  // Парящий профиль идёт отдельной позицией и вычитается из периметра
  // обычного профиля (плacтик/вставка), чтобы не было двойного счёта.
  const floatingLen = Math.min(room.floatingLength ?? 0, profilePerimeter);
  const baseProfileLen = Math.max(0, profilePerimeter - floatingLen);

  // Canvas
  const canvasCode = getCanvasCode(room);
  const canvasItem = makeLineItem(canvasCode, area, prices);
  if (canvasItem) items.push(canvasItem);

  // Profile — master's choice or default
  const profileCode = room.profileType || "profile_insert";
  if (profileCode === "profile_galtel") {
    // Plastic profile only (galtel installed by others)
    const plasticItem = makeLineItem("profile_plastic", baseProfileLen, prices);
    if (plasticItem) items.push(plasticItem);
  } else if (profileCode === "profile_insert") {
    // Plastic profile + insert strip (2 line items)
    const plasticItem = makeLineItem("profile_plastic", baseProfileLen, prices);
    if (plasticItem) items.push(plasticItem);
    const insertItem = makeLineItem("insert", baseProfileLen, prices);
    if (insertItem) items.push(insertItem);
  } else {
    // Shadow or floating — single aluminum profile.
    // Если у комнаты явно указан profile_floating, по периметру весь парящий.
    const profileItem = makeLineItem(profileCode, profilePerimeter, prices);
    if (profileItem) items.push(profileItem);
  }

  // Отдельная позиция «Парящий профиль» — только если он не основной
  // (для basic-профилей плacтик/вставка/галтель/теневой).
  if (
    floatingLen > 0 &&
    profileCode !== "profile_floating"
  ) {
    const fpItem = makeLineItem("profile_floating", floatingLen, prices);
    if (fpItem) items.push(fpItem);
  }

  // Spots — одиночные считаются по spotType. Двойные и тройные — отдельные
  // позиции (пара = 1 шт «Софиты двойные», тройка = 1 шт «Софиты тройные»),
  // чтобы в КП мастер видел реальную единицу учёта (не 2/3 спота за пару).
  if (room.spotsCount > 0) {
    const spotCode = room.spotType || "spot_ours";
    const spotItem = makeLineItem(spotCode, room.spotsCount, prices);
    if (spotItem) items.push(spotItem);
  }
  const spotPairs = room.spotPairsCount ?? 0;
  if (spotPairs > 0) {
    const pairItem = makeLineItem("spot_pair", spotPairs, prices);
    if (pairItem) items.push(pairItem);
  }
  const spotTriples = room.spotTriplesCount ?? 0;
  if (spotTriples > 0) {
    const tripleItem = makeLineItem("spot_triple", spotTriples, prices);
    if (tripleItem) items.push(tripleItem);
  }

  // Chandeliers (закладные)
  if (room.chandelierCount > 0) {
    const chandelierItem = makeLineItem("chandelier", room.chandelierCount, prices);
    if (chandelierItem) items.push(chandelierItem);

    // Transformer — quantity entered by master
    const transformerCount = room.transformerCount ?? 0;
    if (transformerCount > 0) {
      const transformerItem = makeLineItem("transformer", transformerCount, prices);
      if (transformerItem) items.push(transformerItem);
    }
  }

  // Chandelier installation (установка люстр)
  const installCount = room.chandelierInstallCount ?? 0;
  if (installCount > 0) {
    const installItem = makeLineItem("chandelier_install", installCount, prices);
    if (installItem) items.push(installItem);
  }

  // Pendant lights — закладная + установка отдельной позицией.
  const pendantCount = room.pendantCount ?? 0;
  if (pendantCount > 0) {
    const pendantItem = makeLineItem("pendant", pendantCount, prices);
    if (pendantItem) items.push(pendantItem);
    const pendantInstallItem = makeLineItem("pendant_install", pendantCount, prices);
    if (pendantInstallItem) items.push(pendantInstallItem);
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

  // Gardina (пластиковая на потолок / встроенная в потолок)
  if ((room.gardinaLength ?? 0) > 0) {
    const gardinaCode = room.gardinaType || "gardina_plastic";
    const gardinaItem = makeLineItem(gardinaCode, room.gardinaLength, prices);
    if (gardinaItem) items.push(gardinaItem);
  }

  // Podshtornik
  if ((room.podshtornikLength ?? 0) > 0) {
    const podshtornikCode = room.podshtornikType || "podshtornik_aluminum";
    const podshtornikItem = makeLineItem(podshtornikCode, room.podshtornikLength, prices);
    if (podshtornikItem) items.push(podshtornikItem);
  }

  // Скруглённые углы — отдельная позиция (сложнее в монтаже).
  // Площадь и периметр уже скорректированы выше; здесь только надбавка за каждый скруглённый угол.
  if ((room.roundedCornersCount ?? 0) > 0) {
    const roundedItem = makeLineItem("corner_rounded", room.roundedCornersCount ?? 0, prices);
    if (roundedItem) items.push(roundedItem);
  }

  // Обвод мебели до потолка (м.п.) — отдельная позиция, чтобы было видно почему дороже.
  // Backwards compat: если есть только furnitureCeilingCorners (старые расчёты), считаем как количество м.п.
  const bypassM = room.furnitureCeilingBypassM ?? room.furnitureCeilingCorners ?? 0;
  if (bypassM > 0) {
    const item = makeLineItem("corner_furniture_bypass", bypassM, prices);
    if (item) items.push(item);
  }
  // Уголки под будущую мебель — отдельная позиция, помечает резерв под последующую установку.
  if ((room.furniturePlannedCorners ?? 0) > 0) {
    const item = makeLineItem("corner_furniture_planned", room.furniturePlannedCorners ?? 0, prices);
    if (item) items.push(item);
  }

  // Custom items (из справочника /dashboard/prices)
  if (room.customItems && room.customItems.length > 0 && customItemsMap) {
    for (const ci of room.customItems) {
      if (ci.quantity <= 0) continue;
      const info = customItemsMap[ci.itemId];
      if (!info) continue;
      items.push({
        itemCode: ci.itemId,
        itemName: info.name,
        quantity: ci.quantity,
        unit: info.unit,
        unitPrice: info.price,
        total: Math.round(info.price * ci.quantity),
      });
    }
  }

  // One-off items (разовые позиции этой комнаты, без сохранения в справочник)
  if (room.oneOffItems && room.oneOffItems.length > 0) {
    for (const oi of room.oneOffItems) {
      const qty = oi.quantity ?? 1;
      if (qty <= 0 || !oi.name || oi.price <= 0) continue;
      items.push({
        itemCode: `oneoff:${oi.name}`,
        itemName: oi.name,
        quantity: qty,
        unit: oi.unit ?? "шт.",
        unitPrice: oi.price,
        total: Math.round(oi.price * qty),
      });
    }
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
  prices: PriceMap,
  customItemsMap?: Record<string, CustomItemInfo>,
  extraItems?: ExtraItem[]
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

  const roomResults = rooms.map((room) => calculateRoom(room, prices, customItemsMap));

  const roomsSubtotal = roomResults.reduce(
    (sum, rr) => sum + rr.subtotalAfterHeight,
    0
  );

  // Дополнительные позиции на уровне всего КП (вне комнат)
  const extraLineItems: LineItem[] = [];
  if (extraItems && extraItems.length > 0) {
    for (const ei of extraItems) {
      const qty = ei.quantity ?? 1;
      if (qty <= 0 || !ei.name || ei.price <= 0) continue;
      extraLineItems.push({
        itemCode: `extra:${ei.name}`,
        itemName: ei.name,
        quantity: qty,
        unit: ei.unit ?? "шт.",
        unitPrice: ei.price,
        total: Math.round(ei.price * qty),
      });
    }
  }
  const extraSubtotal = extraLineItems.reduce((sum, item) => sum + item.total, 0);

  const subtotal = roomsSubtotal + extraSubtotal;

  const minOrder = getPrice(prices, "min_order");
  const minOrderApplied = subtotal < minOrder;
  const total = Math.max(subtotal, minOrder);

  return {
    rooms,
    roomResults,
    extraItems: extraLineItems,
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
