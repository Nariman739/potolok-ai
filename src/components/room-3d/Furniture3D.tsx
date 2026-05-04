"use client";

import type { FurnitureType } from "@/lib/room-types";
import { FURNITURE_3D_DIMENSIONS } from "./types";

interface Furniture3DProps {
  position: [number, number, number];
  rotationY: number;
  furnitureType: FurnitureType;
  widthM: number;
  depthM: number;
}

export function Furniture3D({ position, rotationY, furnitureType, widthM, depthM }: Furniture3DProps) {
  const dim = FURNITURE_3D_DIMENSIONS[furnitureType];
  const heightM = dim.heightCm / 100;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM, heightM, depthM]} />
        <meshStandardMaterial color={dim.color} roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}
