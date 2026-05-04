"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { Room3D, type WallCutout, type CeilingFinish } from "./Room3D";
import { DOOR_HEIGHT_M, WINDOW_HEIGHT_M, WINDOW_SILL_M, CEILING_COLORS } from "./constants";
import { LookAroundControls, type LookAroundHandle } from "./LookAroundControls";
import { ScreenshotCapture } from "./ScreenshotCapture";
import { Spot3D } from "./Spot3D";
import { Chandelier3D } from "./Chandelier3D";
import { Furniture3D } from "./Furniture3D";
import { WallElement3D } from "./WallElement3D";
import { cm2m, type Scene3DProps, type ViewSpot } from "./types";
import type { FurnitureType, ElementType } from "@/lib/room-types";

interface SpotInfo {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

interface WallAnchor {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

const HUMAN_EYE_HEIGHT = 1.6;

const WALL_ELEMENT_TYPES = new Set<ElementType>([
  "door", "window", "curtain", "subcurtain", "track",
  "lightline", "floating", "builtin_gardina", "shower_curtain",
]);

const DEFAULT_LENGTH_CM: Partial<Record<ElementType, number>> = {
  door: 80,
  window: 120,
};

const MAX_POINT_LIGHTS = 14;

// Если Suspense поймал ошибку загрузки HDR — поднимаем флаг, чтобы перестать пытаться.
// Используется как fallback внутри `<Suspense fallback={...}>`.
function EnvFailNotifier({ onFail }: { onFail: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFail, 4000); // 4 сек — если HDR не загрузился, сдаёмся
    return () => clearTimeout(t);
  }, [onFail]);
  return null;
}

