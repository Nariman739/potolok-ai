// Двухуровневый потолок — меши (09.11.2026). Геометрия — level2Geometry3D.ts,
// внешний вид — level2Look.ts. Нижний уровень и верхнее полотно — те же
// материал и запечённые карты, что у обычного полотна (UV = мировые метры,
// карта одна на оба уровня); борт — вертикальная лента в тени; при LED — полка
// чуть ниже верха с лентой по внешнему краю и короткий вертикальный возврат к
// кромке верхнего полотна. Без LED — борт сплошной ступенькой от низа до верха.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { pointInPolygon } from "../../lib/shared/level2-geometry";
import { ribbonGeometry, stripGeometry, type Level2Build } from "./level2Geometry3D";
import { LEVEL2_LOOK } from "./level2Look";
import { floatingWash } from "./floatingLight";
import { getProfileAlphaTextureU } from "./lightTextures";

interface Props {
  build: Level2Build;
  ceilingM: number;
  ceilingColor: string;
  ao: THREE.Texture | null;
  glow: THREE.Texture | null;
  roughness: number;
  metalness: number;
  envIntensity: number;
}

export function Level2Ceiling3D({ build, ceilingM, ceilingColor, ao, glow, roughness, metalness, envIntensity }: Props) {
  const T = LEVEL2_LOOK;
  const lift = build.led ? T.shelfLiftM : 0;
  const yLow = ceilingM - build.dropM;
  const yShelf = ceilingM - lift;

  const bortGeo = useMemo(() => ribbonGeometry(build.bortRuns, yLow, yShelf), [build, yLow, yShelf]);
  const returnGeo = useMemo(() => (build.led ? ribbonGeometry([build.upperClosed ? [...build.upperEdge, build.upperEdge[0]] : build.upperEdge], yShelf, ceilingM) : null), [build, yShelf, ceilingM]);
  // Сторона борта относительно кромки верха: +1 — налево от хода кромки, −1 — направо.
  const bortSide = useMemo((): 1 | -1 => {
    if (build.upperEdge.length < 2) return 1;
    const a = build.upperEdge[0], b = build.upperEdge[1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const mid = { x: (a[0] + b[0]) / 2 + (-dz / l) * 0.03, y: (a[1] + b[1]) / 2 + (dx / l) * 0.03 };
    const inside = pointInPolygon(mid, build.upperPolygon.map((p) => ({ x: p[0], y: p[1] })));
    return inside ? -1 : 1;
  }, [build]);
  // Лента — на полке вдоль кромки верха, со стороны борта (снаружи полигона верха).
  const ledGeo = useMemo(() => {
    if (!build.led || build.upperEdge.length < 2) return null;
    return stripGeometry(build.upperEdge, build.upperClosed, T.ledWidthM, bortSide, yShelf + 0.002);
  }, [build, yShelf, T.ledWidthM, bortSide]);
  // Засвет верхнего полотна от ленты поверх тон-маппинга: полоса от кромки внутрь верха
  // (level2Look.ts wash*, профиль floatingWash — тот же, что у парящего на стене).
  const washGeo = useMemo(() => {
    if (!build.led || build.upperEdge.length < 2) return null;
    return stripGeometry(build.upperEdge, build.upperClosed, T.washWidthM, (-bortSide) as 1 | -1, ceilingM - 0.001);
  }, [build, ceilingM, T.washWidthM, bortSide]);
  const washTex = getProfileAlphaTextureU("level2-wash", T.washWidthM, floatingWash);
  const bortColor = useMemo(() => "#" + new THREE.Color(ceilingColor).multiplyScalar(T.bortShade).getHexString(), [ceilingColor, T.bortShade]);
  // Нижний уровень чуть темнее верха (level2Look.ts lowerShade): цвет и самосвечение от карт в одной
  // пропорции, иначе на кадре оба уровня один тон и ступенька не читается (11.11.2026).
  const lowerColor = useMemo(() => "#" + new THREE.Color(ceilingColor).multiplyScalar(T.lowerShade).getHexString(), [ceilingColor, T.lowerShade]);
  const lowerEmissive = useMemo(() => "#" + new THREE.Color(ao ? "#FFFFFF" : ceilingColor).multiplyScalar(T.lowerShade).getHexString(), [ao, ceilingColor, T.lowerShade]);

  useEffect(() => () => { bortGeo.dispose(); returnGeo?.dispose(); ledGeo?.dispose(); washGeo?.dispose(); }, [bortGeo, returnGeo, ledGeo, washGeo]);

  const canvasMat = (
    <meshStandardMaterial
      color={ceilingColor}
      map={ao}
      emissive={ao ? "#FFFFFF" : ceilingColor}
      emissiveMap={glow}
      emissiveIntensity={ao ? 1 : 0.02}
      roughness={roughness}
      metalness={metalness}
      envMapIntensity={envIntensity}
      dithering
      side={THREE.DoubleSide}
    />
  );
  return (
    <group name="level2">
      {/* Нижний уровень — тот же материал и карты, что у полотна, но на lowerShade темнее. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, yLow, 0]}>
        <shapeGeometry args={[build.lowerShape]} />
        <meshStandardMaterial
          color={lowerColor}
          map={ao}
          emissive={lowerEmissive}
          emissiveMap={glow}
          emissiveIntensity={ao ? 1 : 0.02}
          roughness={roughness}
          metalness={metalness}
          envMapIntensity={envIntensity}
          dithering
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Верхнее полотно */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingM, 0]}>
        <shapeGeometry args={[build.upperShape]} />
        {canvasMat}
      </mesh>
      {/* Борт — вертикальная ступенька: матовый, темнее полотна, без карт (их UV — план). */}
      <mesh geometry={bortGeo}>
        <meshStandardMaterial color={bortColor} roughness={0.95} metalness={0} dithering side={THREE.DoubleSide} />
      </mesh>
      {build.led && build.shelfShape && (
        <>
          {/* Полка с лентой: те же карты, что у полотна (иначе без базовой подсветки
              карты она серее полотна), плюс свечение от ленты. */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, yShelf, 0]}>
            <shapeGeometry args={[build.shelfShape]} />
            <meshStandardMaterial color={ceilingColor} map={ao} emissive={ao ? "#FFFFFF" : ceilingColor} emissiveMap={glow} emissiveIntensity={(ao ? 1 : 0.02) + T.shelfEmissive} roughness={roughness} metalness={metalness} dithering side={THREE.DoubleSide} />
          </mesh>
          {returnGeo && (
            <mesh geometry={returnGeo}>
              <meshStandardMaterial color={ceilingColor} emissive={ceilingColor} emissiveIntensity={0.1 + T.shelfEmissive * 0.6} roughness={roughness} metalness={metalness} dithering side={THREE.DoubleSide} />
            </mesh>
          )}
          {ledGeo && (
            <mesh geometry={ledGeo} renderOrder={3}>
              <meshBasicMaterial color={T.ledHex} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          )}
          {washGeo && (
            <mesh geometry={washGeo} renderOrder={2}>
              <meshBasicMaterial color={T.washHex} map={washTex} transparent opacity={T.washOpacity} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
