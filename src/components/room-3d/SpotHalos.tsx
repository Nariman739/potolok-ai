import * as THREE from "three";
import { getGlowTexture } from "./lightTextures";
import { DESIGN_PASS } from "./designPassLook";

// Этап 2 дизайн-разбора (11.11.2026): «софит светится». На фото вокруг горящего
// софита камера даёт плотное яркое ядро у рассеивателя и короткий хвост. Здесь это
// плоский аддитивный диск ПОД полотном (лежит в плоскости потолка, без билборда и
// без useFrame — ноль работы на кадр). Плотный и короткий (≈ 2 Ø светильника), а
// не «блеск вокруг» (Нариман 30.06 — большие ореолы убраны и не возвращаются).

const geo = new THREE.PlaneGeometry(1, 1);
let mat: THREE.MeshBasicMaterial | null = null;
function haloMat(): THREE.MeshBasicMaterial {
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(DESIGN_PASS.spotGlowHex),
      transparent: true,
      opacity: DESIGN_PASS.spotGlowA,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }
  return mat;
}

export function SpotHalos({ spots }: { spots: Array<{ id: string; pos: [number, number, number]; dM: number }> }) {
  return (
    <group name="spot-halos">
      {spots.map((s) => {
        const size = s.dM * DESIGN_PASS.spotGlowSizeD;
        return (
          <mesh
            key={s.id}
            geometry={geo}
            material={haloMat()}
            position={[s.pos[0], s.pos[1] - 0.0025, s.pos[2]]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[size, size, 1]}
            renderOrder={4}
          />
        );
      })}
    </group>
  );
}
