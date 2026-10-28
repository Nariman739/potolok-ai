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
import { spotTypeKey, parseSpotTypeKey } from "@/lib/spot-types";
import { computeSubcurtainStats } from "@/lib/subcurtain-stats";

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
  const groupSizeMap = new Map<string, number>();
  for (const s of allSpots) {
    const gid = (s as { groupId?: string }).groupId;
    if (!gid) continue;
    groupSizeMap.set(gid, (groupSizeMap.get(gid) ?? 0) + 1);
  }
  let spotPairsCount = 0;
  let spotTriplesCount = 0;
  for (const size of groupSizeMap.values()) {
    if (size === 2) spotPairsCount++;
    else if (size >= 3) spotTriplesCount++;
  }
  const singleSpots = allSpots.filter((s) => !(s as { groupId?: string }).groupId);
  // Типы софитов (28.10.2026): «наши» с типом на элементе (spotType / priceVariantId)
  // идут отдельными строками по типу; без типа — как раньше, через spotsCount/spotType.
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
    existing?.spotType ??
    (spotsClient > 0 && spotsOurs === 0 ? "spot_client" : spotsOurs > 0 ? "spot_ours" : undefined);
  // Типизированные GX53 сливаем со старой строкой, если она и так GX53 — иначе две одинаковые строки.
  const gx = typedGroups.get("t:spot_ours");
  if (gx && (legacySpotType === "spot_ours" || legacySpotType === undefined)) {
    spotsOurs += gx.count;
    typedGroups.delete("t:spot_ours");
  }
  const spotsCount = spotsOurs + spotsClient;
  const spotsByType = [...typedGroups.values()];
  const chandelierCount = els.filter((e) => e.type === "chandelier").length;
  const pendantCount = els.filter((e) => e.type === "pendant").length;
  const ventCount = els.filter((e) => e.type === "vent").length;
  const trackMagneticLength =
    Math.round(
      els
        .filter((e) => e.type === "track")
        .reduce((s, e) => s + (e.length || 0), 0)
    ) / 100;
  const lightLineLength =
    Math.round(
      els
        .filter((e) => e.type === "lightline")
        .reduce((s, e) => s + (e.length || 0), 0)
    ) / 100;
  const gardinaLength =
    Math.round(
      els
        .filter((e) => e.type === "curtain")
        .reduce((s, e) => s + (e.length || 0), 0)
    ) / 100;
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
    spotsCount,
    spotType: spotsCount > 0 ? (legacySpotType ?? (spotsClient > 0 && spotsOurs === 0 ? "spot_client" : "spot_ours")) : legacySpotType,
    spotsByType: spotsByType.length > 0 ? spotsByType : undefined,
    chandelierCount,
    chandelierInstallCount:
      existing?.chandelierInstallCount ?? chandelierCount,
    pendantCount,
    ventCount,
    spotPairsCount,
    spotTriplesCount,
    trackMagneticLength,
    lightLineLength,
    curtainRodLength: existing?.curtainRodLength ?? 0,
    pipeBypasses: existing?.pipeBypasses ?? 0,
    cornersCount: visibleCornersCount,
    eurobrusCount: existing?.eurobrusCount ?? 0,
    gardinaLength,
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
