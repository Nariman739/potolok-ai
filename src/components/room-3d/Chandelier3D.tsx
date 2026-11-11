// Люстра: классическая подвесная — чёрный стержень от розетки, круглая
// планка, 6 рожков с белыми матовыми плафонами-шарами, которые светятся.
// Нариман 11.10: кольцевые LED (и три тонких кольца на тросах, и два плотных
// «бублика») выглядели страшно — поставлена понятная всем люстра.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getRadialTexture } from "./lightTextures";
import { DESIGN_PASS, useDesignPass } from "./designPassLook";
import { SHADE_HEX, SHADE_EMISSIVE, SHADE_ROUGH, SHADE_GLOW_A, SHADE_GLOW_SIZE_R } from "./chandelierLook";

// Ореол-биллборд (02.11.2026): THREE.Sprite на expo-gl не отрисовался, а
// горизонтальная плоскость на высоте люстры с человеческого роста видна
// почти ребром. Плоскость разворачиваем к камере в каждом кадре (demand-режим:
// кадров мало, 6 плоскостей — бесплатно).
function GlowBillboard({ position, size, map, color }: { position: [number, number, number]; size: number; map: THREE.Texture; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} position={position} renderOrder={3}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={map} color={color} transparent opacity={SHADE_GLOW_A} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

const ROD_M = 0.32; // стержень до планки
const ARM_R = 0.4; // радиус до плафонов
const ARMS = 6;
const SHADE_R = 0.075; // плафон-шар
const ARM_DROP = 0.05; // плафоны чуть ниже планки

interface Chandelier3DProps {
  position: [number, number, number];
  withLight: boolean;
  lightColor?: string;
}

export function Chandelier3D({ position, withLight, lightColor: lightColorOverride }: Chandelier3DProps) {
  void lightColorOverride;
  const FRAME = "#1A1A1A";
  // Тёплые плафоны ~3000K против нейтральных софитов (фаза 2): разница
  // температур в одном кадре — верный признак «фото», а не рендера.
  // Этап 5, лист 08 (09.11): плафон с объёмом, компактный ореол — chandelierLook.ts.
  const opal = useDesignPass("shadeOpal"); // дизайн-разбор 11.11: опал вместо персика
  const SHADE = opal ? DESIGN_PASS.shadeOpalHex : SHADE_HEX; // тёплый, против нейтральных софитов 4000K
  const angles = useMemo(() => Array.from({ length: ARMS }, (_, i) => (i / ARMS) * Math.PI * 2), []);
  // Свечение вокруг плафонов (02.11.2026): ореол-биллборд на каждом шаре —
  // без него белые шары читались пластиковыми бусинами, а не лампами.
  // Текстура radial (не glow): у glow ядро целиком закрыто самим шаром.
  const glow = getRadialTexture();

  return (
    <group position={position}>
      {/* Розетка на потолке */}
      <mesh position={[0, -0.01, 0]}>
        <cylinderGeometry args={[0.055, 0.065, 0.02, 32]} />
        <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Стержень */}
      <mesh position={[0, -ROD_M / 2, 0]}>
        <cylinderGeometry args={[0.009, 0.009, ROD_M, 12]} />
        <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Центральная планка-кольцо */}
      <mesh position={[0, -ROD_M, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ARM_R * 0.55, 0.012, 10, 48]} />
        <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, -ROD_M, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.03, 24]} />
        <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Рожки и плафоны */}
      {angles.map((a, i) => {
        const x0 = Math.cos(a) * ARM_R * 0.55;
        const z0 = Math.sin(a) * ARM_R * 0.55;
        const x1 = Math.cos(a) * ARM_R;
        const z1 = Math.sin(a) * ARM_R;
        const horiz = ARM_R - ARM_R * 0.55;
        return (
          <group key={i}>
            {/* горизонтальная спица от кольца наружу (цилиндр по Y → кладём по
                X поворотом Z на 90°, затем азимут по Y) */}
            <mesh position={[(x0 + x1) / 2, -ROD_M, (z0 + z1) / 2]} rotation={[0, -a, 0]}>
              <boxGeometry args={[horiz, 0.011, 0.011]} />
              <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.6} />
            </mesh>
            {/* короткая ножка вниз к чашке */}
            <mesh position={[x1, -ROD_M - ARM_DROP / 2, z1]}>
              <cylinderGeometry args={[0.006, 0.006, ARM_DROP, 8]} />
              <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.6} />
            </mesh>
            {/* чашка под плафоном */}
            <mesh position={[x1, -ROD_M - ARM_DROP - 0.014, z1]}>
              <cylinderGeometry args={[0.03, 0.018, 0.028, 16]} />
              <meshStandardMaterial color="#8C6A3D" roughness={0.35} metalness={0.7} />
            </mesh>
            {/* плафон-шар, светится */}
            <mesh position={[x1, -ROD_M - ARM_DROP - SHADE_R - 0.02, z1]}>
              <sphereGeometry args={[SHADE_R, 20, 14]} />
              {/* Standard + emissive (аудит): шар с лёгким объёмом, а не плоская заливка */}
              <meshStandardMaterial color={SHADE} emissive={SHADE} emissiveIntensity={opal ? DESIGN_PASS.shadeOpalEmissive : SHADE_EMISSIVE} roughness={SHADE_ROUGH} metalness={0} />
            </mesh>
            <GlowBillboard position={[x1, -ROD_M - ARM_DROP - SHADE_R - 0.02, z1]} size={SHADE_R * SHADE_GLOW_SIZE_R} map={glow} color={SHADE} />
          </group>
        );
      })}
      {void withLight}
    </group>
  );
}
