"use client";

import * as THREE from "three";

const SPOT_DIAMETER_M = 0.082;
const SPOT_DEPTH_M = 0.05;

interface Spot3DProps {
  position: [number, number, number];
  variant?: "ours" | "client";
  withLight: boolean;
  lightColor?: string;
  /** Реальный диаметр софита из PriceVariant.physicalWidthMm (override default 82 мм). */
  diameterMm?: number;
  /** Реальная глубина встраивания (PriceVariant.physicalHeightMm). */
  depthMm?: number;
  /** Цвет корпуса спота (PriceVariant.colorHex) — например белый, чёрный, графит. */
  bodyColor?: string;
}

export function Spot3D({
  position,
  variant = "ours",
  withLight,
  lightColor: lightColorOverride,
  diameterMm,
  depthMm,
  bodyColor,
}: Spot3DProps) {
  const defaultColor = variant === "client" ? "#FFE9CD" : "#FFB46B";
  const lightColor = lightColorOverride ?? defaultColor;
  const diameterM = typeof diameterMm === "number" && diameterMm > 0 ? diameterMm / 1000 : SPOT_DIAMETER_M;
  const depthM = typeof depthMm === "number" && depthMm > 0 ? depthMm / 1000 : SPOT_DEPTH_M;
  const r = diameterM / 2;

  return (
    <group position={position}>
      {/* Корпус — врезанный в потолок цилиндр */}
      <mesh position={[0, -depthM / 2, 0]}>
        <cylinderGeometry args={[r, r, depthM, 24]} />
        <meshStandardMaterial color={bodyColor ?? "#1f1f1f"} metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Декоративное кольцо-ободок */}
      <mesh position={[0, -depthM + 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.94, r * 1.04, 32]} />
        <meshStandardMaterial color="#E5E7EB" metalness={0.7} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* Свечение — диск из стекла */}
      <mesh position={[0, -depthM - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.92, 24]} />
        <meshStandardMaterial
          color={lightColor}
          emissive={lightColor}
          emissiveIntensity={3.5}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {withLight && (
        <pointLight
          position={[0, -depthM - 0.05, 0]}
          color={lightColor}
          intensity={2.6}
          distance={4}
          decay={2}
        />
      )}
    </group>
  );
}
