"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Scene3DBoundary } from "@/components/room-3d/Scene3DBoundary";
import type { RoomElement, Vertex2D } from "@/lib/room-types";

const Scene3D = dynamic(
  () => import("@/components/room-3d/Scene3D").then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-50 to-slate-100">
        <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
      </div>
    ),
  },
);

interface Props {
  publicId: string;
  brandColor: string;
  vertices: Vertex2D[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
}

export function Public3DViewer({ publicId, brandColor, vertices, walls, ceilingHeight, elements }: Props) {
  return (
    <div className="fixed inset-0 bg-slate-50">
      <Scene3DBoundary>
        <Scene3D
          vertices={vertices}
          walls={walls}
          ceilingHeight={ceilingHeight}
          elements={elements}
          readOnly
        />
      </Scene3DBoundary>

      <Link
        href={`/kp/${publicId}`}
        prefetch={false}
        className="absolute top-2 right-2 z-20 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95"
        style={{ backgroundColor: brandColor }}
      >
        <span aria-hidden="true">←</span>
        <span>К КП</span>
      </Link>
    </div>
  );
}
