import * as THREE from "three";

const SPOT_DIAMETER_M = 0.082;
const SPOT_DEPTH_M = 0.05;

interface Spot3DProps {
  position: [number, number, number];
  variant?: "ours" | "client";
  withLight: boolean;
  lightColor?: string;
  diameterMm?: number;
  depthMm?: number;
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
  // Лампа стаканчика — нейтрально-белая (~4000K), НЕ по тёплой температуре сцены
  // (Нариман 02.07: «а то оранжевая»). Как светильники трека/светолинии.
  void variant;
  void lightColorOverride;
  const lightColor = "#FFF6EC";
  const diameterM = typeof diameterMm === "number" && diameterMm > 0 ? diameterMm / 1000 : SPOT_DIAMETER_M;
  const depthM = typeof depthMm === "number" && depthMm > 0 ? depthMm / 1000 : SPOT_DEPTH_M;
  const r = diameterM / 2;

  return (
    <group position={position}>
      {/* Чёрная вставка-ободок (теневой): тёмное кольцо вокруг врезки —
          spot читается «утопленным» в потолок, как реальный downlight. */}
      <mesh position={[0, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.72, r * 1.18, 40]} />
        <meshStandardMaterial color="#0A0A0C" roughness={0.7} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      {/* Корпус-стакан — врезанный в потолок цилиндр, чёрный (Нариман 02.07) */}
      <mesh position={[0, -depthM / 2, 0]}>
        <cylinderGeometry args={[r, r, depthM, 24]} />
        <meshStandardMaterial color={bodyColor ?? "#0A0A0C"} metalness={0.5} roughness={0.45} />
      </mesh>
      {/* Яркая линза — meshBasic (не зависит от освещения) → всегда «горит».
          Только она показывает, что светильник включён. */}
      <mesh position={[0, -depthM - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.74, 28]} />
        <meshBasicMaterial color={lightColor} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Halo-диск и pointLight УБРАНЫ (Нариман 30.06: «убери блески вокруг,
          пусть только показывает что светит, свет вокруг не нужен»). Спот не
          разливает пятно по потолку — общий свет комнаты даёт центральная лампа. */}
      {void withLight}
    </group>
  );
}
