/**
 * Перевод данных дизайнера комнаты (walls + elements) в RoomInput
 * для расчёта КП. Используется в:
 *   - /dashboard/vision-test (сохранение замера)
 *   - /api/estimates/[id]/recalc-room (правка чертежа из КП)
 */

import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";
import { furnitureCeilingStats } from "@/lib/furniture-ceiling";
// Только серверно-безопасные модули: room-designer.tsx — "use client", и в
// Next 16 его функции с сервера звать нельзя (500 в recalc-room, 27.10.2026).
import { getVertices } from "@/lib/room-geometry";
import { polygonMinThickness } from "@/lib/canvas-pricing";
import { calcRoomLevel2, type Level2ElementLike } from "@/lib/level2-geometry";
import { spotTypeKey, parseSpotTypeKey } from "@/lib/spot-types";
import { computeSubcurtainStats } from "@/lib/subcurtain-stats";
import { legacyInsertFlag, type WallProfileElement } from "@/lib/wall-profile-pricing";

interface DesignerRoom {
  id?: string;
  name?: string;
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  cornerRadii?: number[];
  area: number;
  perimeter: number;
  elements: DesignerElement[];
  previewUrl3d?: string;
  variantOverrides?: Record<string, string>;
}

interface DesignerElement {
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  length?: number;
  variant?: "ours" | "client";
  ceilingMode?: "decor" | "to-ceiling" | "planned";
  /** Софит: тип (28.10.2026) — стандартный код или свой вариант из прайса. */
  spotType?: string;
  priceVariantId?: string;
  groupId?: string;
  rows?: number;
  withLight?: boolean;
  trackType?: string;
}

/**
 * Площадь и периметр с чертежа для комнат, которые нельзя посчитать как длина × ширина.
 * У обычного прямоугольника полей нет: его расчёт не меняется.
 */
export function measuredGeometry(room: {
  walls: number[]; normalCorners?: boolean[]; angles?: number[]; area: number; perimeter: number;
  arcBulges?: number[]; columns?: unknown[]; cornerRadii?: number[]; cutouts?: unknown[];
}): { measuredArea?: number; measuredPerimeter?: number; measuredMinWidth?: number } {
  const rectangle = room.walls.length === 4 && (room.angles ?? []).every((a) => Math.abs(a) === 90);
  const plain = rectangle
    && !room.arcBulges?.some((b) => b)
    && !room.cornerRadii?.some((r) => r > 0)
    && !room.columns?.length
    && !room.cutouts?.length;
  if (plain) return {};
  return { measuredArea: room.area, measuredPerimeter: room.perimeter, ...minWidthFromWalls(room.walls, room.normalCorners, room.angles) };
}

/** Наименьшая ширина по стенам и углам, как считает приложение. Битая геометрия — без поля. */
function minWidthFromWalls(walls: number[], normalCorners?: boolean[], angles?: number[]): { measuredMinWidth?: number } {
  try {
    // Старые замеры без углов: поворот берём из normalCorners, как при нормализации в приложении.
    const thickness = polygonMinThickness(getVertices(walls, normalCorners ?? walls.map(() => true), angles?.length ? angles : undefined));
    return Number.isFinite(thickness) ? { measuredMinWidth: thickness / 100 } : {};
  } catch {
    return {};
  }
}

/** Профили по стенам для RoomInput: только если в замере они есть. */
export function wallProfileFields(room: { walls: number[]; perimeter: number; wallProfiles?: Record<string, string> | null; elements?: unknown[] }): Pick<RoomInput, "wallProfileData"> {
  if (!room.wallProfiles || Object.keys(room.wallProfiles).length === 0) return {};
  const elements = ((room.elements ?? []) as WallProfileElement[])
    .filter((e) => e.type === "subcurtain" || e.type === "floating")
    .map((e) => ({ type: e.type, wallIndex: e.wallIndex, length: e.length, shape: e.shape, depth: e.depth }));
  return { wallProfileData: { walls: room.walls, wallProfiles: room.wallProfiles, elements, perimeterM: room.perimeter } };
}

/** «2 уровня» с чертежа, как считает приложение. Вершины без замыкающего дубля. */
/** Вставка в комнате: решение комнаты, иначе настройка объекта («убрать везде»), иначе да.
 *  Как roomInsertEnabled в приложении (src/lib/wall-profiles.ts). */
