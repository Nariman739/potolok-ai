"use client";

import * as THREE from "three";

const SPOT_DIAMETER_M = 0.082;
const SPOT_DEPTH_M = 0.05;

interface Spot3DProps {
  position: [number, number, number];
  variant?: "ours" | "client";
  withLight: boolean;
}

export function Spot3D({ position, variant = "ours", withLight }: Spot3DProps) {
  const lightColor = variant === "client" ? "#FFE9CD" : "#FFB46B";
  const r = SPOT_DIAMETER_M / 2;

  return (
    <group position={position}>
      <mesh position={[0, -SPOT_DEPTH_M / 2, 0]}>
        <cylinderGeometry args={[r, r, SPOT_DEPTH_M, 24]} />
        <meshStandardMaterial color="#1f1f1f" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[0, -SPOT_DEPTH_M - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.92, 24]} />
        <meshStandardMaterial
          color={lightColor}
          emissive={lightColor}
          emissiveIntensity={2.2}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {withLight && (
        <pointLight
          position={[0, -SPOT_DEPTH_M - 0.05, 0]}
          color={lightColor}
          intensity={1.8}
          distance={3.5}
          decay={2}
        />
      )}
    </group>
  );
}
