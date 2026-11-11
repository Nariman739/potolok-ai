import { useEffect, useMemo } from "react";
import { requestShadowRebake } from "./sceneInvalidate";
import * as THREE from "three";
import type { FurnitureType } from "./types";
import { getSoftRectTexture } from "./lightTextures";
import { DESIGN_PASS, useDesignPass } from "./designPassLook";
import { softShadowGeometry } from "./furnitureBuilder";
import { FURNITURE_SHADOW_K, FURNITURE_SHADOW_BAND_K } from "./floorLook";
import { buildFurnitureModel, type FurnitureModel } from "./furnitureModels";

interface Furniture3DProps {
  position: [number, number, number];
  rotationY: number;
  furnitureType: FurnitureType;
  widthM: number;
  depthM: number;
  /** Высота потолка, м — от неё зависит высота шкафа. */
  ceilingM?: number;
  /** Зазоры от задней грани и торцов габарита до ближайшей стены, м. */
  backGapM?: number;
  frontGapM?: number;
  leftGapM?: number;
  rightGapM?: number;
  /** Кухня: короткий блок Г-образной сборки (см. Scene3DNative). */
  kitchenJoin?: { end: "left" | "right"; mainDepthM: number };
}

// Процедурная мебель (06–07.11.2026): один предмет = один меш с цветом в
// вершинах и общим матовым материалом на всю коллекцию (furnitureModels.ts).
// Раньше были коробки из нескольких мешей и четыре GLB-модели Poly Haven без
// текстур (диван, стул, тумбочка, стенка) — 99 % треугольников мебели, под
// размер мастера не тянулись.
// Тень ключевого света мебель бросает на пол, но сама её не принимает: тень
// дивана ложилась на фасад шкафа тёмным пятном. Объём дают затемнения в цвете
// вершин и мягкие контактные тени — на полу вокруг предмета, на стене за ним.
// Свет сцены резкий: ключевой направленный даёт грани «к свету» вдвое ярче
// грани «в тени» (фасад шкафа 230, бок 133 — читалось как два материала).
// В комнате с белым потолком столько контраста не бывает: много отражённого
// света. Поэтому у мебели часть света ровная, не зависящая от направления
// (BODY_FILL от цвета детали), а общий тон BODY_TONE подобран так, чтобы
// освещённый фасад не выходил ярче потолка рядом.
const BODY_FILL = 1.6;
const BODY_TONE = 0.3;
let bodyMaterial: THREE.MeshStandardMaterial | null = null;
function getBodyMaterial(): THREE.MeshStandardMaterial {
  if (!bodyMaterial) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.color.setScalar(BODY_TONE);
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${BODY_FILL.toFixed(3)};`,
      );
    };
    bodyMaterial = m;
  }
  return bodyMaterial;
}
// Материал тени — один на каждую плотность (их в коллекции несколько штук).
const shadowMaterials = new Map<number, THREE.MeshBasicMaterial>();
function getShadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  let m = shadowMaterials.get(opacity);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: "#000000",
      map: getSoftRectTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Без polygonOffset: тень и так отнесена от пола/стены на 4 мм, а сдвиг
      // глубины давал пунктир там, где её плоскость пересекает бок мебели.
    });
    shadowMaterials.set(opacity, m);
  }
  return m;
}

function ModelFurniture({ position, rotationY, model }: { position: [number, number, number]; rotationY: number; model: FurnitureModel }) {
  const wallAoOn = useDesignPass("wallAo");
  const floorGeo = useMemo(() => {
    const s = model.floorShadow;
    return s ? softShadowGeometry(s.w, s.h, s.band * FURNITURE_SHADOW_BAND_K) : null;
  }, [model]);
  const wallGeo = useMemo(() => {
    const s = model.wallShadow;
    return s ? softShadowGeometry(s.w, s.h, s.band) : null;
  }, [model]);
  // Тени статичные (sceneInvalidate.ts): новая геометрия → перепечь карту.
  useEffect(() => {
    requestShadowRebake(2);
    return () => {
      model.geometry.dispose();
      floorGeo?.dispose();
      wallGeo?.dispose();
    };
  }, [model, floorGeo, wallGeo]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {floorGeo && model.floorShadow && (
        <mesh geometry={floorGeo} material={getShadowMaterial(Math.min(0.9, model.floorShadow.opacity * FURNITURE_SHADOW_K))} dispose={null} position={[model.floorShadow.cx, 0.004, model.floorShadow.cy]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
      )}
      {wallGeo && model.wallShadow && (
        <mesh geometry={wallGeo} material={getShadowMaterial(wallAoOn ? Math.min(0.6, model.wallShadow.opacity * DESIGN_PASS.furnWallShadowK) : model.wallShadow.opacity)} dispose={null} position={[model.wallShadow.cx, model.wallShadow.cy, model.wallShadow.z + 0.004]} renderOrder={1} />
      )}
      <mesh geometry={model.geometry} material={getBodyMaterial()} dispose={null} castShadow />
    </group>
  );
}

export function Furniture3D(props: Furniture3DProps) {
  const { position, rotationY, furnitureType, widthM, depthM, ceilingM = 2.7, backGapM = Infinity, frontGapM, leftGapM, rightGapM, kitchenJoin } = props;
  const joinKey = kitchenJoin ? `${kitchenJoin.end}:${kitchenJoin.mainDepthM}` : "";
  const model = useMemo(
    () => buildFurnitureModel(furnitureType, widthM, depthM, { ceilingM, backGapM, frontGapM, leftGapM, rightGapM, kitchenJoin }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [furnitureType, widthM, depthM, ceilingM, backGapM, frontGapM, leftGapM, rightGapM, joinKey],
  );
  if (!model) return null;
  return <ModelFurniture position={position} rotationY={rotationY} model={model} />;
}
