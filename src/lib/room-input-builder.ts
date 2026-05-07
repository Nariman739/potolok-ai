/**
 * Перевод данных дизайнера комнаты (walls + elements) в RoomInput
 * для расчёта КП. Используется в:
 *   - /dashboard/vision-test (сохранение замера)
 *   - /api/estimates/[id]/recalc-room (правка чертежа из КП)
 */

import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";
import { furnitureCeilingStats } from "@/lib/furniture-ceiling";
import {
  getVertices,
  computeSubcurtainStats,
} from "@/app/(dashboard)/dashboard/vision-test/room-designer";

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
  const spotsOurs = els.filter(
    (e) => e.type === "spot" && e.variant !== "client"
  ).length;
  const spotsClient = els.filter(
    (e) => e.type === "spot" && e.variant === "client"
  ).length;
  const spotsCount = spotsOurs + spotsClient;
  const chandelierCount = els.filter((e) => e.type === "chandelier").length;
  const pendantCount = els.filter((e) => e.type === "pendant").length;
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
  const subStats = computeSubcurtainStats(els, verticesForRoom, room.walls.length);
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
    spotType:
      existing?.spotType ??
      (spotsClient > 0 && spotsOurs === 0
        ? "spot_client"
        : spotsOurs > 0
          ? "spot_ours"
          : undefined),
    chandelierCount,
    chandelierInstallCount:
      existing?.chandelierInstallCount ?? chandelierCount,
    pendantCount,
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
