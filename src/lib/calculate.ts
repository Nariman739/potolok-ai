import type {
  RoomInput,
  LineItem,
  RoomResult,
  CalculationResult,
  ExtraItem,
} from "./types";
import { PRODUCT_BY_CODE, PROFILE_CORNER_MAP, defaultPricesFor } from "./constants";
import { computeArea, computePerimeter, getBoundingBoxMinDim } from "./room-geometry";
import { isStandardSpotCode } from "./spot-types";
import { canvasMinSideCm, pickFilmStep, pickMainCanvas, type CanvasCatalog, type CanvasCode, type CanvasFilm } from "./canvas-pricing";
import { wallProfilePricing, type WallProfileResult, type WallProfileVariant } from "./wall-profile-pricing";

type PriceMap = Record<string, number>;

export interface CustomItemInfo {
  code: string;
  name: string;
  unit: string;
  price: number;
  photoUrl?: string | null;
  /** Категория позиции прайса: вариант подставляем только в свою категорию. */
  category?: string | null;
  /** Своя ставка монтажа позиции */
  installerPrice?: number | null;
  isHidden?: boolean;
  /** Полотно: ширина рулона и принадлежность плёнке с лестницей. */
  maxWidthCm?: number | null;
  filmKey?: string | null;
  filmName?: string | null;
  /** Свой багет: на него ставится вставка. Свой профиль комнаты: без вставки. */
  withInsert?: boolean;
  noInsert?: boolean;
}

/** Монтажная позиция для строки со своим вариантом: код own:… не сопоставить с нарядом. */
const VARIANT_INSTALL_CODE: Record<string, string> = {
  canvas: "install_canvas",
  spot_pair: "install_spot",
  gardina: "install_gardina",
  track: "install_track",
  lightline: "install_lightline",
  profile: "install_profile",
};

const roundTenth = (n: number) => Math.round(n * 10) / 10;
const roundHundredth = (n: number) => Math.round(n * 100) / 100;

/**
 * Цена по коду из полного прайса (см. `priceBook`). Раньше тут был запасной
 * DEFAULT_PRICES — тенговые дефолты, которые у рублёвого мастера давали
 * 90 000 ₽ минималки и 15 000 ₽ за ПК-14 (аудит 10.11.2026).
 */
function getPrice(prices: PriceMap, code: string): number {
  return prices[code] ?? 0;
}

/**
 * Полный прайс для расчёта: дефолты каталога в валюте мастера, поверх — его
 * цены. Для тенге дефолты те же, что были в getPrice, итог не меняется.
 */