export function roomInsertEnabled(room: { withInsert?: boolean | null }, noInsertAll: boolean): boolean {
  return room.withInsert ?? !noInsertAll;
}

/** Поля вставки для RoomInput: без вставки — withInsert: false, чёрная — insertColor.
 *  Старые замеры хранили «со вставкой / без» в типах стен: как migrateRoomInsert приложения,
 *  нерешённая комната берёт решение из этих меток. */
export function insertFields(room: { withInsert?: boolean | null; insertColor?: string | null; wallProfiles?: Record<string, string> | null; walls?: number[] }, noInsertAll: boolean): Pick<RoomInput, "withInsert" | "insertColor"> {
  const withInsert = room.withInsert ?? legacyInsertFlag(room.wallProfiles, room.walls?.length);
  return {
    ...(!roomInsertEnabled({ withInsert }, noInsertAll) && { withInsert: false }),
    ...(room.insertColor === "black" && { insertColor: "black" as const }),
  };
}

export function level2Fields(room: { walls: number[]; normalCorners?: boolean[]; angles?: number[]; elements?: unknown[] }): { level2?: RoomInput["level2"] } {
  if (!room.elements?.some((e) => (e as { type?: string }).type === "level2")) return {};
  const vertices = getVertices(room.walls, room.normalCorners ?? room.walls.map(() => true), room.angles?.length ? room.angles : undefined);
  const result = calcRoomLevel2(room.elements as Level2ElementLike[], vertices.slice(0, room.walls.length));
  return result ? { level2: { canvasCutM2: result.canvasCutM2, upperM2: result.upperM2, bortM: result.bortM, ledM: result.ledM } } : {};
}

/**
 * Пара софитов (группа ровно из двух) идёт одной строкой. Всё остальное, в том числе
 * группа из трёх и остаток пары, — одиночные софиты, как считает приложение.
 */
export function splitSpotGroups<T extends { groupId?: string }>(allSpots: T[]): { spotPairsCount: number; singleSpots: T[] } {
  const sizes = new Map<string, number>();
  for (const s of allSpots) if (s.groupId) sizes.set(s.groupId, (sizes.get(s.groupId) ?? 0) + 1);
  const singleSpots = allSpots.filter((s) => !s.groupId || sizes.get(s.groupId) !== 2);
  const spotPairsCount = [...sizes.values()].filter((n) => n === 2).length;
  return { spotPairsCount, singleSpots };
}

/** Длины гардины по строкам КП: обычная, однорядная (rows = 1), с подсветкой. В метрах. */
export function gardinaFields(els: DesignerElement[]) {
  const m = (list: DesignerElement[]) => Math.round(list.reduce((s, e) => s + (e.length || 0), 0)) / 100;
  const all = els.filter((e) => e.type === "curtain");
  const single = all.filter((e) => e.rows === 1);
  const rest = all.filter((e) => e.rows !== 1);
  return {
    gardinaLength: m(rest.filter((e) => !e.withLight)),
    gardinaSingleLength: m(single),
    gardinaLightLength: m(rest.filter((e) => e.withLight)),
  };
}

/** Длины трека и линии по строкам КП, в метрах. Клиентские — отдельно, только установка. */
export function trackFields(els: DesignerElement[]) {
  const m = (list: DesignerElement[]) => Math.round(list.reduce((s, e) => s + (e.length || 0), 0)) / 100;
  const tracks = els.filter((e) => e.type === "track");
  const ours = tracks.filter((e) => e.variant !== "client");
  const typed = new Map<string, { code?: string; variantId?: string; list: DesignerElement[] }>();
  for (const e of ours) {
    if (!e.priceVariantId && !e.trackType) continue;
    const key = e.priceVariantId ? `v:${e.priceVariantId}` : `t:${e.trackType}`;
    const g = typed.get(key) ?? { code: e.priceVariantId ? undefined : e.trackType, variantId: e.priceVariantId, list: [] };
    g.list.push(e);
    typed.set(key, g);
  }
  const lines = els.filter((e) => e.type === "lightline");
  const tracksByType = [...typed.values()].map((g) => ({ code: g.code, variantId: g.variantId, length: m(g.list) }));
  return {
    trackMagneticLength: m(ours.filter((e) => !e.priceVariantId && !e.trackType)),
    lightLineLength: m(lines.filter((e) => e.variant !== "client")),
    ...(tracksByType.length > 0 && { tracksByType }),
    trackClientLength: m(tracks.filter((e) => e.variant === "client")),
    lightLineClientLength: m(lines.filter((e) => e.variant === "client")),
  };
}

