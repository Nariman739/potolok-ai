"use client";

// DEV-ONLY конвейер покадровой отладки AI-визуализации.
// Открываем /vision-capture?preset=floating&ms=2500 → рендерит фикс-комнату
// с ОДНИМ элементом, авто-снимает beauty+mask из 3D и шлёт в /api/vision-capture-dev
// (пишет в /tmp). Дальше локальный скрипт гоняет nano+заморозку по каждому пресету.
// Так каждый элемент (парящий/споты/трек/светолиния/шторы) отлаживаем отдельно.

import { Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { getVertices } from "@/lib/room-geometry";
import type { RoomElement } from "@/lib/room-types";

const Scene3D = dynamic(() => import("@/components/room-3d/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
});

// Размер комнаты выбирается параметром ?room= (для проверки адаптивной камеры M2 на
// маленькой/большой комнате). W×D см, потолок 280.
const ROOM_SIZES: Record<string, [number, number]> = {
  default: [400, 300],
  small: [240, 220],
  large: [700, 480],
};
const NORMAL_CORNERS = [true, true, true, true];
const CEILING_H = 280;

// Базовая обстановка (окно/дверь/мебель) масштабируется под размер комнаты W×D —
// мебель = болванки, AI заменяет на настоящую; стены дают привязку (иначе пересвет).
function baseRoom(W: number, D: number): RoomElement[] {
  return [
    { id: "base-window", type: "window", wallIndex: 0, wallPosition: 0.5, length: Math.min(160, W * 0.5) },
    { id: "base-door", type: "door", wallIndex: 3, wallPosition: 0.5, length: 80 },
    { id: "base-sofa", type: "furniture", furnitureType: "sofa", x: W * 0.5, y: D - 45, width: Math.min(210, W * 0.55), height: 90, rotation: 0 },
    { id: "base-table", type: "furniture", furnitureType: "table", x: W * 0.5, y: D * 0.55, width: 120, height: 65, rotation: 0 },
    { id: "base-wardrobe", type: "furniture", furnitureType: "wardrobe", x: W - 40, y: D * 0.5, width: 55, height: Math.min(180, D * 0.6), rotation: 0 },
    { id: "base-tv", type: "furniture", furnitureType: "tv", x: 40, y: D * 0.5, width: 130, height: 20, rotation: 0 },
  ];
}

// Пресеты: каждый добавляет РОВНО один тип элемента потолка поверх базовой комнаты W×D.
function presetElements(preset: string, W: number, D: number): RoomElement[] {
  const e = (o: Partial<RoomElement> & { type: RoomElement["type"] }, i: number): RoomElement => ({
    id: `${preset}-${i}`,
    ...o,
  });
  const base = baseRoom(W, D);
  const add = (els: RoomElement[]) => [...base, ...els];
  const walls = [W, D, W, D];
  switch (preset) {
    case "clean":
      return base;
    case "floating":
      return add(
        walls.map((len, i) => e({ type: "floating", wallIndex: i, wallPosition: 0.5, length: len }, i)),
      );
    case "spots":
      return add(
        [
          { x: W / 3, y: D / 3 },
          { x: (2 * W) / 3, y: D / 3 },
          { x: W / 3, y: (2 * D) / 3 },
          { x: (2 * W) / 3, y: (2 * D) / 3 },
        ].map((p, i) => e({ type: "spot", x: p.x, y: p.y }, i)),
      );
    case "track":
      return add([e({ type: "track", points: [{ x: W * 0.25, y: D / 2 }, { x: W * 0.75, y: D / 2 }] }, 0)]);
    case "lightline":
      return add([e({ type: "lightline", points: [{ x: W * 0.25, y: D / 2 }, { x: W * 0.75, y: D / 2 }] }, 0)]);
    case "curtain":
      return add([e({ type: "curtain", wallIndex: 0, wallPosition: 0.5, length: W, variant: "ours" }, 0)]);
    default:
      return base;
  }
}

export default function VisionCapturePage() {
  // useSearchParams требует Suspense-границу для сборки Next.
  return (
    <Suspense fallback={null}>
      <VisionCaptureInner />
    </Suspense>
  );
}

function VisionCaptureInner() {
  const params = useSearchParams();
  const preset = params.get("preset") ?? "clean";
  const ms = Number(params.get("ms") ?? "2800");
  const roomKey = params.get("room") ?? "default";
  const [W, D] = ROOM_SIZES[roomKey] ?? ROOM_SIZES.default;
  const WALLS = useMemo(() => [W, D, W, D], [W, D]);

  const vertices = useMemo(() => getVertices(WALLS, NORMAL_CORNERS), [WALLS]);
  const elements = useMemo(() => presetElements(preset, W, D), [preset, W, D]);

  const captureName = roomKey === "default" ? preset : `${preset}_${roomKey}`;
  const devCapture = useMemo(
    () => (scene: string, mask: string, floating: string) => {
      fetch("/api/vision-capture-dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: captureName, scene, mask, floating }),
      })
        .then(() => {
          (window as unknown as { __captureDone?: boolean }).__captureDone = true;
        })
        .catch((err) => {
          (window as unknown as { __captureError?: string }).__captureError = String(err);
        });
    },
    [captureName],
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#e5e7eb" }}>
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 50, font: "12px monospace", color: "#111" }}>
        preset={preset} ms={ms}
      </div>
      <Scene3D
        vertices={vertices}
        walls={WALLS}
        ceilingHeight={CEILING_H}
        elements={elements}
        devCapture={devCapture}
        devAutoCaptureMs={ms}
      />
    </div>
  );
}
