"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { R3FErrorBoundary } from "./R3FErrorBoundary";

// Стайлинг-декор — то, что превращает «пустую коробку» в «дизайнерскую комнату»:
// живое растение в углу + мягкий ковёр под центром. Модели растений — Poly Haven
// (CC0), текстура ковра — ambientCG (CC0). Всё локально, деградирует в null.

export const PLANT_MODELS = [
  "/models/decor/calathea_orbifolia_01/model.gltf",
  "/models/decor/anthurium_botany_01/model.gltf",
];
PLANT_MODELS.forEach((u) => useGLTF.preload(u));

function PlantModel({ url, targetHeightM }: { url: string; targetHeightM: number }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.01) return;
    cloned.scale.setScalar(targetHeightM / size.y);
    const nb = new THREE.Box3().setFromObject(cloned);
    cloned.position.y -= nb.min.y; // на пол
    cloned.position.x -= (nb.min.x + nb.max.x) / 2;
    cloned.position.z -= (nb.min.z + nb.max.z) / 2;
    cloned.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }, [cloned, targetHeightM]);
  return <primitive object={cloned} />;
}

export function Plant3D({ position, url, targetHeightM = 1 }: {
  position: [number, number, number];
  url: string;
  targetHeightM?: number;
}) {
  return (
    <group position={position}>
      <R3FErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <PlantModel url={url} targetHeightM={targetHeightM} />
        </Suspense>
      </R3FErrorBoundary>
    </group>
  );
}

function RugMaterial() {
  // Берём у ковра ТОЛЬКО рельеф (normal) и шероховатость (rough) — фактуру ворса,
  // а цвет задаём вручную нейтральным тёплым беж. Так ковёр «дизайнерский», а не
  // кричаще-красный (у исходной текстуры был красный цвет — не в тему).
  const [normalMap, roughMap] = useLoader(THREE.TextureLoader, [
    "/textures/pbr/rug_normal.jpg",
    "/textures/pbr/rug_rough.jpg",
  ]) as THREE.Texture[];
  useEffect(() => {
    for (const t of [normalMap, roughMap]) {
      if (!t) continue;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [normalMap, roughMap]);
  return (
    <meshStandardMaterial
      color="#CBBEA8"
      normalMap={normalMap}
      normalScale={[0.7, 0.7]}
      roughnessMap={roughMap}
      roughness={1}
      metalness={0}
    />
  );
}

export function Rug({ position, width, depth }: {
  position: [number, number, number];
  width: number;
  depth: number;
}) {
  return (
    <R3FErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <RugMaterial />
        </mesh>
      </Suspense>
    </R3FErrorBoundary>
  );
}
