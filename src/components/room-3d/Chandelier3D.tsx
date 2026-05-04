"use client";

const SPHERE_RADIUS_M = 0.2;
const DROP_M = 0.4;

interface Chandelier3DProps {
  position: [number, number, number];
  withLight: boolean;
}

export function Chandelier3D({ position, withLight }: Chandelier3DProps) {
  return (
    <group position={position}>
      <mesh position={[0, -DROP_M / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, DROP_M, 8]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[0, -DROP_M, 0]}>
        <sphereGeometry args={[SPHERE_RADIUS_M, 32, 16]} />
        <meshStandardMaterial
          color="#FFE9B0"
          emissive="#FFD37A"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      {withLight && (
        <pointLight
          position={[0, -DROP_M, 0]}
          color="#FFE5B4"
          intensity={4.5}
          distance={7}
          decay={2}
        />
      )}
    </group>
  );
}
