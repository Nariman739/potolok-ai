"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { cm2m, type Vertex2D } from "./types";

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
}

const WALL_THICKNESS = 0.06;
const SKIRTING_HEIGHT = 0.08;
const SKIRTING_DEPTH = 0.012;
const CORNICE_HEIGHT = 0.06;
const CORNICE_DEPTH = 0.025;

const FINISH_PARAMS: Record<CeilingFinish, { roughness: number; metalness: number; envIntensity: number }> = {
  matte:  { roughness: 0.9,  metalness: 0.0,  envIntensity: 0.3 },
  satin:  { roughness: 0.45, metalness: 0.05, envIntensity: 0.7 },
  glossy: { roughness: 0.08, metalness: 0.15, envIntensity: 1.6 },
};

export function Room3D({ vertices, ceilingHeight, centerOffset, wallCutouts, ceilingColor, ceilingFinish, hideCeiling = false }: Room3DProps) {
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
        <meshStandardMaterial color="#D6CFC2" roughness={0.85} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>

      {!hideCeiling && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingM, 0]}>
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial
            color={ceilingColor}
            roughness={finish.roughness}
            metalness={finish.metalness}
            envMapIntensity={finish.envIntensity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {wallMeshes.map((w) => (
        <group key={w.key} position={w.position} rotation={[0, w.rotationY, 0]}>
          <mesh geometry={w.geometry} castShadow receiveShadow>
            <meshStandardMaterial color="#F2EFEA" roughness={0.85} metalness={0.0} side={THREE.DoubleSide} />
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
