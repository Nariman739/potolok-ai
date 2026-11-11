// Запечённая карта полотна (02.11.2026, аудит 3D — этап 2 «архитектура света»).
//
// Одна DataTexture по bbox комнаты, считается на CPU один раз на комнату
// (~40 тыс. текселей, десятки мс) и ложится на полотно как `map`. В ней:
//   • AO по расстоянию до контура — верно при любых углах стен (прежние
//     плоскости-полосы вдоль стен давали клинья и смазы в косых/вогнутых углах);
//   • ореолы софитов (радиус ~1,5 Ø, край 2 Ø) и люстры (Ø ~1,4 м, тёплый);
//   • засвет кромки полотна у парящего (+40 % на 6–8 см) и вдоль линий/трека.
// Свет становится частью шейдинга полотна: умножается на цвет, проходит
// тонмаппинг и не клиппится в белое; минус 2–3 прозрачных draw на светильник.
//
// Две текстуры (значения линейные, NoColorSpace):
//   ao   → `map` полотна: 1.0 в центре, темнее к стенам/углам (умножает цвет);
//   glow → `emissiveMap`: ореолы и засветы (прибавляются поверх освещения,
//          поэтому у лампы полотно может быть ярче любого «белого» сцены).
// Прежний вариант «база 0,7 в map + цвет ×1,43» не работал: r3f не пропускает
// компоненты цвета > 1, полотно получалось вдвое темнее (A/B 02.11).

import * as THREE from "three";
import { floatingEdge, FLOATING_EDGE_W } from "./floatingLight";
import { CHAND_CEILING_K } from "./chandelierLook";
import { LEVEL2_LOOK } from "./level2Look";

// Этап 5, лист 01 (08.11.2026, выбор Наримана — гибрид Б/А):
//   • карты пишутся в sRGB-кодировке — устройство декодирует DataTexture как
//     sRGB даже при NoColorSpace, из-за чего ореолы были в 5–10 раз слабее
//     задуманного (0.25 в карте → ~0.05 линейно), а AO глубже;
//   • ровная подсветка полотна CEILING_BASE: на фото полотно — самая светлая
//     большая поверхность, светлее стен (центр ≈ 226 sRGB против стен ≈ 214);
//   • ореол софита одиночный и слабый, +12 % на 1 Ø (без широкого слоя):
//     Нариман — «как днём при выключенном свете: ровное светлое полотно,
//     софиты видны как приборы, вокруг лишь намёк на свечение».
const CEILING_BASE = 0.16;
const SPOT_HALO_K = 0.12;
const SPOT_HALO_SIG = 1.0; // в диаметрах софита
const AO_DEPTH = 0.14;

const LONG_SIDE = 256;

export interface BakeSeg { ax: number; az: number; bx: number; bz: number }
export interface BakeInput {
  /** Контур в метрах (мировые XZ), замыкающий дубль допустим. */
  poly: Array<{ x: number; z: number }>;
  spots: Array<{ x: number; z: number; d: number }>;
  chandeliers: Array<{ x: number; z: number }>;
  /** Световые линии / трек на полотне. */
  lines: BakeSeg[];
  /** Стены с парящим профилем. */
  floating: BakeSeg[];
  /** «2 уровня» с LED: кромка верхнего полотна (отрезки, м) и полигон верха — засвет
   *  ленты ложится только на верхнее полотно (level2Look.ts). */
  ledEdges?: BakeSeg[];
  ledInside?: Array<{ x: number; z: number }>;
  /** На сколько засвет продолжается НАРУЖУ за кромку (под полку), м: граница засвета тогда не
   *  совпадает с кромкой и не даёт текстурной лесенки по дуге (полка её закрывает). */
  ledOutsideM?: number;
  spotRgb: [number, number, number];
  chandRgb: [number, number, number];
  lineRgb: [number, number, number];
  floatRgb: [number, number, number];
}

export interface BakedMap {
  ao: THREE.DataTexture;
  glow: THREE.DataTexture;
  minX: number;
  minZ: number;
  w: number;
  h: number;
}

function makeTex(data: Uint8Array, W: number, H: number, w: number, h: number, minX: number, minZ: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // UV полотна = мировые метры (ShapeGeometry) → в [0,1] по bbox.
  t.repeat.set(1 / w, 1 / h);
  t.offset.set(-minX / w, -minZ / h);
  t.needsUpdate = true;
  return t;
}

/** Линейная доля → байт карты в sRGB-кодировке (см. шапку). */
function to8(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  const e = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(255 * e);
}

// «Точка в полигоне» для засвета LED теперь считается построчно внутри bakeCeilingMap (rowCrossings/insideRow,
// та же чётность пересечений, что была в insidePoly).