function priceBook(prices: PriceMap, currency: string | null | undefined): PriceMap {
  const book: PriceMap = { ...defaultPricesFor(currency) };
  for (const [code, price] of Object.entries(prices)) if (price != null) book[code] = price;
  return book;
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

/** Каталог, свои строки и плёнки из прайса. Без ownItemsById — только цены каталога. */
function canvasBook(prices: PriceMap, ownItemsById?: Record<string, CustomItemInfo>) {
  const entry = (code: CanvasCode) => {
    const row = ownItemsById?.[`catalog:${code}`];
    return { name: row?.name || getItemName(code), price: getPrice(prices, code), hidden: row?.isHidden === true };
  };
  const catalog: CanvasCatalog = { canvas_320: entry("canvas_320"), canvas_550: entry("canvas_550"), canvas_over: entry("canvas_over") };
  const rows: (CustomItemInfo & { id: string })[] = [];
  const films = new Map<string, CanvasFilm>();
  for (const [id, info] of Object.entries(ownItemsById ?? {})) {
    if (id.startsWith("catalog:") || info.category !== "canvas") continue;
    if (!info.filmKey) { rows.push({ ...info, id }); continue; }
    if (!films.has(info.filmKey)) films.set(info.filmKey, { key: info.filmKey, name: info.filmName ?? info.name, steps: [] });
    films.get(info.filmKey)!.steps.push({ id, maxWidthCm: info.maxWidthCm ?? null, price: info.price });
  }
  return { catalog, rows, films };
}

/** Монтаж одиночного софита как в приложении: своя ставка позиции, иначе 30 % цены клиенту. */
function spotInstallRate(item: LineItem, ownItemsById?: Record<string, CustomItemInfo>): number | undefined {
  if (item.variantId) {
    if (item.installCode !== "install_spot") return undefined;
    return ownItemsById?.[item.variantId]?.installerPrice ?? undefined;
  }
  if (!isStandardSpotCode(item.itemCode)) return undefined;
  return ownItemsById?.[`catalog:${item.itemCode}`]?.installerPrice ?? Math.round(item.unitPrice * 0.3);
}

/** Профиль по стенам (wallProfileData из замера приложения) или null — тогда профиль по комнате целиком. */
function profilesByWalls(
  room: RoomInput,
  adjustedPerimeterM: number,
  prices: PriceMap,
  ownItemsById: Record<string, CustomItemInfo> | undefined,
  variantFor: (category: string) => (CustomItemInfo & { id: string }) | null,
): WallProfileResult | null {
  const data = room.wallProfileData;
  if (!data || Object.keys(data.wallProfiles ?? {}).length === 0) return null;
  const asVariant = (id: string, v: CustomItemInfo): WallProfileVariant => ({
    id, name: v.name, unit: v.unit, price: v.price, installerPrice: v.installerPrice, photoUrl: v.photoUrl, withInsert: v.withInsert, noInsert: v.noInsert,
  });
  const wallVariants = Object.entries(ownItemsById ?? {})
    .filter(([id, v]) => !id.startsWith("catalog:") && (v.category === "profile" || v.category === "podshtornik"))
    .map(([id, v]) => asVariant(id, v));
  const override = variantFor("profile");
  return wallProfilePricing({
    walls: data.walls,
    wallProfiles: data.wallProfiles,
    elements: data.elements,
    // Периметр замера, как в приложении (room.perimeter), с обходом мебели.
    adjustedPerimeterM: data.perimeterM != null ? data.perimeterM + (room.furnitureCeilingPerimeterDelta ?? 0) : adjustedPerimeterM,
    bypassPerimeterM: room.furnitureCeilingBypassM ?? 0,
    wallVariants,
    profileOverride: override ? asVariant(override.id, override) : undefined,
    insert: room.withInsert !== false,
    insertColor: room.insertColor,
    price: (code) => getPrice(prices, code),
    // Ставки монтажа как в calcRoom: строки «Для бригады» (install_*) — как есть,
    // вставка и LED-лента — только явная цена работы в прайсе, иначе 0.
    installerRate: (code) => getPrice(prices, code),
    workOnly: (code) => ownItemsById?.[`catalog:${code}`]?.installerPrice ?? 0,
    isHidden: (code) => ownItemsById?.[`catalog:${code}`]?.isHidden === true,
  });
}

function calculateRoom(
  room: RoomInput,
  prices: PriceMap,
  customItemsMap?: Record<string, CustomItemInfo>,
  ownItemsById?: Record<string, CustomItemInfo>
): RoomResult {
  // Площадь натяжного потолка: вычитаем мебель «до потолка» (она съедает площадь).
  // Метраж в КП — до 0,1, как в приложении (13.11.2026): полотно, профиль, вставка,
  // гардина, трек, линия, подшторник. Раньше сайт считал до 0,01 (13,02 м² против 13).
  const furnitureArea = room.furnitureCeilingArea ?? 0;
  const areaFull = Math.max(0, roundTenth((room.measuredArea ?? computeArea(room)) - furnitureArea));
  // Нижний уровень уходит из обычного полотна. Без «2 уровней» площадь прежняя.
  const area = room.level2 ? roundTenth(roundHundredth(Math.max(0, roundTenth(areaFull) - room.level2.canvasCutM2))) : areaFull;
  const perimeter = computePerimeter(room);
  const items: LineItem[] = [];
  const missingVariants: string[] = [];

  // Вариант из прайса, выбранный на комнату. Удалён из прайса — считаем как без
  // выбора и отмечаем категорию, чтобы показать подсказку. Без ownItemsById
  // (ассистент и другие расчёты без прайса вариантов) выбор просто не учитывается.
  const variantFor = (category: string): (CustomItemInfo & { id: string }) | null => {
    const id = room.variantOverrides?.[category];
    if (!id || !ownItemsById) return null;
    const info = ownItemsById[id];
    if (!info || (info.category && info.category !== category)) {
      missingVariants.push(category);
      return null;
    }
    return { ...info, id };
  };
  const variantLine = (variant: CustomItemInfo & { id: string }, category: string, quantity: number, fallbackCode: string): LineItem => ({
    itemCode: variant.code,
    itemName: variant.name,
    quantity,
    unit: variant.unit || getUnit(fallbackCode),
    unitPrice: variant.price,
    total: Math.round(variant.price * quantity),
    variantId: variant.id,
    photoUrl: variant.photoUrl ?? undefined,
    installCode: VARIANT_INSTALL_CODE[category],
  });

  // Багет/вставка идут только по стенам, НЕ под подшторником.
  // + Учитываем обход мебели до потолка: in-room грани добавляются, at-wall грани вычитаются.
  // Fallback на podshtornikLength для старых данных без onWall-поля.
  const podOnWallM = room.podshtornikOnWallLength ?? room.podshtornikLength ?? 0;
  const furniturePerimDelta = room.furnitureCeilingPerimeterDelta ?? 0;
  const profilePerimeter = Math.max(0, perimeter - podOnWallM + furniturePerimDelta);
  // Парящий профиль идёт отдельной позицией и вычитается из периметра
  // обычного профиля (плacтик/вставка), чтобы не было двойного счёта.
  const floatingLen = roundTenth(Math.min(room.floatingLength ?? 0, profilePerimeter));
  const baseProfileLen = roundTenth(Math.max(0, profilePerimeter - floatingLen));

  // Полотно: плёнка или строка, выбранная на комнату (выбор на объект приходит сюда же),
  // иначе основная лестница по ширине, тем же кодом, что в приложении.
  const book = canvasBook(prices, ownItemsById);
  const minSideCm = canvasMinSideCm(room.measuredMinWidth ?? getBoundingBoxMinDim(room));
  const chosenFilm = book.films.get(room.variantOverrides?.canvas ?? "");
  const filmStep = chosenFilm ? pickFilmStep(chosenFilm, minSideCm) : null;
  let filmWidest: string | undefined;
  if (chosenFilm && filmStep) {
    if (filmStep.widest) filmWidest = chosenFilm.name;
    if (!(area <= 0)) items.push({
      itemCode: `own:${filmStep.step.id}`,
      itemName: chosenFilm.name,
      quantity: area,
      unit: "м²",
      unitPrice: filmStep.step.price,
      total: Math.round(filmStep.step.price * area),
      variantId: filmStep.step.id,
      installCode: "install_canvas",
    });
  } else {
    const chosenRow = variantFor("canvas");
    const main = chosenRow ? null : pickMainCanvas(minSideCm, book.catalog, book.rows);
    const row = chosenRow ?? main?.row;
    if (!(area <= 0)) {
      if (row) {
        items.push({ ...variantLine(row, "canvas", area, "canvas_320"), ...(row.installerPrice != null && { installerRate: row.installerPrice }) });
      } else {
        const line = makeLineItem(main!.code!, area, prices);
        if (line) items.push({ ...line, itemName: main!.name });
      }
    }
  }

  // «2 уровня»: верхнее полотно, борт и подсветка — три строки, как в приложении.
  if (room.level2) {
    const totalArea = Math.max(0, computeArea(room));
    for (const [code, quantity] of [
      ["level2_canvas", roundTenth(Math.min(room.level2.upperM2, totalArea))],
      ["level2_step", roundTenth(room.level2.bortM)],
      ["level2_led", roundTenth(room.level2.ledM)],
    ] as const) {
      if (ownItemsById?.[`catalog:${code}`]?.isHidden) continue;
      const line = makeLineItem(code, quantity, prices);
      if (line) items.push(line);
    }
  }

  // Профили по стенам из приложения — тем же кодом, что в приложении (файл-близнец).
  // Комнаты без них считаются как раньше.
  const byWalls = profilesByWalls(room, perimeter + furniturePerimDelta, prices, ownItemsById, variantFor);
  // Profile — master's choice or default
  const profileCode = room.profileType || "profile_insert";
  // Скрытое в прайсе не попадает в КП, если это авто-добавка (вставка, углы) — как в приложении.
  const hiddenInPrice = (code: string) => ownItemsById?.[`catalog:${code}`]?.isHidden === true;
  // Профиль, выбранный на комнату, заменяет пластиковый, как в приложении.
  const profileVariant = !byWalls && (profileCode === "profile_insert" || profileCode === "profile_galtel") ? variantFor("profile") : null;
  const plasticLine = (): LineItem | null => {
    if (!profileVariant) return makeLineItem("profile_plastic", baseProfileLen, prices);
    if (baseProfileLen <= 0) return null;
    return { ...variantLine(profileVariant, "profile", baseProfileLen, "profile_plastic"), ...(profileVariant.installerPrice != null && { installerRate: profileVariant.installerPrice }) };
  };
  if (byWalls) {
    for (const l of byWalls.lines) {
      const own = l.variantId ? ownItemsById?.[l.variantId] : undefined;
      items.push({
        itemCode: l.code ?? own?.code ?? "profile_plastic",
        itemName: l.name,
        quantity: l.qty,
        unit: l.unit,
        unitPrice: l.price,
        total: Math.round(l.price * l.qty),
        ...(l.variantId && { variantId: l.variantId }),
        ...(l.photoUrl && { photoUrl: l.photoUrl }),
        // Монтаж — строкой как у мобилки: у каждого багета своя (алюминий, теневой, подшторник…).
        installCode: l.code === "insert" || l.code === "led_strip" ? undefined : "install_profile",
        installerName: l.installName,
        installerRate: l.installPrice,
      });
    }
  } else if (profileCode === "profile_galtel") {
    // Plastic profile only (galtel installed by others)
    const plasticItem = plasticLine();
    if (plasticItem) items.push(plasticItem);
  } else if (profileCode === "profile_insert") {
    // Plastic profile + insert strip (2 line items)
    const plasticItem = plasticLine();
    if (plasticItem) items.push(plasticItem);
    // Скрытая в прайсе вставка не попадает в КП; свой профиль «без вставки» её снимает (как в приложении).
    const insertItem = room.withInsert === false || hiddenInPrice("insert") || profileVariant?.noInsert === true
      ? null : makeLineItem("insert", baseProfileLen, prices);
    // Монтаж вставки — только явная цена работы в прайсе, иначе 0 (как workOnly в приложении).
    if (insertItem) items.push({
      ...insertItem,
      ...(room.insertColor === "black" && { itemName: `${insertItem.itemName} (чёрная)` }),
      installerName: "Монтаж вставки",
      installerRate: ownItemsById?.[`catalog:insert`]?.installerPrice ?? 0,
    });
  } else {
    // Shadow or floating — single aluminum profile.
    // Если у комнаты явно указан profile_floating, по периметру весь парящий.
    const profileItem = makeLineItem(profileCode, roundTenth(profilePerimeter), prices);
    if (profileItem) items.push(profileItem);
  }

  // Отдельная позиция «Парящий профиль» — только если он не основной
  // (для basic-профилей плacтик/вставка/галтель/теневой).
  if (
    !byWalls &&
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
  // Типы софитов (28.10.2026): строка на каждый тип, как в мобилке. Свой софит —
  // позиция прайса по id (ownItemsById); удалённый из прайса считается как GX53.
  for (const g of room.spotsByType ?? []) {
    if (g.count <= 0) continue;
    if (g.variantId) {
      const info = ownItemsById?.[g.variantId];
      if (info) {
        items.push({
          itemCode: info.code,
          itemName: info.name,
          quantity: g.count,
          unit: info.unit || "шт.",
          unitPrice: info.price,
          total: Math.round(info.price * g.count),
          variantId: g.variantId,
          photoUrl: info.photoUrl ?? undefined,
          installCode: "install_spot",
        });
        continue;
      }
    }
    const it = makeLineItem(g.code && PRODUCT_BY_CODE[g.code] ? g.code : "spot_ours", g.count, prices);
    if (it) items.push(it);
  }
  const spotPairs = room.spotPairsCount ?? 0;
  if (spotPairs > 0) {
    // Цена пары — позиция spot_pair_ours, как в приложении (код spot_pair давал 0 ₸).
    const variant = variantFor("spot_pair");
    const unitPrice = getPrice(prices, "spot_pair_ours");
    items.push({ ...(variant
      ? variantLine(variant, "spot_pair", spotPairs, "spot_pair_ours")
      : {
          itemCode: "spot_pair_ours",
          itemName: "Двойные софиты",
          quantity: spotPairs,
          unit: "пара",
          unitPrice,
          total: Math.round(unitPrice * spotPairs),
        }), installerRate: getPrice(prices, "install_spot") * 2 });
  }
  // Клиентские пары (12.11.2026): клиент даёт пару — своя строка spot_pair_client,
  // как в приложении (estimate.tsx). Монтажнику — как за «нашу» пару.
  const spotPairsClient = room.spotPairsClientCount ?? 0;
  if (spotPairsClient > 0) {
    const it = makeLineItem("spot_pair_client", spotPairsClient, prices);
    // Название — как у мастера в прайсе (приложение берёт его же).
    const masterName = ownItemsById?.["catalog:spot_pair_client"]?.name;
    if (it) items.push({ ...it, ...(masterName && { itemName: masterName }), installerRate: getPrice(prices, "install_spot") * 2 });
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
    // Клиентские бра — только закладная; нет поля — с установкой все (старые КП).
    const pendantInstallItem = makeLineItem("pendant_install", Math.min(pendantCount, room.pendantInstallCount ?? pendantCount), prices);
    if (pendantInstallItem) items.push(pendantInstallItem);
  }

  // Вытяжки (вентиляционные выходы)
  const ventCount = room.ventCount ?? 0;
  if (ventCount > 0) {
    const ventItem = makeLineItem("vent", ventCount, prices);
    if (ventItem) items.push(ventItem);
  }

  // Track magnetic
  // Трек с типом на элементе. Свой вариант удалён из прайса — считаем как трек без типа.
  let trackLegacyM = room.trackMagneticLength;
  for (const tr of room.tracksByType ?? []) {
    const t = { ...tr, length: roundTenth(tr.length) };
    if (t.length <= 0) continue;
    if (t.variantId) {
      const info = ownItemsById?.[t.variantId];
      if (!info) {
        if (ownItemsById) missingVariants.push("track");
        trackLegacyM += t.length;
        continue;
      }
      items.push(variantLine({ ...info, id: t.variantId }, "track", t.length, "track_magnetic"));
      continue;
    }
    const typed = makeLineItem(t.code && PRODUCT_BY_CODE[t.code] ? t.code : "track_magnetic", t.length, prices);
    if (typed) items.push(typed);
  }
  trackLegacyM = roundTenth(trackLegacyM);
  if (trackLegacyM > 0) {
    const variant = variantFor("track");
    const trackItem = variant
      ? variantLine(variant, "track", trackLegacyM, "track_magnetic")
      : makeLineItem("track_magnetic", trackLegacyM, prices);
    if (trackItem) items.push(trackItem);
  }
  const installOnly = (code: string, name: string, quantity: number): LineItem => {
    const unitPrice = getPrice(prices, code);
    return { itemCode: code, itemName: name, quantity, unit: "м.п.", unitPrice, total: Math.round(unitPrice * quantity), installCode: code };
  };
  const trackClientM = roundTenth(room.trackClientLength ?? 0);
  const lightLineClientM = roundTenth(room.lightLineClientLength ?? 0);
  if (trackClientM > 0) items.push(installOnly("install_track", "Установка клиентского трека", trackClientM));
  if (lightLineClientM > 0) items.push(installOnly("install_lightline", "Установка клиентской линии", lightLineClientM));

  // Light line
  const lightLineM = roundTenth(room.lightLineLength ?? 0);
  if (lightLineM > 0) {
    const variant = variantFor("lightline");
    const lightItem = variant
      ? variantLine(variant, "lightline", lightLineM, "light_line")
      : makeLineItem("light_line", lightLineM, prices);
    if (lightItem) items.push(lightItem);
  }

  // Corners — в КП попадают только ДОПОЛНИТЕЛЬНЫЕ углы (сверх стандартных 4).
  // Прямоугольная комната = 4 угла = 0 в КП (входит в базовый периметр).
  // Г/П/нестандартная = больше 4 → разница = доп. углы по цене из каталога.
  // Цена зависит от профиля: вставка/галтель → corner_plastic (1000 ₸),
  // парящий/теневой → corner_aluminum (5000 ₸).
  const cornersTotal = room.cornersCount > 0 ? room.cornersCount : 4;
  const extraCorners = Math.max(0, cornersTotal - 4);
  if (extraCorners > 0) {
    // По стенам: алюминиевые, если есть теневая/бесщелевая/парящая/алюминиевая стена; скрытый угол — не в КП, как в приложении.
    const cornerCode = byWalls ? (byWalls.aluminumCorners ? "corner_aluminum" : "corner_plastic") : PROFILE_CORNER_MAP[profileCode] || "corner_plastic";
    const cornerItem = hiddenInPrice(cornerCode) ? null : makeLineItem(cornerCode, extraCorners, prices);
    if (cornerItem) items.push(cornerItem);
  }

  // Curtain rod — master's choice or default
  if (room.curtainRodLength > 0) {
    const curtainCode = room.curtainType || "curtain_ldsp";
    const curtainItem = makeLineItem(curtainCode, roundTenth(room.curtainRodLength), prices);
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
  const gardinaLightM = roundTenth(room.gardinaLightLength ?? 0);
  const gardinaM = roundTenth(room.gardinaLength ?? 0);
  const gardinaSingleM = roundTenth(room.gardinaSingleLength ?? 0);
  const gardinaVariant = gardinaM > 0 || gardinaLightM > 0 ? variantFor("gardina") : null;
  if (gardinaSingleM > 0) {
    const singleItem = makeLineItem("gardina_single", gardinaSingleM, prices);
    if (singleItem) items.push(singleItem);
  }
  if (gardinaLightM > 0) {
    // Подсветка — строка прайса «Подсветка гардины» (gardina_led, 10.11.2026), а не
    // константа: мастер ставит свою цену, 0 — без надбавки; скрыта — тоже без надбавки.
    const ledPrice = ownItemsById?.["catalog:gardina_led"]?.isHidden ? 0 : getPrice(prices, "gardina_led");
    const unitPrice = (gardinaVariant?.price ?? getPrice(prices, "gardina_plastic")) + ledPrice;
    items.push({
      itemCode: gardinaVariant ? `${gardinaVariant.code}:led` : "gardina_led",
      itemName: `${gardinaVariant?.name ?? "Гардина"} с подсветкой`,
      quantity: gardinaLightM,
      unit: "м.п.",
      unitPrice,
      total: Math.round(unitPrice * gardinaLightM),
      installCode: "install_gardina",
    });
  }
  if (gardinaM > 0) {
    const gardinaCode = room.gardinaType || "gardina_plastic";
    const gardinaItem = gardinaVariant
      ? variantLine(gardinaVariant, "gardina", gardinaM, gardinaCode)
      : makeLineItem(gardinaCode, gardinaM, prices);
    if (gardinaItem) items.push(gardinaItem);
  }

  // Podshtornik
  const podshtornikM = roundTenth(room.podshtornikLength ?? 0);
  if (podshtornikM > 0) {
    const podshtornikCode = room.podshtornikType || "podshtornik_aluminum";
    const podshtornikItem = makeLineItem(podshtornikCode, podshtornikM, prices);
    // Монтаж подшторника — по ставке карниза, как в приложении.
    if (podshtornikItem) items.push({ ...podshtornikItem, installCode: "install_curtain", installerName: "Монтаж подшторника", installerRate: getPrice(prices, "install_curtain") });
  }

  // Скруглённые углы — отдельная позиция (сложнее в монтаже).
  // Площадь и периметр уже скорректированы выше; здесь только надбавка за каждый скруглённый угол.
  if ((room.roundedCornersCount ?? 0) > 0) {
    const roundedItem = hiddenInPrice("corner_rounded") ? null : makeLineItem("corner_rounded", room.roundedCornersCount ?? 0, prices);
    // Работа по скруглению — своя цена работы позиции, иначе 30 % от цены клиенту (как в приложении).
    if (roundedItem) items.push({
      ...roundedItem,
      installerName: "Скруглённый угол (работа)",
      installerRate: ownItemsById?.[`catalog:corner_rounded`]?.installerPrice ?? Math.round(roundedItem.unitPrice * 0.3),
    });
  }

  // Обвод мебели до потолка (м.п.) — отдельная позиция, чтобы было видно почему дороже.
  // Backwards compat: если есть только furnitureCeilingCorners (старые расчёты), считаем как количество м.п.
  const bypassM = roundTenth(room.furnitureCeilingBypassM ?? room.furnitureCeilingCorners ?? 0);
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

  for (const item of items) {
    if (item.installerRate !== undefined) continue;
    const rate = spotInstallRate(item, ownItemsById);
    if (rate !== undefined) item.installerRate = rate;
  }

  return {
    roomId: room.id,
    roomName: room.name,
    area,
    perimeter,
    items,
    subtotal,
    heightMultiplied,
    subtotalAfterHeight,
    ...(missingVariants.length > 0 && { missingVariants }),
    ...(filmWidest && { filmWidest }),
  };
}

export function calculate(
  rooms: RoomInput[],
  rawPrices: PriceMap,
  customItemsMap?: Record<string, CustomItemInfo>,
  extraItems?: ExtraItem[],
  /** Свои позиции прайса по id — для софитов с типом «свой вариант» (28.10.2026). */
  ownItemsById?: Record<string, CustomItemInfo>,
  /** Валюта мастера: дефолты каталога для позиций, которых нет в `prices` (10.11.2026). */
  currency?: string | null
): CalculationResult {
  const prices = priceBook(rawPrices, currency);
  // Итог площади и периметра — до 0,1, как в приложении.
  const totalArea = roundTenth(rooms.reduce((sum, r) => sum + computeArea(r), 0));
  const totalPerimeter = roundTenth(rooms.reduce(
    (sum, r) => sum + computePerimeter(r),
    0
  ));
  const totalSpots = rooms.reduce((sum, r) => sum + r.spotsCount, 0);
  const totalChandeliers = rooms.reduce(
    (sum, r) => sum + r.chandelierCount,
    0
  );

  const roomResults = rooms.map((room) => calculateRoom(room, prices, customItemsMap, ownItemsById));

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