/**
 * Одиночные софиты по строкам КП. «Наши» с типом на элементе (spotType / priceVariantId)
 * идут отдельными строками по типу; без типа — как раньше, через spotsCount/spotType.
 */
export function spotBreakdown(singleSpots: DesignerElement[], existingSpotType?: string) {
  const typedGroups = new Map<string, { code?: string; variantId?: string; count: number }>();
  let spotsOurs = 0;
  for (const e of singleSpots) {
    if (e.variant === "client") continue;
    const key = spotTypeKey(e);
    if (!key) { spotsOurs++; continue; }
    const ref = parseSpotTypeKey(key)!;
    const g = typedGroups.get(key) ?? (ref.kind === "code" ? { code: ref.code, count: 0 } : { variantId: ref.variantId, count: 0 });
    g.count++;
    typedGroups.set(key, g);
  }
  const spotsClient = singleSpots.filter((e) => e.variant === "client").length;
  const legacySpotType: string | undefined =
    existingSpotType ??
    (spotsClient > 0 && spotsOurs === 0 ? "spot_client" : spotsOurs > 0 ? "spot_ours" : undefined);
  // Типизированные GX53 сливаем со старой строкой, если она и так GX53 — иначе две одинаковые строки.
  const gx = typedGroups.get("t:spot_ours");
  if (gx && (legacySpotType === "spot_ours" || legacySpotType === undefined)) {
    spotsOurs += gx.count;
    typedGroups.delete("t:spot_ours");
  }
  // Смешанные: клиентские идут своей строкой, как в приложении. Иначе ушли бы по цене наших.
  const mixed = spotsOurs > 0 && spotsClient > 0 && legacySpotType !== "spot_client";
  return {
    spotsOurs,
    spotsClient,
    spotsCount: mixed ? spotsOurs : spotsOurs + spotsClient,
    legacySpotType,
    spotsByType: [...typedGroups.values(), ...(mixed ? [{ code: "spot_client", count: spotsClient }] : [])],
  };
}

/**
 * Построить RoomInput из чертежа. Поля выбора (canvasType и т.п.) подставляются
 * либо из existing (если правка), либо дефолтные.
 */
