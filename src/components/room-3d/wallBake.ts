// Запечённая карта света на стенах (этап 4, 04.11.2026).
//
// По фото мастеров (софиты-3, окно-1, парящий-3) верх стен под софитами мягко
// светлеет: не «гребешок» от одного ближнего спота, а сумма света от всех
// ламп комнаты со спадом по расстоянию. Shadow map от каждого спота — не
// вариант (на Android и так рывки при drag, бюджет 4 источника), поэтому
// считаем на CPU один раз на стену: текстура W×H вдоль стены × по высоте,
// в каждом текселе — освещённость от софитов (широкий «ламбертов» луч вниз с
// боковой составляющей) и люстры (всенаправленная, висит на 0,75 м ниже
// полотна). Подключается как emissiveMap стены с цветом света; умножается
// на цвет стены в шейдере через emissive → остаётся матовым, тонмаппится.
//
// Этап 5, лист 02 (08.11.2026, выбор Наримана — «мягкий равномерный свет»):
//   • карта в sRGB-кодировке (устройство декодирует DataTexture как sRGB даже
//     при NoColorSpace), коэффициенты ниже — честные линейные доли;
//   • спад мягче 1/(d²+0.5), свет софита вбок 0.5 — лепестки не читаются;
//   • размытие вдоль стены 1,6 м — ряд софитов даёт ровную светлую полосу;
//   • ровная подсветка стены 0.04, чтобы стены меньше зависели от направления
//     ключевого света. Круглые пятна на середине стен давали SpotLight-конусы
//     (Scene3DNative) — сужены до 34° с мягким краем.

import * as THREE from "three";

export interface WallBakeInput {
  ax: number; az: number; bx: number; bz: number;
  len: number;
  inwardZ: number;
  /** Смещение начала стены по оси (стык в углу, Room3D.wallMeshes.u0) и полная длина с учётом стыков. */
  u0: number;
  spanLen: number;
  ceilingM: number;
  spots: Array<{ x: number; z: number }>;
  chandeliers: Array<{ x: number; z: number }>;
}

const K_SPOT = 0.3;
const K_CHAND = 0.2;
const SOFT = 0.5;
const BEAM_SIDE = 0.5;
const BLUR_M = 1.6;
const BASE = 0.04;
const CHAND_DROP = 0.75;

/** Линейная доля → байт карты в sRGB-кодировке. */
function to8(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  const e = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(255 * e);
}

export function bakeWallLight(inp: WallBakeInput): THREE.DataTexture | null {
  const W = Math.max(8, Math.min(256, Math.round(inp.spanLen * 40)));
  const H = Math.max(8, Math.min(96, Math.round(inp.ceilingM * 24)));
  const dx = (inp.bx - inp.ax) / inp.len;
  const dz = (inp.bz - inp.az) / inp.len;
  // Нормаль внутрь комнаты (см. LightPools: localZ = +1 ⇔ (−dz, dx)/len).
  const nx = -dz * inp.inwardZ;
  const nz = dx * inp.inwardZ;
  const Hm = inp.ceilingM;
  const I = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const y = ((j + 0.5) / H) * Hm;
    for (let i = 0; i < W; i++) {
      const u = inp.u0 + ((i + 0.5) / W) * inp.spanLen;
      const px = inp.ax + dx * u;
      const pz = inp.az + dz * u;
      let v = 0;
      for (const s of inp.spots) {
        const vx = s.x - px, vz = s.z - pz, vy = Hm - y;
        const d2 = vx * vx + vz * vz + vy * vy;
        const d = Math.sqrt(d2) || 0.001;
        const cosWall = (vx * nx + vz * nz) / d; // свет приходит со стороны комнаты
        if (cosWall <= 0) continue;
        const cosDown = vy / d; // угол от вертикали у лампы
        const beam = BEAM_SIDE + (1 - BEAM_SIDE) * cosDown; // линза светит и вбок
        v += (K_SPOT * beam * cosWall) / (d2 + SOFT);
      }
      for (const c of inp.chandeliers) {
        const vx = c.x - px, vz = c.z - pz, vy = Hm - CHAND_DROP - y;
        const d2 = vx * vx + vz * vz + vy * vy;
        const d = Math.sqrt(d2) || 0.001;
        const cosWall = (vx * nx + vz * nz) / d;
        if (cosWall <= 0) continue;
        v += (K_CHAND * cosWall) / (d2 + 0.3);
      }
      I[j * W + i] = v;
    }
  }
  // Размытие вдоль стены (box, ширина BLUR_M): лепестки соседних софитов
  // сливаются в ровную полосу, как на фото софиты-3.
  if (BLUR_M > 0 && (inp.spots.length > 0 || inp.chandeliers.length > 0)) {
    const r = Math.max(1, Math.round((BLUR_M / inp.spanLen) * W * 0.5));
    const row = new Float32Array(W);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let s = 0, n = 0;
        for (let k = i - r; k <= i + r; k++) {
          const kk = k < 0 ? 0 : k >= W ? W - 1 : k;
          s += I[j * W + kk]; n++;
        }
        row[i] = s / n;
      }
      I.set(row, j * W);
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const b = to8(Math.min(1, I[p] + BASE));
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = b;
    data[p * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // UV стены = координаты фигуры в метрах (u от u0 до u0+spanLen, v 0…H).
  t.repeat.set(1 / inp.spanLen, 1 / Hm);
  t.offset.set(-inp.u0 / inp.spanLen, 0);
  t.needsUpdate = true;
  return t;
}