export function Scene3D({ vertices, walls, ceilingHeight, elements, onScreenshot, readOnly }: Scene3DProps) {
  const [spot, setSpot] = useState<ViewSpot>("center");
  const daylight = true;
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);
  const [savingShot, setSavingShot] = useState(false);
  const [shotMessage, setShotMessage] = useState<string | null>(null);
  const [ceilingFinish, setCeilingFinish] = useState<CeilingFinish>(() => {
    if (typeof window === "undefined") return "satin";
    const v = window.localStorage.getItem("potolok3d.finish");
    return v === "matte" || v === "glossy" || v === "satin" ? v : "satin";
  });
  const [ceilingColorId, setCeilingColorId] = useState<string>(() => {
    if (typeof window === "undefined") return "white";
    return window.localStorage.getItem("potolok3d.color") ?? "white";
  });
  const [showCeilingPanel, setShowCeilingPanel] = useState(false);
  // Адаптивное качество: high — с Environment HDR + ContactShadows; low — без них (если FPS падает)
  const [quality, setQuality] = useState<"high" | "low">("high");
  // Если HDR не грузится в Safari — переключаемся в low автоматически через Suspense fallback
  const [envFailed, setEnvFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("potolok3d.finish", ceilingFinish);
  }, [ceilingFinish]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("potolok3d.color", ceilingColorId);
  }, [ceilingColorId]);
  const lookRef = useRef<LookAroundHandle | null>(null);

  const ceilingColor = useMemo(
    () => CEILING_COLORS.find((c) => c.id === ceilingColorId)?.hex ?? "#F8FAFC",
    [ceilingColorId],
  );

  const { centerOffset, roomSize } = useMemo(() => {
    if (vertices.length === 0) {
      return {
        centerOffset: { x: 0, z: 0 },
        roomSize: 5,
      };
    }
    const xs = vertices.map((v) => cm2m(v.x));
    const ys = vertices.map((v) => cm2m(v.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cz = (minY + maxY) / 2;
    return {
      centerOffset: { x: cx, z: cz },
      roomSize: Math.max(maxX - minX, maxY - minY, 2),
    };
  }, [vertices]);

  const ceilingM = cm2m(ceilingHeight);
  void walls;

  const lightFixtures = useMemo(() => {
    const items: Array<{
      kind: "spot" | "chandelier";
      id: string;
      pos: [number, number, number];
      variant?: "ours" | "client";
    }> = [];
    for (const el of elements) {
      if (el.x === undefined || el.y === undefined) continue;
      if (el.type !== "spot" && el.type !== "chandelier") continue;
      const x = cm2m(el.x) - centerOffset.x;
      const z = cm2m(el.y) - centerOffset.z;
      items.push({
        kind: el.type,
        id: el.id,
        pos: [x, ceilingM, z],
        variant: el.variant,
      });
    }
    return items;
  }, [elements, centerOffset.x, centerOffset.z, ceilingM]);

  const totalLightSources = lightFixtures.length;
  const lightBudget = totalLightSources <= MAX_POINT_LIGHTS;

  const handleCapture = useCallback(async (dataUrl: string) => {
    setSavingShot(true);
    setShotMessage(null);
    try {
      const res = await fetch("/api/upload-room-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setShotMessage("Сохранено для КП");
      onScreenshot?.(url);
    } catch {
      setShotMessage("Не удалось сохранить");
    } finally {
      setSavingShot(false);
      window.setTimeout(() => setShotMessage(null), 3500);
    }
  }, [onScreenshot]);

  const findWallAnchor = useCallback((targetType: ElementType): WallAnchor | undefined => {
    const el = elements.find((e) => e.type === targetType && e.wallIndex !== undefined);
    if (!el || el.wallIndex === undefined) return undefined;
    const a = vertices[el.wallIndex];
    const b = vertices[el.wallIndex + 1];
    if (!a || !b) return undefined;
    const ax = cm2m(a.x) - centerOffset.x;
    const az = cm2m(a.y) - centerOffset.z;
    const bx = cm2m(b.x) - centerOffset.x;
    const bz = cm2m(b.y) - centerOffset.z;
    const t = el.wallPosition ?? 0.5;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return undefined;
    let nx = -dz / len;
    let nz = dx / len;
    if (Math.hypot(x + nx, z + nz) > Math.hypot(x - nx, z - nz)) {
      nx = -nx;
      nz = -nz;
    }
    return { x, z, nx, nz };
  }, [elements, vertices, centerOffset.x, centerOffset.z]);

  const spots = useMemo<Record<ViewSpot, SpotInfo | null>>(() => {
    const center = new THREE.Vector3(0, HUMAN_EYE_HEIGHT, 0);
    const ceilLook = ceilingHeight / 100 * 0.55;
    const result: Record<ViewSpot, SpotInfo | null> = {
      center: {
        position: center.clone(),
        lookAt: new THREE.Vector3(2, HUMAN_EYE_HEIGHT - 0.05, 0),
      },
      door: null,
      window: null,
    };
    const door = findWallAnchor("door");
    if (door) {
      result.door = {
        position: new THREE.Vector3(door.x + door.nx * 0.4, HUMAN_EYE_HEIGHT, door.z + door.nz * 0.4),
        lookAt: new THREE.Vector3(0, ceilLook, 0),
      };
    }
    const win = findWallAnchor("window");
    if (win) {
      result.window = {
        position: new THREE.Vector3(win.x + win.nx * 0.6, HUMAN_EYE_HEIGHT, win.z + win.nz * 0.6),
        lookAt: new THREE.Vector3(0, ceilLook, 0),
      };
    }
    return result;
  }, [findWallAnchor, ceilingHeight]);

  useEffect(() => {
    // LookAroundControls монтируется внутри Canvas асинхронно — на момент первого
    // useEffect lookRef ещё null. Поэтому ретраим через requestAnimationFrame пока
    // ref не появится, чтобы камера встала в спот, а не висела в initial-позиции.
    let raf = 0;
    const tryInit = () => {
      const target = spots[spot] ?? spots.center;
      if (lookRef.current && target) {
        lookRef.current.setView(target.position, target.lookAt);
      } else {
        raf = requestAnimationFrame(tryInit);
      }
    };
    raf = requestAnimationFrame(tryInit);
    return () => cancelAnimationFrame(raf);
  }, [spot, spots]);

  const wallCutouts = useMemo<WallCutout[][]>(() => {
    const result: WallCutout[][] = vertices.length > 1
      ? Array.from({ length: vertices.length - 1 }, () => [])
      : [];
    for (const el of elements) {
      if (el.type !== "door" && el.type !== "window") continue;
      if (el.wallIndex === undefined) continue;
      const a = vertices[el.wallIndex];
      const b = vertices[el.wallIndex + 1];
      if (!a || !b) continue;
      const wallLengthM = Math.hypot(cm2m(b.x - a.x), cm2m(b.y - a.y));
      if (wallLengthM < 0.1) continue;
      const t = el.wallPosition ?? 0.5;
      const lengthCm = el.length ?? (el.type === "door" ? 80 : 120);
      const lengthM = Math.min(cm2m(lengthCm), wallLengthM - 0.1);
      const centerU = t * wallLengthM;
      const uStart = Math.max(0.05, centerU - lengthM / 2);
      const uEnd = Math.min(wallLengthM - 0.05, centerU + lengthM / 2);
      const vBottom = el.type === "door" ? 0 : WINDOW_SILL_M;
      const vTop = el.type === "door" ? DOOR_HEIGHT_M : WINDOW_SILL_M + WINDOW_HEIGHT_M;
      result[el.wallIndex].push({ uStart, uEnd, vBottom, vTop });
    }
    return result;
  }, [elements, vertices]);

  const wallElements = useMemo(() => {
    const items: Array<{
      id: string;
      pos: [number, number, number];
      rotationY: number;
      lengthM: number;
      type: ElementType;
      variant?: "ours" | "client";
    }> = [];
    for (const el of elements) {
      if (el.wallIndex === undefined) continue;
      if (!WALL_ELEMENT_TYPES.has(el.type)) continue;
      const a = vertices[el.wallIndex];
      const b = vertices[el.wallIndex + 1];
      if (!a || !b) continue;
      const ax = cm2m(a.x) - centerOffset.x;
      const az = cm2m(a.y) - centerOffset.z;
      const bx = cm2m(b.x) - centerOffset.x;
      const bz = cm2m(b.y) - centerOffset.z;
      const dx = bx - ax;
      const dz = bz - az;
      const wallLengthM = Math.hypot(dx, dz);
      if (wallLengthM < 0.01) continue;
      const t = el.wallPosition ?? 0.5;
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const defaultLen = DEFAULT_LENGTH_CM[el.type] ?? wallLengthM * 100;
      const lengthCm = el.length ?? defaultLen;
      items.push({
        id: el.id,
        pos: [cx, 0, cz],
        rotationY: -Math.atan2(dz, dx),
        lengthM: Math.min(cm2m(lengthCm), wallLengthM),
        type: el.type,
        variant: el.variant,
      });
    }
    return items;
  }, [elements, vertices, centerOffset.x, centerOffset.z]);

  const furnitureItems = useMemo(() => {
    const items: Array<{
      id: string;
      pos: [number, number, number];
      rotationY: number;
      furnitureType: FurnitureType;
      widthM: number;
      depthM: number;
    }> = [];
    for (const el of elements) {
      if (el.type !== "furniture") continue;
      if (el.x === undefined || el.y === undefined || !el.furnitureType) continue;
      const x = cm2m(el.x) - centerOffset.x;
      const z = cm2m(el.y) - centerOffset.z;
      items.push({
        id: el.id,
        pos: [x, 0, z],
        rotationY: -((el.rotation ?? 0) * Math.PI) / 180,
        furnitureType: el.furnitureType,
        widthM: cm2m(el.width ?? 100),
        depthM: cm2m(el.height ?? 100),
      });
    }
    return items;
  }, [elements, centerOffset.x, centerOffset.z]);

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-sky-50 to-slate-100">
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: daylight ? 1.0 : 0.85,
        }}
        camera={{ position: [0, HUMAN_EYE_HEIGHT, 0], fov: 70, near: 0.05, far: 100 }}
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <color attach="background" args={[daylight ? "#9ec5e8" : "#05070D"]} />

        {/* Адаптивное качество: если FPS среднем падает <30 — переключаемся в low (без env/shadows) */}
        <PerformanceMonitor
          onDecline={() => setQuality("low")}
          onIncline={() => setQuality((q) => (q === "low" ? "high" : q))}
        />

        <ambientLight intensity={daylight ? 0.55 : 0.16} />
        <hemisphereLight args={["#fffaf0", "#23272f", daylight ? 0.4 : 0.08]} />
        <directionalLight
          position={[roomSize * 1.5, roomSize * 2, roomSize * 1.2]}
          intensity={daylight ? 0.7 : 0}
        />

        {/* HDR Environment даёт реалистичные рефлексы на глянцевом потолке.
            Suspense ловит ошибку загрузки в Safari → fallback на null (без env). */}
        {quality === "high" && !envFailed && (
          <Suspense fallback={<EnvFailNotifier onFail={() => setEnvFailed(true)} />}>
            <Environment preset="apartment" environmentIntensity={0.6} />
          </Suspense>
        )}

        <Room3D
          vertices={vertices}
          ceilingHeight={ceilingHeight}
          centerOffset={centerOffset}
          wallCutouts={wallCutouts}
          ceilingColor={ceilingColor}
          ceilingFinish={ceilingFinish}
        />

        {/* Контактные тени под мебелью — без shadow maps, работает на iOS */}
        {quality === "high" && (
          <ContactShadows
            position={[0, 0.005, 0]}
            opacity={0.35}
            scale={Math.max(roomSize * 1.2, 8)}
            blur={2.4}
            far={2}
            resolution={512}
            color="#1a1a1a"
          />
        )}

        {lightFixtures.map((f) =>
          f.kind === "spot" ? (
            <Spot3D key={f.id} position={f.pos} variant={f.variant} withLight={lightBudget} />
          ) : (
            <Chandelier3D key={f.id} position={f.pos} withLight={lightBudget} />
          ),
        )}

        {furnitureItems.map((f) => (
          <Furniture3D
            key={f.id}
            position={f.pos}
            rotationY={f.rotationY}
            furnitureType={f.furnitureType}
            widthM={f.widthM}
            depthM={f.depthM}
          />
        ))}

        {wallElements.map((w) => (
          <WallElement3D
            key={w.id}
            position={w.pos}
            rotationY={w.rotationY}
            lengthM={w.lengthM}
            ceilingM={ceilingM}
            type={w.type}
            variant={w.variant}
          />
        ))}

        <LookAroundControls ref={lookRef} />

        <ScreenshotCapture trigger={screenshotTrigger} onCapture={handleCapture} />
      </Canvas>

      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 items-start">
        {!readOnly && (
          <button
            onClick={() => setScreenshotTrigger((t) => t + 1)}
            disabled={savingShot}
            className="h-10 px-3 bg-white/95 rounded-xl shadow border flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 active:scale-95 disabled:opacity-60"
          >
            {savingShot ? "Сохраняю…" : "📸 Снимок для КП"}
          </button>
        )}
        <button
          onClick={() => setShowCeilingPanel((v) => !v)}
          className={`h-10 px-3 rounded-xl shadow border flex items-center gap-1.5 text-xs font-bold active:scale-95 ${
            showCeilingPanel ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white/95 text-gray-700 hover:bg-gray-100"
          }`}
        >
          🎨 Потолок
        </button>
        {showCeilingPanel && (
          <div className="bg-white/98 backdrop-blur rounded-2xl shadow-xl border p-3 space-y-3 min-w-[220px]">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">Финиш</div>
              <div className="grid grid-cols-3 gap-1">
                {(["matte", "satin", "glossy"] as const).map((f) => {
                  const labels: Record<CeilingFinish, string> = { matte: "Матовый", satin: "Сатин", glossy: "Глянец" };
                  const active = ceilingFinish === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setCeilingFinish(f)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${
                        active ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">Цвет</div>
              <div className="flex flex-wrap gap-1.5">
                {CEILING_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCeilingColorId(c.id)}
                    title={c.label}
                    className={`w-8 h-8 rounded-full border-2 active:scale-95 transition-transform ${
                      ceilingColorId === c.id ? "border-[#1e3a5f] scale-110" : "border-white shadow"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {shotMessage && (
          <div className="px-3 py-1.5 bg-[#1e3a5f] text-white rounded-xl text-xs font-medium shadow">
            {shotMessage}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-1.5 bg-white/95 backdrop-blur rounded-2xl shadow-lg border px-2 py-1.5 max-w-[95%]">
        <SpotButton current={spot} value="center" label="🧍 Центр" onSelect={setSpot} enabled={true} />
        <SpotButton current={spot} value="door" label="🚪 От двери" onSelect={setSpot} enabled={spots.door !== null} />
        <SpotButton current={spot} value="window" label="🪟 От окна" onSelect={setSpot} enabled={spots.window !== null} />
      </div>

      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-black/40 text-white text-[11px] rounded-full pointer-events-none backdrop-blur">
        Тяните пальцем чтобы крутить головой
      </div>

      {/* Debug overlay — небольшая сводка по сцене, помогает дебажить пустой 3D */}
      <div className="absolute bottom-1 right-1 z-10 text-[9px] text-gray-500/70 font-mono pointer-events-none select-none">
        v={vertices.length} h={(ceilingHeight / 100).toFixed(1)}m sz={roomSize.toFixed(1)}m el={elements.length}
      </div>
    </div>
  );
}

function SpotButton({
  current,
  value,
  label,
  onSelect,
  enabled,
}: {
  current: ViewSpot;
  value: ViewSpot;
  label: string;
  onSelect: (p: ViewSpot) => void;
  enabled: boolean;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => enabled && onSelect(value)}
      disabled={!enabled}
      className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
        active
          ? "bg-[#1e3a5f] text-white"
          : enabled
            ? "text-gray-700 hover:bg-gray-100 active:scale-95"
            : "text-gray-300 cursor-not-allowed"
      }`}
    >
      {label}
    </button>
  );
}

