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
      <mesh position={[0, -DROP_M / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, DROP_M, 8]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[0, -DROP_M, 0]}>
        <sphereGeometry args={[SPHERE_RADIUS_M, 32, 16]} />
        <meshStandardMaterial
          color={bulbColor}
          emissive={lightColor}
          emissiveIntensity={1.4}
          toneMapped={false}
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
