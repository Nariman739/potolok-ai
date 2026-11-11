// «Фасад шкафа (только для 3D)» — Нариман 10.11.2026.
//
// Мастер помечает целую стену контура как фасад встроенного шкафа до потолка
// (обход шкафа «бок → лицевая → бок» — три стены). Здесь — как это выглядит:
// матовый фасад заподлицо со стеной (без глубины), от пола до верха стены,
// швы створок и тёмный цоколь. Стена не режется и не двигается: это накладка
// на внутреннюю грань, как накладки AO в углах. Профиль по верху стены
// (WallTopProfile) и засветы лежат дальше от стены и остаются поверх фасада.
// Двери и окна не вырезаются: стену с проёмом мастер не помечает (решение Наримана).
//
// Рисуется в ЛОКАЛЬНЫХ координатах стены, как плинтус в Room3D: x вдоль стены
// от 0 до length, z внутрь комнаты на inwardZ, y от пола.

import { useMemo } from "react";
import * as THREE from "three";

/** Полтолщины стены — та же 6-см коробка, что в Room3D (WALL_THICKNESS / 2). */
const HALF_WALL = 0.03;
/** Фасад — на 0,8 мм от грани стены: ближе AO-накладок (2 мм) и засвета (1 мм). */
const FACADE_OFF = 0.0008;
/** Швы и цоколь — ещё на 0,4 мм ближе, чтобы не мерцали на фасаде. */
const DETAIL_OFF = 0.0012;
/** Ширина створки, к которой подгоняем число дверей (типовые 45–60 см). */
const DOOR_W = 0.55;
/** Шов 8 мм: 3 мм с 3–4 м на телефоне меньше пикселя, 6 мм рвался пунктиром (проверка 10.11). */
const SEAM_W = 0.008;
const PLINTH_H = 0.08;
/** Швы не доводим до профиля по верху стены — там свои полосы (вставка, тень). */
const SEAM_TOP_GAP = 0.06;
const FACADE_EMISSIVE = 0.22;

export function WallFacade3D({ length, heightM, inwardZ, hex }: { length: number; heightM: number; inwardZ: number; hex: string }) {
  const { seamHex, plinthHex, seams } = useMemo(() => {
    const base = new THREE.Color(hex);
    const doors = Math.max(1, Math.round(length / DOOR_W));
    return {
      seamHex: "#" + base.clone().multiplyScalar(0.5).getHexString(),
      plinthHex: "#" + base.clone().multiplyScalar(0.72).getHexString(),
      seams: Array.from({ length: doors - 1 }, (_, i) => ((i + 1) * length) / doors),
    };
  }, [hex, length]);
  if (length < 0.05 || heightM < 0.2) return null;
  const z = (off: number) => inwardZ * (HALF_WALL + off);
  const seamH = Math.max(0, heightM - PLINTH_H - SEAM_TOP_GAP);
  return (
    <group>
      <mesh position={[length / 2, heightM / 2, z(FACADE_OFF)]}>
        <planeGeometry args={[length, heightM]} />
        {/* Лёгкое собственное свечение: стены подсвечены запечённой картой, фасад без неё
            выходил на 25–30 % темнее выбранного цвета (проверка 10.11). */}
        <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={FACADE_EMISSIVE} roughness={0.72} metalness={0} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh position={[length / 2, PLINTH_H / 2, z(DETAIL_OFF)]}>
        <planeGeometry args={[length, PLINTH_H]} />
        <meshStandardMaterial color={plinthHex} roughness={0.8} metalness={0} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {seamH > 0 && seams.map((x) => (
        <mesh key={x} position={[x, PLINTH_H + seamH / 2, z(DETAIL_OFF)]}>
          <planeGeometry args={[SEAM_W, seamH]} />
          <meshBasicMaterial color={seamHex} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </group>
  );
}
