"use client";

import * as THREE from "three";
import type { ElementType } from "../room-designer";
import { DOOR_HEIGHT_M, DOOR_THICKNESS_M, WINDOW_HEIGHT_M, WINDOW_SILL_M } from "./constants";

interface WallElement3DProps {
  position: [number, number, number];
  rotationY: number;
  lengthM: number;
  ceilingM: number;
  type: ElementType;
  variant?: "ours" | "client";
}

const CURTAIN_HEIGHT_M = 0.5;
const CURTAIN_THICKNESS_M = 0.04;

export function WallElement3D({ position, rotationY, lengthM, ceilingM, type, variant }: WallElement3DProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {type === "door" && (
        <group>
          <mesh position={[0, DOOR_HEIGHT_M / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[lengthM, DOOR_HEIGHT_M, DOOR_THICKNESS_M]} />
            <meshStandardMaterial color="#5C4033" roughness={0.55} metalness={0.05} />
          </mesh>
          <mesh position={[lengthM / 2 - 0.07, 1.05, DOOR_THICKNESS_M / 2 + 0.005]}>
            <sphereGeometry args={[0.018, 16, 12]} />
            <meshStandardMaterial color="#C5A572" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[lengthM / 2 - 0.07, 1.05, -DOOR_THICKNESS_M / 2 - 0.005]}>
            <sphereGeometry args={[0.018, 16, 12]} />
            <meshStandardMaterial color="#C5A572" metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
      )}

      {type === "window" && (
        <mesh position={[0, WINDOW_SILL_M + WINDOW_HEIGHT_M / 2, 0]}>
          <boxGeometry args={[lengthM, WINDOW_HEIGHT_M, DOOR_THICKNESS_M]} />
          <meshStandardMaterial
            color="#A5D8FF"
            transparent
            opacity={0.55}
            metalness={0.1}
            roughness={0.05}
          />
        </mesh>
      )}

      {(type === "curtain" || type === "builtin_gardina") && (
        <mesh position={[0, ceilingM - CURTAIN_HEIGHT_M / 2, 0]}>
          <boxGeometry args={[lengthM, CURTAIN_HEIGHT_M, CURTAIN_THICKNESS_M]} />
          <meshStandardMaterial color={variant === "client" ? "#A8A29E" : "#D6BFA4"} roughness={0.95} />
        </mesh>
      )}

      {type === "subcurtain" && (
        <mesh position={[0, ceilingM - 0.04, 0]}>
          <boxGeometry args={[lengthM, 0.04, 0.06]} />
          <meshStandardMaterial color="#9CA3AF" roughness={0.8} />
        </mesh>
      )}

      {type === "track" && (
        <mesh position={[0, ceilingM - 0.025, 0]}>
          <boxGeometry args={[lengthM, 0.04, 0.05]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
        </mesh>
      )}

      {type === "lightline" && (
        <mesh position={[0, ceilingM - 0.02, 0]}>
          <boxGeometry args={[lengthM, 0.03, 0.05]} />
          <meshStandardMaterial
            color="#FFE5B4"
            emissive="#FFD37A"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      )}

      {type === "floating" && (
        <>
          <mesh position={[0, ceilingM - 0.05, -0.05]}>
            <boxGeometry args={[lengthM, 0.01, 0.04]} />
            <meshStandardMaterial
              color="#FFEFD5"
              emissive="#FFEAB4"
              emissiveIntensity={2.0}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            position={[0, ceilingM - 0.06, -0.08]}
            color="#FFE5B4"
            intensity={0.8}
            distance={Math.max(lengthM * 0.6, 1.5)}
            decay={2}
          />
        </>
      )}

      {type === "shower_curtain" && (
        <mesh position={[0, ceilingM - 1.0, 0]}>
          <boxGeometry args={[lengthM, 2.0, 0.02]} />
          <meshStandardMaterial color="#BFDBFE" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