function segDist(px: number, pz: number, s: BakeSeg): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = s.ax + dx * t - px;
  const qz = s.az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

export function bakeCeilingMap(inp: BakeInput): BakedMap | null {
  let poly = inp.poly;
  if (poly.length > 1 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly = poly.slice(0, -1);
  const n = poly.length;
  if (n < 3) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const w = Math.max(0.5, maxX - minX);
  const h = Math.max(0.5, maxZ - minZ);
  const W = w >= h ? LONG_SIDE : Math.max(8, Math.round((LONG_SIDE * w) / h));
  const H = h > w ? LONG_SIDE : Math.max(8, Math.round((LONG_SIDE * h) / w));

  const edges: BakeSeg[] = [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    edges.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z });
    area += p.x * q.z - q.x * p.z;
  }
  const sgn = area >= 0 ? 1 : -1;
  // Выпуклые углы (внутренний угол < 180°): там полотно темнее всего.
  const corners: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (cross * sgn > 0) corners.push(b);
  }

  const aoData = new Uint8Array(W * H * 4);
  const glowData = new Uint8Array(W * H * 4);
  const AO_D = 0.6;
  const ledEdges = inp.ledEdges ?? [];
  const ledInside = inp.ledInside && inp.ledInside.length >= 3 ? inp.ledInside : null;
  const ledOutside = Math.max(0, inp.ledOutsideM ?? 0);
  const L2 = LEVEL2_LOOK;
  // Ускорение запекания «2 уровня» (11.11.2026): у острова со скруглением R20 кромка — 76 отрезков,
  // и расстояние до каждого считалось на всех ~50 тыс. текселей (остров: 3,2 с на эмуляторе,
  // «Загружаю 3D…»). Засвет нужен только ближе REACH от кромки, поэтому:
  //   • сетка ячеек REACH × REACH по bbox карты; в ячейке — отрезки, чей bbox, расширенный на
  //     REACH, её задевает; тексель смотрит только отрезки своей ячейки. Если ближайший отрезок
  //     ближе REACH — он в ячейке, и минимум тот же самый; если нет — засвета нет в обоих
  //     вариантах. Результат карты байт в байт (проверено офлайн по 14 комнатам);
  //   • «внутри полигона верха» — пересечения рёбер со строкой считаются один раз на строку,
  //     та же арифметика, что в insidePoly (чётность пересечений правее px).
  const REACH = L2.glowLenM * 4;
  let ledGrid: BakeSeg[][] | null = null;
  let gnx = 1, gnz = 1, gcw = w, gch = h;
  if (ledEdges.length > 0) {
    gnx = Math.max(1, Math.ceil(w / REACH));
    gnz = Math.max(1, Math.ceil(h / REACH));
    gcw = w / gnx;
    gch = h / gnz;
    ledGrid = new Array(gnx * gnz);
    for (let k = 0; k < ledGrid.length; k++) ledGrid[k] = [];
    const clampI = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
    for (const s of ledEdges) {
      const ix0 = clampI(Math.floor((Math.min(s.ax, s.bx) - REACH - minX) / gcw), gnx);
      const ix1 = clampI(Math.floor((Math.max(s.ax, s.bx) + REACH - minX) / gcw), gnx);
      const iz0 = clampI(Math.floor((Math.min(s.az, s.bz) - REACH - minZ) / gch), gnz);
      const iz1 = clampI(Math.floor((Math.max(s.az, s.bz) + REACH - minZ) / gch), gnz);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) ledGrid[iz * gnx + ix].push(s);
    }
  }
  // Пересечения рёбер полигона верха с текущей строкой (x-координаты), для «внутри» по чётности.
  const rowXs: number[] = [];
  const rowCrossings = (pz: number): void => {
    rowXs.length = 0;
    if (!ledInside) return;
    const poly = ledInside;
    for (let i2 = 0, j2 = poly.length - 1; i2 < poly.length; j2 = i2++) {
      const a = poly[i2], b2 = poly[j2];
      if (a.z > pz !== b2.z > pz) rowXs.push(((b2.x - a.x) * (pz - a.z)) / (b2.z - a.z || 1e-9) + a.x);
    }
  };
  const insideRow = (px: number): boolean => {
    let inside = false;
    for (let k = 0; k < rowXs.length; k++) if (px < rowXs[k]) inside = !inside;
    return inside;
  };
  for (let y = 0; y < H; y++) {
    const pz = minZ + ((y + 0.5) * h) / H;
    rowCrossings(pz);
    const gz = ledGrid ? Math.min(gnz - 1, Math.max(0, Math.floor((pz - minZ) / gch))) : 0;
    for (let x = 0; x < W; x++) {
      const px = minX + ((x + 0.5) * w) / W;
      // AO: к стене полотно темнеет (на фото центр L* 84, дальние углы ~70).
      let d = Infinity;
      for (const e of edges) {
        const t = segDist(px, pz, e);
        if (t < d) d = t;
      }
      let ao = 1 - AO_DEPTH * Math.pow(1 - Math.min(1, d / AO_D), 1.6);
      for (const c of corners) {
        const dv = Math.hypot(px - c.x, pz - c.z);
        if (dv < 1.2) ao -= 0.08 * Math.exp(-dv / 0.3);
      }
      if (ao < 0.66) ao = 0.66;
      // Ровная подсветка полотна (см. шапку) + ореолы софитов: компактные, край на 2,5 Ø.
      let r = CEILING_BASE;
      let g = CEILING_BASE;
      let b = CEILING_BASE;
      for (const s of inp.spots) {
        const rr = Math.hypot(px - s.x, pz - s.z);
        const sig = s.d * SPOT_HALO_SIG; // Ø ≈ sigma: при 1,5 Ø ещё 10 %, при 2 Ø — 2 %
        if (rr < sig * 2.5) {
          const k = SPOT_HALO_K * Math.exp(-(rr * rr) / (sig * sig));
          r += k * inp.spotRgb[0];
          g += k * inp.spotRgb[1];
          b += k * inp.spotRgb[2];
        }
      }
      // Люстра (эталон 07): тёплое пятно Ø 1,2–1,5 м, пик CHAND_CEILING_K
      // (chandelierLook.ts; +35 % пробовали — тон-маппинг сжимает, глазом не видно).
      for (const c of inp.chandeliers) {
        const rr = Math.hypot(px - c.x, pz - c.z);
        if (rr < 1.3) {
          const k = CHAND_CEILING_K * Math.exp(-(rr * rr) / 0.36);
          r += k * inp.chandRgb[0];
          g += k * inp.chandRgb[1];
          b += k * inp.chandRgb[2];
        }
      }
      // Световые линии / трек: мягкий засвет вдоль, ширина ~12 см (0.073 = прежний
      // вид прода: 0.3 в карте до sRGB-кодировки).
      for (const s of inp.lines) {
        const t = segDist(px, pz, s);
        if (t < 0.4) {
          const k = 0.073 * Math.exp(-(t * t) / 0.0144);
          r += k * inp.lineRgb[0];
          g += k * inp.lineRgb[1];
          b += k * inp.lineRgb[2];
        }
      }
      // Парящий: кромка полотна у стены (щель светит и на полотно) — floatingLight.ts,
      // +30 % на 8 см (этап 5, лист 03).
      for (const s of inp.floating) {
        const t = segDist(px, pz, s);
        if (t < FLOATING_EDGE_W) {
          const k = floatingEdge(t);
          r += k * inp.floatRgb[0];
          g += k * inp.floatRgb[1];
          b += k * inp.floatRgb[2];
        }
      }
      // «2 уровня» с LED: лента на полке светит вверх на верхнее полотно — засвет
      // по расстоянию от кромки, только внутри полигона верха.
      if (ledGrid && ledInside) {
        let t = Infinity;
        const cell = ledGrid[gz * gnx + Math.min(gnx - 1, Math.max(0, Math.floor((px - minX) / gcw)))];
        for (let k = 0; k < cell.length; k++) {
          const d1 = segDist(px, pz, cell[k]);
          if (d1 < t) t = d1;
        }
        // Внутри полигона верха — всегда; снаружи — только под полкой (ledOutsideM):
        // жёсткая граница засвета по кромке на текселях 2 см читалась зубцами на дуге.
        if (t < REACH && (t < ledOutside || insideRow(px))) {
          // Лента нейтрально-белая (эталон asr-1: холодно-нейтральный свет), как софиты.
          const k = L2.glowK * Math.exp(-t / L2.glowLenM);
          r += k * inp.lineRgb[0];
          g += k * inp.lineRgb[1];
          b += k * inp.lineRgb[2];
        }
      }
      const i = (y * W + x) * 4;
      const a8 = to8(ao);
      aoData[i] = aoData[i + 1] = aoData[i + 2] = a8;
      aoData[i + 3] = 255;
      glowData[i] = to8(r);
      glowData[i + 1] = to8(g);
      glowData[i + 2] = to8(b);
      glowData[i + 3] = 255;
    }
  }
  return { ao: makeTex(aoData, W, H, w, h, minX, minZ), glow: makeTex(glowData, W, H, w, h, minX, minZ), minX, minZ, w, h };
}

/** hex → линейный RGB (для аддитивных ореолов карты). */
export function hexToLinearRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
