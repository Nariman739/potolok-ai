import * as THREE from "three";
import { getVentRingTexture } from "./lightTextures";

// Безрамочные софиты BH53 / BH10 GAP (этап 3, 04.11.2026, по фото из прайсов
// мастеров): в полотне — белая воронка без видимого кольца, полотно плавно
// уходит внутрь; лампа сидит в глубине воронки.
//   bh53 — под GX53: воронка Ø 120 → 80 мм, глубина 20 мм, в глубине матовый
//          диск Ø 72 мм, светится ровно (как таблетка GX53, но без кольца);
//   bh10 — под GU10: воронка Ø 110 → 46 мм, глубина 30 мм, в глубине маленькая
//          яркая линза Ø 36 мм в хромовом патроне.
// Воронка — усечённый конус, открытый сверху (видна только изнутри), цвет чуть
// темнее полотна: на фото стенки воронки в полутени.

interface Props {
  position: [number, number, number];
  kind: "bh53" | "bh10";
}

export const CONE = {
  bh53: { rOuter: 0.06, rInner: 0.04, depth: 0.02, lens: 0.036, chrome: false },
  bh10: { rOuter: 0.055, rInner: 0.023, depth: 0.03, lens: 0.018, chrome: true },
} as const;

export function FramelessSpot3D({ position, kind }: Props) {
  const c = CONE[kind];
  return (
    <group position={position}>
      {/* Воронка: конус от полотна (rOuter, y=0) вверх к горлу (rInner, y=depth).
          Рисуем изнутри (BackSide), цвет полотна в полутени. */}
      <mesh position={[0, c.depth / 2, 0]}>
        <cylinderGeometry args={[c.rInner, c.rOuter, c.depth, 40, 1, true]} />
        <meshStandardMaterial color="#E4E4E1" roughness={0.8} metalness={0.0} side={THREE.BackSide} />
      </mesh>
      {/* Дно горла — глухое, темнее (там корпус светильника) */}
      <mesh position={[0, c.depth - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[c.rInner, 32]} />
        <meshStandardMaterial color="#D2D2CF" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {c.chrome && (
        <mesh position={[0, c.depth - 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[c.lens, c.rInner * 0.96, 32]} />
          <meshStandardMaterial color="#C9CBCF" roughness={0.25} metalness={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Лампа — самое яркое в кадре, без тонмаппинга */}
      <mesh position={[0, c.depth - 0.003, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[c.lens, 32]} />
        <meshBasicMaterial color="#FFFFFF" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Вентиляция — теневой диффузор (этап 3, фото price-items bf8d…/17932 и
// эталоны софиты-1/-2): чёрное кольцо Ø ~100 мм, внутри белый диск заподлицо.
export function Vent3D({ position }: { position: [number, number, number] }) {
  const R = 0.052;
  return (
    <group position={position}>
      <mesh position={[0, -0.0015, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[(R + 0.006) * 2, (R + 0.006) * 2]} />
        <meshBasicMaterial map={getVentRingTexture()} transparent toneMapped={false} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* Внутри кольца — само полотно (на фото диск белый заподлицо); отдельный
          диск выше плоскости полотна не виден, а стенка просвечивала точками. */}
    </group>
  );
}
