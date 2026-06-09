"use client";

const SPHERE_RADIUS_M = 0.2;
const DROP_M = 0.4;

interface Chandelier3DProps {
  position: [number, number, number];
  withLight: boolean;
  lightColor?: string;
}

export function Chandelier3D({ position, withLight, lightColor: lightColorOverride }: Chandelier3DProps) {
  const lightColor = lightColorOverride ?? "#FFE5B4";
  const bulbColor = lightColorOverride ?? "#FFE9B0";
  return (
    <group position={position}>
      {/* Розетка-крепление у потолка */}
      <mesh position={[0, -0.005, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.01, 16]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Подвес */}
      <mesh position={[0, -DROP_M / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, DROP_M, 8]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Декоративная муфта */}
      <mesh position={[0, -DROP_M + SPHERE_RADIUS_M * 0.95, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.03, 12]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Шар-плафон. emissiveIntensity снижен 1.4 → 0.7 — без раздутого
          halo вокруг люстры при Bloom. */}
      <mesh position={[0, -DROP_M, 0]}>
        <sphereGeometry args={[SPHERE_RADIUS_M, 32, 16]} />
        <meshStandardMaterial
          color={bulbColor}
          emissive={lightColor}
          emissiveIntensity={0.7}
          toneMapped={false}
          roughness={0.2}
        />
      </mesh>
      {withLight && (
        <pointLight
          position={[0, -DROP_M, 0]}
          color={lightColor}
          intensity={4.5}
          distance={7}
          decay={2}
        />
      )}
    </group>
  );
}
