"use client";

import { Suspense, useEffect, useMemo, type ReactNode } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { cm2m, type Vertex2D } from "./types";
import { R3FErrorBoundary } from "./R3FErrorBoundary";

// Обёртка над текстурой: Suspense показывает plain-цвет ПОКА грузится, а
// R3FErrorBoundary — plain-цвет НАВСЕГДА если fetch сорвался (offline/404).
// Без boundary ошибка загрузчика убивала бы всю сцену (Safari «Load failed»).
function SafeTexturedMaterial({
  url,
  fallback,
  roughness,
  tilesX,
  tilesY,
}: {
  url: string;
  fallback: ReactNode;
  roughness: number;
  tilesX?: number;
  tilesY?: number;
}) {
  return (
    <R3FErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TexturedMaterial url={url} fallbackColor="#ffffff" roughness={roughness} tilesX={tilesX} tilesY={tilesY} />
      </Suspense>
    </R3FErrorBoundary>
  );
}

// Текстурированный материал — монтируется только когда URL задан.
function TexturedMaterial({
  url,
  fallbackColor,
  roughness,
  tilesX = 4,
  tilesY = 4,
}: {
  url: string;
  fallbackColor: string;
  roughness: number;
  tilesX?: number;
  tilesY?: number;
}) {
  const texture = useLoader(THREE.TextureLoader, url) as THREE.Texture;
  useEffect(() => {
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(tilesX, tilesY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture, tilesX, tilesY]);
  return (
    <meshStandardMaterial
      map={texture}
      color={fallbackColor}
      roughness={roughness}
      metalness={0}
      side={THREE.DoubleSide}
    />
  );
}

export interface WallCutout {
  uStart: number;
  uEnd: number;
  vBottom: number;
  vTop: number;
}

export type CeilingFinish = "matte" | "satin" | "glossy";

interface Room3DProps {
  vertices: Vertex2D[];
  ceilingHeight: number;
  centerOffset: { x: number; z: number };
  wallCutouts: WallCutout[][];
  ceilingColor: string;
  ceilingFinish: CeilingFinish;
  hideCeiling?: boolean;
  /** Цвет пола из пресета (fallback если текстура не задана). */
  floorColor?: string;
  floorRoughness?: number;
  /** URL текстуры пола (1K JPG из /public/textures/floor/). null = plain color. */
  floorTextureUrl?: string | null;
  /** Цвет стен из пресета. */
  wallColor?: string;
  wallRoughness?: number;
  /** URL текстуры стен (1K JPG из /public/textures/wall/). null = plain color. */
  wallTextureUrl?: string | null;
}

const WALL_THICKNESS = 0.06;
const SKIRTING_HEIGHT = 0.08;
const SKIRTING_DEPTH = 0.012;
const CORNICE_HEIGHT = 0.06;
const CORNICE_DEPTH = 0.025;

// FINISH_PARAMS для MeshPhysicalMaterial (Нариман 2026-06-27).
// Секрет «не-пластика» (research Агента C):
//   matte: sheen 0.3 + sheenColor=#fff — даёт эффект ткани вместо пластика
//   satin: clearcoat 0.3 — лёгкий лак, мягкие рефлексы
//   glossy: clearcoat 1.0 + reflectivity 0.6 — настоящий глянцевый потолок
// envIntensity — насколько сильно HDRI отражается от потолка.
const FINISH_PARAMS: Record<CeilingFinish, {
  roughness: number; metalness: number; envIntensity: number;
  clearcoat: number; clearcoatRoughness: number;
  sheen: number; sheenColor: string;
  reflectivity: number;
}> = {
  matte:  { roughness: 0.9,  metalness: 0.0,  envIntensity: 0.4, clearcoat: 0,    clearcoatRoughness: 1.0, sheen: 0.3,  sheenColor: "#ffffff", reflectivity: 0.1 },
  satin:  { roughness: 0.45, metalness: 0.05, envIntensity: 0.8, clearcoat: 0.3,  clearcoatRoughness: 0.4, sheen: 0.0,  sheenColor: "#ffffff", reflectivity: 0.3 },
  glossy: { roughness: 0.08, metalness: 0.0,  envIntensity: 1.4, clearcoat: 1.0,  clearcoatRoughness: 0.05, sheen: 0.0, sheenColor: "#ffffff", reflectivity: 0.6 },
};

export function Room3D({
  vertices,
  ceilingHeight,
  centerOffset,
  wallCutouts,
  ceilingColor,
  ceilingFinish,
  hideCeiling = false,
  floorColor = "#D6CFC2",
  floorRoughness = 0.85,
  floorTextureUrl = null,
  wallColor = "#F2EFEA",
  wallRoughness = 0.85,
  wallTextureUrl = null,
}: Room3DProps) {
  const ceilingM = cm2m(ceilingHeight);
  const finish = FINISH_PARAMS[ceilingFinish];

  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (vertices.length === 0) return shape;
    const v0 = vertices[0];
    shape.moveTo(cm2m(v0.x) - centerOffset.x, cm2m(v0.y) - centerOffset.z);
    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i];
      shape.lineTo(cm2m(v.x) - centerOffset.x, cm2m(v.y) - centerOffset.z);
    }
    shape.closePath();
    return shape;
  }, [vertices, centerOffset.x, centerOffset.z]);

  const wallMeshes = useMemo(() => {
    const meshes: Array<{
      key: string;
      geometry: THREE.ExtrudeGeometry;
      position: [number, number, number];
      rotationY: number;
      length: number;
    }> = [];

    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i];
      const b = vertices[i + 1];
      const ax = cm2m(a.x) - centerOffset.x;
      const az = cm2m(a.y) - centerOffset.z;
      const bx = cm2m(b.x) - centerOffset.x;
      const bz = cm2m(b.y) - centerOffset.z;
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(length, 0);
      shape.lineTo(length, ceilingM);
      shape.lineTo(0, ceilingM);
      shape.closePath();

      const cutouts = wallCutouts[i] ?? [];
      for (const c of cutouts) {
        const u0 = Math.max(0.001, Math.min(length - 0.001, c.uStart));
        const u1 = Math.max(0.001, Math.min(length - 0.001, c.uEnd));
        if (u1 - u0 < 0.05) continue;
        const v0 = Math.max(0.001, c.vBottom);
        const v1 = Math.min(ceilingM - 0.001, c.vTop);
        if (v1 - v0 < 0.05) continue;
        const hole = new THREE.Path();
        hole.moveTo(u0, v0);
        hole.lineTo(u1, v0);
        hole.lineTo(u1, v1);
        hole.lineTo(u0, v1);
        hole.closePath();
        shape.holes.push(hole);
      }

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: WALL_THICKNESS,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -WALL_THICKNESS / 2);

      meshes.push({
        key: `wall-${i}`,
        geometry,
        position: [ax, 0, az],
        rotationY: -Math.atan2(dz, dx),
        length,
      });
    }

    return meshes;
  }, [vertices, ceilingM, centerOffset.x, centerOffset.z, wallCutouts]);

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <shapeGeometry args={[floorShape]} />
        {floorTextureUrl ? (
          <SafeTexturedMaterial
            url={floorTextureUrl}
            fallback={<meshStandardMaterial color={floorColor} roughness={floorRoughness} metalness={0.0} side={THREE.DoubleSide} />}
            roughness={floorRoughness}
            tilesX={4}
            tilesY={4}
          />
        ) : (
          <meshStandardMaterial color={floorColor} roughness={floorRoughness} metalness={0.0} side={THREE.DoubleSide} />
        )}
      </mesh>

      {!hideCeiling && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingM, 0]}>
          <shapeGeometry args={[floorShape]} />
          {/* MeshPhysicalMaterial для натяжного потолка (Нариман 2026-06-27).
              clearcoat = реалистичный лак на сатине/глянце.
              sheen = эффект ткани на матовом (не «пластиковый»).
              envMapIntensity = силе HDRI рефлексов от Environment в Scene3D. */}
          <meshPhysicalMaterial
            color={ceilingColor}
            roughness={finish.roughness}
            metalness={finish.metalness}
            envMapIntensity={finish.envIntensity}
            clearcoat={finish.clearcoat}
            clearcoatRoughness={finish.clearcoatRoughness}
            sheen={finish.sheen}
            sheenColor={finish.sheenColor}
            reflectivity={finish.reflectivity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {wallMeshes.map((w) => (
        <group key={w.key} position={w.position} rotation={[0, w.rotationY, 0]}>
          <mesh geometry={w.geometry} castShadow receiveShadow>
            {wallTextureUrl ? (
              <SafeTexturedMaterial
                url={wallTextureUrl}
                fallback={<meshStandardMaterial color={wallColor} roughness={wallRoughness} metalness={0.0} side={THREE.DoubleSide} />}
                roughness={wallRoughness}
                tilesX={2}
                tilesY={1}
              />
            ) : (
              <meshStandardMaterial color={wallColor} roughness={wallRoughness} metalness={0.0} side={THREE.DoubleSide} />
            )}
          </mesh>

          <mesh position={[w.length / 2, SKIRTING_HEIGHT / 2, -WALL_THICKNESS / 2 - SKIRTING_DEPTH / 2]} castShadow>
            <boxGeometry args={[w.length, SKIRTING_HEIGHT, SKIRTING_DEPTH]} />
            <meshStandardMaterial color="#FAFAF8" roughness={0.6} metalness={0.05} />
          </mesh>

          {!hideCeiling && (
            <mesh position={[w.length / 2, ceilingM - CORNICE_HEIGHT / 2, -WALL_THICKNESS / 2 - CORNICE_DEPTH / 2]}>
              <boxGeometry args={[w.length, CORNICE_HEIGHT, CORNICE_DEPTH]} />
              <meshStandardMaterial color="#FFFFFF" roughness={0.5} metalness={0.05} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