export function buildRoomInputFromDesigner(
  room: DesignerRoom,
  existing?: Partial<RoomInput>
): RoomInput {
  const els = room.elements || [];
  // Группируем спoты: одиночные (без groupId) идут как обычные «штуки»,
  // двойные/тройные (с groupId) — как пары/тройки в КП.
  const allSpots = els.filter((e) => e.type === "spot");
  const { spotPairsCount, singleSpots } = splitSpotGroups(allSpots);
  const { spotsOurs, spotsClient, spotsCount, legacySpotType, spotsByType } = spotBreakdown(singleSpots, existing?.spotType);
  const chandelierCount = els.filter((e) => e.type === "chandelier").length;
  const pendantCount = els.filter((e) => e.type === "pendant").length;
  const ventCount = els.filter((e) => e.type === "vent").length;
  const lightAndTrack = trackFields(els);
  const gardina = gardinaFields(els);
  const verticesForRoom = getVertices(room.walls, room.normalCorners, room.angles);
  const subStats = computeSubcurtainStats(els, verticesForRoom, room.walls.length, room.walls);
  const podshtornikLength = Math.round(subStats.totalLengthCm) / 100;
  const podshtornikOnWallLength = Math.round(subStats.onWallLengthCm) / 100;
  // Углы стен, скрытые подшторником «через выступы», не считаются в КП.
  const visibleCornersCount = Math.max(0, room.walls.length - subStats.coveredCorners);
  const roundedCornersCount = (room.cornerRadii || []).filter((r) => r > 0)
    .length;

  const fcStats = furnitureCeilingStats(
    els as Parameters<typeof furnitureCeilingStats>[0],
    verticesForRoom
  );
  const furnitureCeilingArea =
    Math.round(fcStats.areaToSubtractCm2 / 100) / 100;
  const furnitureCeilingPerimeterDelta =
    Math.round(fcStats.perimeterDeltaCm) / 100;
  const furnitureCeilingBypassM =
    Math.round(fcStats.bypassPerimeterCm) / 100;

  const hasFloating = els.some((e) => e.type === "floating");
  const profileTypeForRoom: string | undefined = hasFloating
    ? "profile_floating"
    : existing?.profileType;

  // Реальные размеры комнаты — bounding box по вершинам полигона.
  // Это критично для выбора ширины полотна (320см / 550см / больше) —
  // иначе sqrt(area) завышает «короткую сторону».
  const xs = verticesForRoom.map((v) => v.x);
  const ys = verticesForRoom.map((v) => v.y);
  const bboxW = (Math.max(...xs) - Math.min(...xs)) / 100;
  const bboxH = (Math.max(...ys) - Math.min(...ys)) / 100;
  const length = Math.max(bboxW, bboxH) || 5;
  const width = Math.min(bboxW, bboxH) || 4;

  return {
    id: existing?.id ?? room.id ?? crypto.randomUUID(),
    name: existing?.name ?? room.name ?? "Помещение",
    length: Math.round(length * 100) / 100,
    width: Math.round(width * 100) / 100,
    ceilingHeight: existing?.ceilingHeight ?? 2.7,
    canvasType: (existing?.canvasType ?? "matte") as CanvasType,
    profileType: profileTypeForRoom,
    // Решение по вставке не на чертеже: правка комнаты в КП его сохраняет.
    ...(existing?.withInsert === false && { withInsert: false }),
    // Профили по стенам не на веб-чертеже: держим из сохранённой комнаты, пока число стен то же.
    ...(existing?.wallProfileData && existing.wallProfileData.walls.length === room.walls.length
      && wallProfileFields({ walls: room.walls, perimeter: room.perimeter, wallProfiles: existing.wallProfileData.wallProfiles, elements: room.elements })),
    ...(existing?.insertColor === "black" && { insertColor: "black" as const }),
    spotsCount,
    spotType: spotsCount > 0 ? (legacySpotType ?? (spotsClient > 0 && spotsOurs === 0 ? "spot_client" : "spot_ours")) : legacySpotType,
    spotsByType: spotsByType.length > 0 ? spotsByType : undefined,
    chandelierCount,
    chandelierInstallCount:
      existing?.chandelierInstallCount ?? chandelierCount,
    pendantCount,
    ventCount,
    spotPairsCount,
    spotTriplesCount: 0,
    ...lightAndTrack,
    curtainRodLength: existing?.curtainRodLength ?? 0,
    pipeBypasses: existing?.pipeBypasses ?? 0,
    cornersCount: visibleCornersCount,
    eurobrusCount: existing?.eurobrusCount ?? 0,
    ...gardina,
    gardinaType: existing?.gardinaType,
    podshtornikLength,
    podshtornikOnWallLength,
    podshtornikType: existing?.podshtornikType,
    roundedCornersCount,
    furnitureCeilingArea,
    furnitureCeilingPerimeterDelta,
    furnitureCeilingBypassM,
    furnitureCeilingCorners: fcStats.extraCorners,
    furniturePlannedCorners: fcStats.plannedCorners,
    furniturePlannedArea: Math.round(fcStats.plannedAreaCm2 / 100) / 100,
    transformerCount: existing?.transformerCount,
    customItems: existing?.customItems,
    oneOffItems: existing?.oneOffItems,
    shape:
      room.walls.length === 4 ? ("rectangle" as const) : existing?.shape,
    previewUrl3d: room.previewUrl3d ?? existing?.previewUrl3d,
    variantOverrides: room.variantOverrides ?? existing?.variantOverrides,
    ...level2Fields(room),
    ...measuredGeometry({ ...room, arcBulges: existing?.designerData?.arcBulges, columns: existing?.designerData?.columns }),
    designerData: {
      walls: room.walls,
      angles: room.angles ?? [],
      normalCorners: room.normalCorners,
      area: room.area,
      perimeter: room.perimeter,
      elements: room.elements as unknown[],
      arcBulges: existing?.designerData?.arcBulges,
      columns: existing?.designerData?.columns,
    },
  };
}
