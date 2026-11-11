"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Scene3DBoundary } from "@/components/room-3d/Scene3DBoundary";
import type { RoomElement, Vertex2D } from "@/lib/room-types";
import type { WallFurnitureEntry } from "@/lib/wall-furniture";

const Scene3D = dynamic(
  () => import("@/components/room-3d/Scene3D").then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-[#e4e6e8]">
        <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
      </div>
    ),
  },
);

interface Props {
  brandColor: string;
  vertices: Vertex2D[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  /** Профили стен, вставка, фасад шкафа — как в снапшоте 3D приложения (паритет, 11.11.2026). */
  wallProfiles?: Record<number, string>;
  withInsert?: boolean;
  insertColor?: "black" | "white";
  wallFurniture?: WallFurnitureEntry[];
  /** Подпись «3D · в разработке» на языке мастера. */
  betaLabel?: string;
  fallbackImageUrl?: string | null;
  /** Ссылка «назад» (напр. к КП). null → кнопку не показываем. */
  backHref?: string | null;
  backLabel?: string;
}

export function Public3DViewer({
  brandColor,
  vertices,
  walls,
  ceilingHeight,
  elements,
  wallProfiles,
  withInsert,
  insertColor,
  wallFurniture,
  betaLabel,
  fallbackImageUrl,
  backHref = null,
  backLabel = "Назад",
}: Props) {
  return (
    <div className="fixed inset-0 bg-[#e4e6e8]">
      <Scene3DBoundary fallbackImageUrl={fallbackImageUrl}>
        <Scene3D
          vertices={vertices}
          walls={walls}
          ceilingHeight={ceilingHeight}
          elements={elements}
          wallProfiles={wallProfiles}
          withInsert={withInsert}
          insertColor={insertColor}
          wallFurniture={wallFurniture}
          betaLabel={betaLabel}
          readOnly
        />
      </Scene3DBoundary>

      {backHref && (
        <Link
          href={backHref}
          prefetch={false}
          className="absolute top-2 right-2 z-20 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95"
          style={{ backgroundColor: brandColor }}
        >
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </Link>
      )}
    </div>
  );
}
