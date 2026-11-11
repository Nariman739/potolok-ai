import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { cm2m, interiorSign, type Vertex2D } from "./types";
import { FLOOR_TEXTURES, WALL_TEXTURES, useRoomTexture } from "./textures";
import { invalidateScene, requestShadowRebake } from "./sceneInvalidate";
import { bakeWallLight } from "./wallBake";
import { bakeCeilingMap, hexToLinearRgb, type BakeSeg } from "./ceilingBake";
import { FLOOR_EDGE_AO } from "./lightBalance";
import { Level2Ceiling3D } from "./Level2Ceiling3D";
import { DESIGN_PASS, useDesignPass } from "./designPassLook";
import { level2CeilingAt, type Level2Build } from "./level2Geometry3D";
import { WallFacade3D } from "./WallFacade3D";
import { SKIRT_H, SKIRT_D, SKIRT_HEX, SKIRT_TO_WALL, INSERT_SHADOW_W, INSERT_SHADOW_GRAY, INSERT_SHADOW_A } from "./trimLook";
import { FLOOR_TINT_TO_WHITE, FLOOR_ROUGH_ADD } from "./floorLook";
import { floatingWash, FLOATING_WASH_H, FLOATING_WASH_OPACITY, FLOATING_CORE_H, FLOATING_CORE_HEX } from "./floatingLight";

// Стены — этап 5, лист 02 (08.11.2026, Нариман: «мягкий равномерный свет»).
const WALL_GRAD_BOTTOM = 0.75; // вертексный градиент: яркость у пола (верх 1)
const WALL_WARM_HEX = "#F4EDE2";
const WALL_WARM_T = 0.5;
const WALL_CORNER_AO = 0.06; // было 0.1; в показе — designPassLook.wallCornerAo

// Текстуры на expo-gl РАБОТАЮТ (проверено 09.10.2026, см. textures.ts): пол и
// стены — картинки с повтором по метрам, потолок — однотонное полотно
// (это и есть продукт) на MeshPhysicalMaterial + IBL из сцены.
// Раньше паркет рисовали ~110 мешами-планками (текстур «не было») — убрано.

export type PerimeterProfile = "none" | "galtel" | "shadow" | "insert_black" | "insert_white" | "floating" | "niche";

// Градиент прозрачности (белый RGB, альфа = v^p: 0 внизу UV → 1 вверху).
// Одна плоскость с таким map заменяет пачку полупрозрачных слоёв: свечение
// парящего (было 29 плоскостей на стену) и мягкая «тень-AO» пола у стен.
let fadeTex: THREE.DataTexture | null = null;
function getFadeTexture(): THREE.DataTexture {
  if (fadeTex) return fadeTex;
  const H = 64;
  const data = new Uint8Array(4 * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const a = Math.round(255 * Math.pow(v, 1.8));
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  const t = new THREE.DataTexture(data, 4, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  fadeTex = t;
  return t;
}

// Затемнение у края (02.11.2026): как getFadeTexture (альфа = v^1.8 к стыку),
// но ещё тает к концам по u — иначе на косых и вогнутых углах конец плоскости
// одной стены торчал на потолке/полу жёсткой прямой кромкой.
let edgeFadeTex: THREE.DataTexture | null = null;
function getEdgeFadeTexture(): THREE.DataTexture {
  if (edgeFadeTex) return edgeFadeTex;
  const W = 64;
  const H = 64;
  const data = new Uint8Array(4 * W * H);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const across = Math.pow(v, 1.8);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const e = Math.min(1, Math.min(u, 1 - u) / 0.14);
      const ends = e * e * (3 - 2 * e);
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * across * ends);
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  edgeFadeTex = t;
  return t;
}

// Линия периметра «белая вставка» (02.11.2026, ревью окна мониторинга): тонкие
// коробки/плоскости в 2–3 мм на Android без MSAA рисовались пунктиром. Теперь
// одна плоскость 4 см с RGBA-текстурой 1×64 (mipmap): белая вставка 10 мм, под
// ней тень 3 мм #6A6A6A с мягким спадом (эталон 03-вставка);
// края плоскости прозрачные — видимую линию задаёт текстура, фильтрация
// сглаживает её на любом расстоянии.
export const INSERT_PLANE_H = 0.04;
let insertTex: THREE.DataTexture | null = null;
function getInsertTexture(): THREE.DataTexture {
  if (insertTex) return insertTex;
  const N = 64;
  const data = new Uint8Array(4 * N);
  const H = INSERT_PLANE_H;
  for (let i = 0; i < N; i++) {
    const y = ((i + 0.5) / N) * H; // 0 внизу плоскости … H у потолка
    const d = H - y; // расстояние вниз от потолка
    let r = 255, g = 255, b = 255, a = 0;
    // Эталон 03 (вставка): белая 10 мм в тон полотна, читается только тенью
    // 2–3 мм #6A6A6A под ней; тёмной щели сверху на фото нет.
    // Ревью 03.11: тень 3 → 4,5 мм и темнее — на расстоянии стык читался слабо.
    // Этап 5, лист 07 (09.11): тень 6 мм #4A4A4A (trimLook.ts) — было 4,5 мм #585858.
    if (d < 0.010) { r = g = b = 0xf2; a = 1; }
    else if (d < 0.010 + INSERT_SHADOW_W) { r = g = b = INSERT_SHADOW_GRAY; a = INSERT_SHADOW_A * (1 - (d - 0.010) / INSERT_SHADOW_W); }
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = Math.round(255 * a);
  }
  const t = new THREE.DataTexture(data, 1, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  insertTex = t;
  return t;
}

// Чёрная вставка (09.11.2026, выбор цвета вставки): тёмная полоса 10 мм #262626 вплотную
// под полотном, без свечения и без тени (сама тёмная), ниже — тонкая более светлая кромка.
let insertBlackTex: THREE.DataTexture | null = null;
function getInsertBlackTexture(): THREE.DataTexture {
  if (insertBlackTex) return insertBlackTex;
  const N = 64;
  const data = new Uint8Array(4 * N);
  const H = INSERT_PLANE_H;
  for (let i = 0; i < N; i++) {
    const y = ((i + 0.5) / N) * H;
    const d = H - y;
    let r = 0x26, g = 0x26, b = 0x26, a = 0;
    if (d < 0.010) { a = 1; }
    else if (d < 0.0115) { r = g = b = 0x4a; a = 0.9 * (1 - (d - 0.010) / 0.0015); }
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = Math.round(255 * a);
  }
  const t = new THREE.DataTexture(data, 1, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  insertBlackTex = t;
  return t;
}

// Без вставки (этап 3, 04.11.2026; эталон 03 «вставка»): гарпун, щель 3–5 мм —
// едва заметная тёмно-серая линия 2–4 мм у самого полотна, не чёрная (в отличие
// от теневого), без белой полосы.
let noInsertTex: THREE.DataTexture | null = null;
function getNoInsertTexture(): THREE.DataTexture {
  if (noInsertTex) return noInsertTex;
  const N = 64;
  const data = new Uint8Array(4 * N);
  const H = INSERT_PLANE_H;
  for (let i = 0; i < N; i++) {
    const y = ((i + 0.5) / N) * H;
    const d = H - y;
    let a = 0;
    if (d < 0.003) a = 0.85;
    else if (d < 0.0045) a = 0.85 * (1 - (d - 0.003) / 0.0015);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 0x6a;
    data[i * 4 + 3] = Math.round(255 * a);
  }
  const t = new THREE.DataTexture(data, 1, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  noInsertTex = t;
  return t;
}

// Альфа-градиенты профилей (09.10.2026, по фото-референсам парящего/теневого).
// Текстура 1×N, белый RGB, альфа = fn(d), d — расстояние ОТ СТЫКА в метрах
// (v=1 у стыка, v=0 на дальнем краю плоскости длиной spanM). Пик нормирован
// к 1, итоговая сила — opacity материала. Линейные значения → NoColorSpace.
const alphaTexCache = new Map<string, THREE.DataTexture>();
function getProfileAlphaTexture(key: string, spanM: number, fn: (d: number) => number, n = 128): THREE.DataTexture {
  const cached = alphaTexCache.get(key);
  if (cached) return cached;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push(fn((1 - i / (n - 1)) * spanM));
  const peak = Math.max(...vals) || 1;
  const data = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
    data[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, vals[i] / peak)));
  }
  const t = new THREE.DataTexture(data, 1, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  alphaTexCache.set(key, t);
  return t;
}

// Цвета парящего по Кельвину (сняты по пикселям с фото): ядро у стыка почти
// белое при любой температуре (пересвет сенсора/глаза), а цвет температуры
// виден в ореоле на стене. Между опорными точками — линейная интерполяция.
const KELVIN_CORE: Array<[number, string]> = [[2700, "#FFE4C4"], [3000, "#FFEBD2"], [4000, "#FFF6EA"], [6500, "#F2F6FF"]];
// DEV-бенч запекания (см. ниже): число повторов, в проде 0.
const BAKE_BENCH_N = 0;
const KELVIN_GLOW: Array<[number, string]> = [[2700, "#FFB46B"], [3000, "#FFC285"], [4000, "#FFD9B0"], [6500, "#F0F4FF"]];
function kelvinColor(table: Array<[number, string]>, k: number): string {
  if (k <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (k <= table[i][0]) {
      const [k0, c0] = table[i - 1];
      const [k1, c1] = table[i];
      return "#" + new THREE.Color(c0).lerp(new THREE.Color(c1), (k - k0) / (k1 - k0)).getHexString();
    }
  }
  return table[table.length - 1][1];
}

// Парящий: профиль засвета стены, сила, щель и кромка полотна — floatingLight.ts
// (этап 5, лист 03; история формул 02.11 — в git).
// Теневой: тень под зазором на стене.
const SHADOW_GAP_H = 0.016; // 15–20 мм по фото (аудит 02.11)
const SHADOW_FALL_H = 0.02;
const SHADOW_FALL_A = 0.25;

// Профиль по периметру потолка вдоль одной стены (локальные координаты стены:
// x вдоль длины, интерьер комнаты в −z от лицевой грани).
//   none     — белый плинтус-карниз
//   shadow   — теневой: тонкий чёрный матовый паз у стыка (зазор ~7мм)
//   insert   — чёрная вставка: чёрная линия-вставка (чуть глянцевая)
//   floating — парящий: почти белое ядро у стыка + аддитивное свечение вниз по
//              стене + узкий ореол на полотне (3 меша, альфа из DataTexture)
//   niche    — подшторник/ЛДСП/евробрус из 2D: тёмный паз вдоль стены
function WallTopProfile({
  length,
  ceilingM,
  profile,
  glow,
  glowKelvin,
  inwardZ,
  insertEnabled = true,
  insertColor = "white",
}: {
  length: number;
  ceilingM: number;
  profile: PerimeterProfile | "niche_light";
  glow: string;
  glowKelvin: number;
  inwardZ: number;
  /** «Обычный» профиль: со вставкой (белая полоса 10 мм) или без (серая линия 3 мм). */
  insertEnabled?: boolean;
  /** Цвет вставки: белая (с тенью) или чёрная полоса 10 мм (09.11.2026). */
  insertColor?: "black" | "white";
}) {
  // z ВНУТРЬ комнаты: inwardZ * (полтолщины стены + отступ). Раньше клали на
  // -z = снаружи комнаты (невидимо). Теперь — на сторону интерьера.
  const zAt = (off: number) => inwardZ * (WALL_THICKNESS / 2 + off);
  // Обычный = белая вставка (аудит по фото 02.11): белая полоска 10 мм, над ней
  // тёмная щель 2 мм, под ней тень 3 мм #6A6A6A. Прежняя белая лента 22 мм
  // читалась как галтель — главный CG-признак наших кадров.
  if (profile === "none") {
    return (
      <mesh position={[length / 2, ceilingM - INSERT_PLANE_H / 2, zAt(0.0015)]} renderOrder={2}>
        <planeGeometry args={[length, INSERT_PLANE_H]} />
        <meshBasicMaterial map={!insertEnabled ? getNoInsertTexture() : insertColor === "black" ? getInsertBlackTexture() : getInsertTexture()} transparent toneMapped={false} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    );
  }
  // Галтель — белый потолочный плинтус (багет), скошенный профиль-фаска
  if (profile === "galtel") {
    return (
      <group>
        <mesh position={[length / 2, ceilingM - CORNICE_HEIGHT / 2, zAt(CORNICE_DEPTH / 2)]}>
          <boxGeometry args={[length, CORNICE_HEIGHT, CORNICE_DEPTH]} />
          <meshStandardMaterial color="#FCFCFA" roughness={0.5} metalness={0.04} />
        </mesh>
        {/* фаска-скос внизу багета */}
        <mesh position={[length / 2, ceilingM - CORNICE_HEIGHT + 0.012, zAt(CORNICE_DEPTH + 0.006)]} rotation={[inwardZ * Math.PI / 4, 0, 0]}>
          <boxGeometry args={[length, 0.03, 0.01]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} metalness={0.04} />
        </mesh>
      </group>
    );
  }
  // ТЕНЕВОЙ (по фото 09.10.2026): потолок «не касается» стены — вплотную под
  // полотном тёмный зазор (на фото 6 мм почти чёрный #121211, даём 9 мм: 6 мм с
  // 3 м на телефоне меньше пикселя), под ним короткая мягкая тень на стене.
  // Объёмная щель над плоскостью потолка (как было) снизу не видна — убрана.
  if (profile === "shadow") {
    const fall = getProfileAlphaTexture("shadow-fall", SHADOW_FALL_H, (d) => Math.pow(1 - d / SHADOW_FALL_H, 2));
    return (
      <group>
        {/* зазор: unlit — тёмный при любом свете, как реальная щель */}
        <mesh position={[length / 2, ceilingM - SHADOW_GAP_H / 2, zAt(0.0015)]} renderOrder={2}>
          <planeGeometry args={[length, SHADOW_GAP_H]} />
          <meshBasicMaterial color="#1C1C1C" toneMapped={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
        {/* Эталон 02 (теневой): переход резкий, без градиента ни вверх, ни вниз —
            тень на стене под зазором убрана. */}
        {void fall}
      </group>
    );
  }
  // Чёрная / белая ВСТАВКА — плоская линия-кант заподлицо (без глубины).
  if (profile === "insert_black" || profile === "insert_white") {
    const col = profile === "insert_black" ? "#2E2E2E" : "#F7F7F5";
    const rough = profile === "insert_white" ? 0.6 : 0.45;
    const metal = profile === "insert_white" ? 0.05 : 0.25;
    const h = 0.010; // тоньше (Нариман 02.07)
    return (
      <mesh position={[length / 2, ceilingM - h / 2 - 0.003, zAt(0.012)]}>
        <boxGeometry args={[length, h, 0.022]} />
        <meshStandardMaterial color={col} roughness={rough} metalness={metal} />
      </mesh>
    );
  }
  // Подшторник (ниша у стены, эталоны ниша-1/2/3): полотно обрывается ~12 см от
  // стены, в зазоре черно (#151515, unlit — внутрь свет не попадает), край
  // полотна ровный с тонкой заглушкой; у «с подсветкой» внутри тёплая LED-полоса.
  if (profile === "niche" || profile === "niche_light") {
    const w = 0.12;
    return (
      <group>
        <mesh position={[length / 2, ceilingM - 0.003, zAt(w / 2)]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[length, w]} />
          <meshBasicMaterial color="#151515" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* тонкая белая заглушка кромки полотна у щели */}
        <mesh position={[length / 2, ceilingM - 0.005, zAt(w + 0.003)]}>
          <boxGeometry args={[length, 0.006, 0.006]} />
          <meshStandardMaterial color="#F4F4F2" roughness={0.6} metalness={0.03} />
        </mesh>
        {profile === "niche_light" && (
          <mesh position={[length / 2, ceilingM - 0.004, zAt(w * 0.3)]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[length, 0.012]} />
            <meshBasicMaterial color={glow} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    );
  }
  // floating (парящий) — главный эффект: граница потолок/стена растворяется в
  // свете. Было: 9 + 20 полупрозрачных плоскостей + ядро = 30 мешей на стену
  // (overdraw и сортировка прозрачных на каждом кадре). Стало 3 меша: ядро LED,
  // ореол на полотне и заливка вниз по стене — плавность даёт градиентная
  // альфа-текстура (getFadeTexture), а не число слоёв.
  //   1) ядро — почти белая полоса 15 мм вплотную под полотном (сама щель-LED);
  //   2) свечение на стене 0,6 м, AdditiveBlending, две экспоненты (см. выше),
  //      цвет — температура; соседние стены складываются → угол ярче, как на фото;
  //   3) узкий ореол 3 см на полотне. Сам потолок НЕ подсвечиваем.
  // glow (hex из LIGHT_TEMPERATURES) больше не используется для парящего —
  // цвета берём по Кельвину из таблиц, снятых с фото.
  const core = kelvinColor(KELVIN_CORE, glowKelvin);
  const wash = kelvinColor(KELVIN_GLOW, glowKelvin);
  // ×(1−d/H)²: на дальнем краю плоскости альфа ровно 0 — иначе аддитивная
  // полоса обрывалась горизонтальной ступенькой на стене (аудит 02.11).
  // Засвет по стене (аудит 02.11, по фото): 0,6·e^(−d/0,12) + 0,4·(1−d/0,9)²
  // → 10 см ≈ 56 %, 30 см ≈ 24 %, 60 см ≈ 7 %. Ореол на полотне запечён в
  // карту потолка (ceilingBake.ts), линия — чистый белый.
  void core;
  // Формула с фото + подъём у самого стыка (0–8 см), спад до нуля к 0,9 м.
  // Плато 0,45 без спада (проба 02.11) давало жёсткую белую полосу 40 см.
  // Эталон 01: 0–10 см ≈ 100 %, 30 см ≈ 30–40 %, 60 см ≈ 10 %.
  // Этап 5, лист 03 (08.11, Нариман: «мягче и меньше ватт»): профиль, сила,
  // щель и кромка — в floatingLight.ts (общие с бортом «2 уровня»).
  const washTex = getProfileAlphaTexture("float-wash-s5", FLOATING_WASH_H, floatingWash);
  const coreH = FLOATING_CORE_H;
  return (
    <group>
      <mesh position={[length / 2, ceilingM - coreH / 2 - 0.0005, zAt(0.003)]} renderOrder={3}>
        <planeGeometry args={[length, coreH]} />
        <meshBasicMaterial color={FLOATING_CORE_HEX} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[length / 2, ceilingM - FLOATING_WASH_H / 2, zAt(0.001)]} renderOrder={2}>
        <planeGeometry args={[length, FLOATING_WASH_H]} />
        <meshBasicMaterial color={wash} map={washTex} transparent opacity={FLOATING_WASH_OPACITY} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </group>
  );
}

/** Мягкое затемнение полотна у стены: у реального мата потолок темнеет к
 *  углам, без этого он выглядит плоским и выбитым (iPhone 10.10). */
/** Трапеция AO у края (02.11.2026, аудит): полоса шириной D вдоль стены в
 *  ЛОКАЛЬНЫХ координатах стены (x вдоль, z внутрь на inwardZ), концы
 *  срезаны под углы стыка (k0/k1 = 1/tg(α/2): для прямого угла соседние
 *  полосы сходятся по диагонали, в вогнутом углу полоса удлиняется — ничего
 *  не торчит в комнату). Альфа — getFadeTexture: 1 у стены, 0 на дальнем
 *  краю, концы НЕ гасятся (угол потолка на фото — самое тёмное место). */
function edgeAoGeometry(length: number, D: number, k0: number, k1: number, inwardZ: number, y: number): THREE.BufferGeometry {
  const lim = Math.min(D * 3, length * 0.45);
  const m0 = Math.max(-lim, Math.min(lim, D * k0));
  const m1 = Math.max(-lim, Math.min(lim, D * k1));
  const z0 = inwardZ * (WALL_THICKNESS / 2);
  const z1 = inwardZ * (WALL_THICKNESS / 2 + D);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([0, y, z0, length, y, z0, length - m1, y, z1, m0, y, z1]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function CeilingEdgeAO({ length, ceilingM, inwardZ, k0, k1 }: { length: number; ceilingM: number; inwardZ: number; k0: number; k1: number }) {
  const fade = getFadeTexture();
  // 0,95 → 0,6 м (аудит: при 0,95 серые смазы на косых стыках).
  const D = 0.6;
  const geometry = useMemo(() => edgeAoGeometry(length, D, k0, k1, inwardZ, ceilingM - 0.004), [length, k0, k1, inwardZ, ceilingM]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color="#000000" map={fade} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

/** Мягкое затемнение пола у стены (контактная тень/AO) — трапеция, как у потолка. */
function FloorEdgeAO({ length, inwardZ, k0, k1 }: { length: number; inwardZ: number; k0: number; k1: number }) {
  const fade = getFadeTexture();
  const D = 0.4;
  const geometry = useMemo(() => edgeAoGeometry(length, D, k0, k1, inwardZ, 0.004), [length, k0, k1, inwardZ]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color="#000000" map={fade} transparent opacity={FLOOR_EDGE_AO} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Затемнение стены в вертикальном углу (02.11.2026): на фото стык двух стен
 *  всегда темнее середины — без этого углы комнаты «не читаются» и стены
 *  выглядят одной плоскостью. Одна плоскость на каждый конец стены, от пола
 *  до потолка, ширина W; альфа тает от стыка внутрь. */
function WallCornerAO({ ceilingM, inwardZ, atEnd, length }: { ceilingM: number; inwardZ: number; atEnd: boolean; length: number }) {
  const aoOn = useDesignPass("wallAo");
  const fade = getFadeTexture();
  const W = 0.4;
  // fade: альфа 1 вверху UV → у стыка. Плоскость в XY стены, повёрнута на ±90°
  // вокруг Z, чтобы «верх» текстуры смотрел на стык.
  const x = atEnd ? length - W / 2 : W / 2;
  return (
    <mesh position={[x, ceilingM / 2, inwardZ * (WALL_THICKNESS / 2 + 0.002)]} rotation={[0, 0, atEnd ? -Math.PI / 2 : Math.PI / 2]} renderOrder={1}>
      <planeGeometry args={[ceilingM, W]} />
      <meshBasicMaterial color="#000000" map={fade} transparent opacity={aoOn ? DESIGN_PASS.wallCornerAo : WALL_CORNER_AO} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

export interface WallCutout {
  uStart: number;
  uEnd: number;
  vBottom: number;
  vTop: number;
}

export type CeilingFinish = "matte" | "satin" | "glossy";

interface Room3DProps {
  vertices: Vertex2D[];
  ceilingHeight: number;
  centerOffset: { x: number; z: number };
  wallCutouts: WallCutout[][];
  ceilingColor: string;
  ceilingFinish: CeilingFinish;
  hideCeiling?: boolean;
  /** Пресеты пола/стен (constants.ts) — по id берётся текстура из textures.ts. */
  floorPresetId?: string;
  floorColor?: string;
  floorRoughness?: number;
  floorTileM?: number;
  wallPresetId?: string;
  wallColor?: string;
  wallRoughness?: number;
  wallTileM?: number;
  /** Профиль по периметру — один на все стены (ручной выбор в «Сцене»). */
  ceilingProfile?: PerimeterProfile;
  /** Профиль ПО СТЕНАМ из 2D (индекс = стена vertices[i]→[i+1]); перекрывает ceilingProfile. */
  wallProfileList?: Array<PerimeterProfile | "niche_light">;
  /** Цвет свечения парящего профиля (Kelvin температура) */
  ceilingGlowColor?: string;
  /** Температура света, K — цвета ядра/ореола парящего по таблицам с фото */
  ceilingGlowKelvin?: number;
  /** Ровная подсветка полотна в запечке (режим показа, designPassLook); undefined — как в проде. */
  ceilingBase?: number;
  /** Вырезы в полотне под утопленные гардины (центр, направление, размер), мировые XZ. */
  ceilingSlots?: Array<{ x: number; z: number; angle: number; lengthM: number; widthM: number }>;
  /** Вставка в комнате (этап 3): false — «без вставки», серая линия вместо белой полосы. */
  insertEnabled?: boolean;
  /** Цвет вставки (09.11): белая (как было) или чёрная полоса 10 мм. */
  insertColor?: "black" | "white";
  /** Круглые вырезы в полотне под безрамочные софиты (этап 3): центр и радиус, мировые XZ. */
  ceilingHoles?: Array<{ x: number; z: number; r: number }>;
  /** Светильники и линии для запечённой карты полотна (мировые XZ, метры). */
  bake?: { spots: Array<{ x: number; z: number; d: number }>; chandeliers: Array<{ x: number; z: number }>; lines: BakeSeg[]; spotHex: string };
  /** Двухуровневый потолок (09.11.2026): готовая геометрия из level2Geometry3D; есть — обычное полотно не рисуется. */
  level2?: Level2Build | null;
  /** «Фасад шкафа (только для 3D)» (10.11.2026): цвет фасада по индексу стены, пусто — обычная стена. */
  wallFacadeHex?: Array<string | undefined>;
}

/** Углы выреза под гардину/нишу (центр, направление, размер) → четырёхугольник в мировых XZ. */
function slotCorners(sl: { x: number; z: number; angle: number; lengthM: number; widthM: number }): Array<[number, number]> {
  const dx = Math.cos(sl.angle);
  const dz = Math.sin(sl.angle);
  const nx = -dz;
  const nz = dx;
  const L = sl.lengthM / 2;
  const W = sl.widthM / 2;
  return [
    [sl.x - dx * L - nx * W, sl.z - dz * L - nz * W],
    [sl.x + dx * L - nx * W, sl.z + dz * L - nz * W],
    [sl.x + dx * L + nx * W, sl.z + dz * L + nz * W],
    [sl.x - dx * L + nx * W, sl.z - dz * L + nz * W],
  ];
}

/** Пересечение двух выпуклых четырёхугольников (SAT по рёбрам обоих), с зазором 5 мм. */
function quadsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  const axes: Array<[number, number]> = [];
  for (const q of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = q[i];
      const n = q[(i + 1) % 4];
      axes.push([-(n[1] - p[1]), n[0] - p[0]]);
    }
  }
  for (const [ax, az] of axes) {
    const len = Math.hypot(ax, az) || 1;
    const proj = (q: Array<[number, number]>) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const [x, z] of q) {
        const d = (x * ax + z * az) / len;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      return [lo, hi];
    };
    const [alo, ahi] = proj(a);
    const [blo, bhi] = proj(b);
    if (ahi < blo + 0.005 || bhi < alo + 0.005) return false;
  }
  return true;
}

const WALL_THICKNESS = 0.06;
// Плинтус: размеры и цвет — этап 5, лист 07 (S5_TRIM; прод 8 см × 12 мм #FAFAF8).
const CORNICE_HEIGHT = 0.06;
const CORNICE_DEPTH = 0.025;

// FINISH_PARAMS для MeshPhysicalMaterial (портировано с web, research Агента C):
//   matte:  sheen → эффект ткани вместо пластика
//   satin:  лёгкий лак (clearcoat 0.3)
//   glossy: clearcoat 1.0 — отражает комнату через scene.environment (IBL)
// envIntensity работает: IBL из RoomEnvironment через PMREM (Scene3DNative).
const FINISH_PARAMS: Record<CeilingFinish, {
  roughness: number; metalness: number; envIntensity: number;
  clearcoat: number; clearcoatRoughness: number;
  sheen: number; sheenColor: string;
  reflectivity: number;
}> = {
  // Мат по фото: ровная плоскость без бликов, roughness ≈ 0.9–1.0 (референсы 10.10).
  // 02.11.2026: roughness 0.92 → 0.78, env 0.35 → 0.5 — у матового ПВХ на фото
  // есть лёгкий сатиновый отклик (светлее под углом к источнику), «мел» нет.
  matte:  { roughness: 0.82, metalness: 0.0,  envIntensity: 0.45, clearcoat: 0,   clearcoatRoughness: 1.0, sheen: 0.0,  sheenColor: "#ffffff", reflectivity: 0.1 },
  satin:  { roughness: 0.45, metalness: 0.05, envIntensity: 0.8, clearcoat: 0.3,  clearcoatRoughness: 0.4, sheen: 0.0,  sheenColor: "#ffffff", reflectivity: 0.3 },
  glossy: { roughness: 0.08, metalness: 0.0,  envIntensity: 1.4, clearcoat: 1.0,  clearcoatRoughness: 0.05, sheen: 0.0, sheenColor: "#ffffff", reflectivity: 0.6 },
};

// Своя светимость потолка — только чтобы нижняя сторона полотна не серела.
// Было 0.55 (без IBL потолок иначе был серым); со светом снизу (hemisphere
// groundColor + IBL) хватает малого значения. Потолок-продукт должен быть белым.
const CEILING_EMISSIVE = 0.02; // 0.12 выбивало потолок в белый на iPhone (10.10); 0.04 → 0.02 (02.11): свет дают ореолы ламп

export function Room3D({
  vertices,
  ceilingHeight,
  centerOffset,
  wallCutouts,
  ceilingColor,
  ceilingFinish,
  hideCeiling = false,
  floorPresetId,
  floorColor = "#D6CFC2",
  floorRoughness = 0.85,
  floorTileM = 1.6,
  wallPresetId,
  wallColor = "#F2EFEA",
  wallRoughness = 0.85,
  wallTileM = 2.4,
  ceilingProfile = "none",
  wallProfileList,
  ceilingGlowColor = "#FFE1B3",
  ceilingGlowKelvin = 4000,
  ceilingBase,
  ceilingSlots = [],
  bake,
  insertEnabled = true,
  insertColor = "white",
  ceilingHoles = [],
  level2 = null,
  wallFacadeHex,
}: Room3DProps) {
  const ceilingM = cm2m(ceilingHeight);
  const finish = FINISH_PARAMS[ceilingFinish];

  const floorTexCfg = floorPresetId ? FLOOR_TEXTURES[floorPresetId] : undefined;
  const floorTex = useRoomTexture(floorTexCfg?.mod, floorTileM);
  const wallTex = useRoomTexture(wallPresetId ? WALL_TEXTURES[wallPresetId] : undefined, wallTileM);
  // frameloop="demand": текстура догрузилась асинхронно → нужен новый кадр.
  useEffect(() => {
    // Текстура догрузилась — новый кадр и свежая тень (материал стены/пола сменился).
    requestShadowRebake(2);
  }, [floorTex, wallTex]);

  // Пол и потолок — один и тот же контур. Shape строим в (x, −z): пол
  // поворачивается на −90° по X, и точка (x, y) фигуры уходит в z = −y. Раньше
  // контур был (x, +z) → пол отражался зеркально по Z: у прямоугольника по центру
  // незаметно, а у Г-образной комнаты пол уезжал за стены (дыра в полу).
  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (vertices.length === 0) return shape;
    const v0 = vertices[0];
    shape.moveTo(cm2m(v0.x) - centerOffset.x, -(cm2m(v0.y) - centerOffset.z));
    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i];
      shape.lineTo(cm2m(v.x) - centerOffset.x, -(cm2m(v.y) - centerOffset.z));
    }
    shape.closePath();
    return shape;
  }, [vertices, centerOffset.x, centerOffset.z]);
  // Потолок поворачивается на +90° → z = +y, ему нужен контур без отражения.
  const ceilingShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (vertices.length === 0) return shape;
    const v0 = vertices[0];
    shape.moveTo(cm2m(v0.x) - centerOffset.x, cm2m(v0.y) - centerOffset.z);
    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i];
      shape.lineTo(cm2m(v.x) - centerOffset.x, cm2m(v.y) - centerOffset.z);
    }
    shape.closePath();
    // Утопленная гардина (Нариман 10.10): полотно вырезано по нише, внутри видна
    // тёмная полость (GardinaNiche3D в WallElement3D).
    // Пересекающиеся дыры ломают триангуляцию ShapeGeometry (полотно без
    // вырезов вовсе — dev-комната 04.11: подшторник и гардина на одной стене
    // с перекрытием 18 см). Такую дыру пропускаем — лучше без выреза, чем
    // без потолка.
    const placed: Array<Array<[number, number]>> = [];
    for (const sl of ceilingSlots) {
      const c = slotCorners(sl);
      if (placed.some((q) => quadsOverlap(q, c))) {
        if (__DEV__) console.log("[3D] ceiling slot skipped: overlaps another", sl);
        continue;
      }
      placed.push(c);
      const hole = new THREE.Path();
      hole.moveTo(c[0][0], c[0][1]);
      for (let i = 1; i < 4; i++) hole.lineTo(c[i][0], c[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    // Круглые вырезы под безрамочные софиты (BH53/BH10): воронка выше полотна,
    // без дыры её не видно. Пересекающиеся с чем-либо — пропускаем (та же
    // защита триангуляции), софит тогда читается только диском лампы.
    for (const h of ceilingHoles) {
      const q: Array<[number, number]> = [[h.x - h.r, h.z - h.r], [h.x + h.r, h.z - h.r], [h.x + h.r, h.z + h.r], [h.x - h.r, h.z + h.r]];
      if (placed.some((p) => quadsOverlap(p, q))) {
        if (__DEV__) console.log("[3D] ceiling hole skipped: overlaps", h);
        continue;
      }
      placed.push(q);
      const hole = new THREE.Path();
      hole.absarc(h.x, h.z, h.r, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    }
    return shape;
  }, [vertices, centerOffset.x, centerOffset.z, ceilingSlots, ceilingHoles]);

  // «2 уровня» + утопленная гардина / ниша подшторника (11.11.2026): вырез идёт в полотно
  // того уровня, на котором стоит элемент (Scene3DNative ставит канал на высоту уровня под
  // его серединой). Вырез, задевающий границу уровней (углы на разных высотах) или другой
  // вырез, пропускаем — лучше без выреза, чем сломанная триангуляция полотна. Круглые
  // вырезы под безрамочные софиты в level2-полотна не режутся (как и раньше).
  const level2Cut = useMemo((): Level2Build | null => {
    if (!level2 || ceilingSlots.length === 0) return level2;
    const lower = level2.lowerShape.clone();
    const upper = level2.upperShape.clone();
    const placed: Array<Array<[number, number]>> = [];
    let any = false;
    for (const sl of ceilingSlots) {
      const c = slotCorners(sl);
      const ys = c.map(([x, z]) => level2CeilingAt(level2, x, z, ceilingM));
      if (ys.some((y) => Math.abs(y - ys[0]) > 1e-6)) {
        if (__DEV__) console.log("[3D] level2 slot skipped: crosses level edge", sl);
        continue;
      }
      if (placed.some((q) => quadsOverlap(q, c))) {
        if (__DEV__) console.log("[3D] level2 slot skipped: overlaps another", sl);
        continue;
      }
      placed.push(c);
      const hole = new THREE.Path();
      hole.moveTo(c[0][0], c[0][1]);
      for (let i = 1; i < 4; i++) hole.lineTo(c[i][0], c[i][1]);
      hole.closePath();
      (ys[0] < ceilingM - 1e-6 ? lower : upper).holes.push(hole);
      any = true;
    }
    return any ? { ...level2, lowerShape: lower, upperShape: upper } : level2;
  }, [level2, ceilingSlots, ceilingM]);

  // Запечённая карта полотна: AO по контуру + ореолы + засвет парящего/линий.
  const baked = useMemo(() => {
    const poly = vertices.map((v) => ({ x: cm2m(v.x) - centerOffset.x, z: cm2m(v.y) - centerOffset.z }));
    const floating: BakeSeg[] = [];
    if (wallProfileList) {
      for (let i = 0; i + 1 < vertices.length; i++) {
        if (wallProfileList[i] !== "floating") continue;
        floating.push({ ax: poly[i].x, az: poly[i].z, bx: poly[i + 1].x, bz: poly[i + 1].z });
      }
    } else if (ceilingProfile === "floating") {
      for (let i = 0; i + 1 < vertices.length; i++) floating.push({ ax: poly[i].x, az: poly[i].z, bx: poly[i + 1].x, bz: poly[i + 1].z });
    }
    // «2 уровня» с LED: кромка верха → засвет верхнего полотна (level2Look.ts).
    const ledEdges: BakeSeg[] = [];
    if (level2?.led) {
      const e = level2.upperEdge;
      const n = e.length;
      for (let i = 0; i + 1 < n + (level2.upperClosed ? 1 : 0); i++) {
        const a = e[i], b = e[(i + 1) % n];
        ledEdges.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1] });
      }
    }
    const t0 = __DEV__ ? Date.now() : 0;
    const res = bakeCeilingMap({
      poly,
      spots: bake?.spots ?? [],
      chandeliers: bake?.chandeliers ?? [],
      lines: bake?.lines ?? [],
      floating,
      ledEdges,
      ledInside: level2?.led ? level2.upperPolygon.map((p) => ({ x: p[0], z: p[1] })) : undefined,
      ledOutsideM: level2?.led ? Math.max(0, level2.shelfM - 0.015) : 0,
      spotRgb: hexToLinearRgb(bake?.spotHex ?? "#FBF7F0"),
      chandRgb: hexToLinearRgb("#FFE3BF"),
      lineRgb: hexToLinearRgb("#FBF7F0"),
      floatRgb: hexToLinearRgb(kelvinColor(KELVIN_GLOW, ceilingGlowKelvin)),
      base: ceilingBase,
      spotWideK: ceilingBase === undefined ? 0 : DESIGN_PASS.ceilingGradient ? DESIGN_PASS.gradSpotK : DESIGN_PASS.showSpotWideK,
      spotWideSigM: DESIGN_PASS.ceilingGradient ? DESIGN_PASS.gradSpotSigM : DESIGN_PASS.showSpotWideSigM,
      grad: ceilingBase !== undefined && DESIGN_PASS.ceilingGradient ? DESIGN_PASS.grad : undefined,
    });
    // DEV: время запекания (11.11.2026, ускорение «2 уровня») — на JS-потоке, пока висит «Загружаю 3D…».
    if (__DEV__) console.log("[3D] bake", JSON.stringify({ ms: Date.now() - t0, w: res?.w, h: res?.h, ledEdges: ledEdges.length, level2: !!level2 }));
    // DEV-бенч запекания: BAKE_BENCH_N > 0 — ещё N запеканий подряд (одиночный холодный замер шумит ×3 от нагрузки Мака).
    if (__DEV__ && BAKE_BENCH_N > 0) {
      const ms: number[] = [];
      for (let k = 0; k < BAKE_BENCH_N; k++) {
        const t1 = Date.now();
        const r2 = bakeCeilingMap({ poly, spots: bake?.spots ?? [], chandeliers: bake?.chandeliers ?? [], lines: bake?.lines ?? [], floating, ledEdges, ledInside: level2?.led ? level2.upperPolygon.map((p) => ({ x: p[0], z: p[1] })) : undefined, ledOutsideM: level2?.led ? Math.max(0, level2.shelfM - 0.015) : 0, spotRgb: hexToLinearRgb(bake?.spotHex ?? "#FBF7F0"), chandRgb: hexToLinearRgb("#FFE3BF"), lineRgb: hexToLinearRgb("#FBF7F0"), floatRgb: hexToLinearRgb(kelvinColor(KELVIN_GLOW, ceilingGlowKelvin)) });
        ms.push(Date.now() - t1);
        r2?.ao.dispose(); r2?.glow.dispose();
      }
      console.log("[3D] bake-bench", JSON.stringify({ w: res?.w, h: res?.h, ledEdges: ledEdges.length, spots: bake?.spots.length ?? 0, lines: bake?.lines.length ?? 0, ms }));
    }
    return res;
  }, [vertices, centerOffset.x, centerOffset.z, wallProfileList, ceilingProfile, bake, ceilingGlowKelvin, level2, ceilingBase]);
  // Высота потолка у каждой стены: у стен, вдоль которых лежит нижний уровень «2 уровня», — ниже на drop.
  const wallTopM = useMemo(() => {
    const n = Math.max(0, vertices.length - 1);
    const out = new Array<number>(n).fill(ceilingM);
    if (!level2) return out;
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[i + 1];
      const mx = cm2m((a.x + b.x) / 2) - centerOffset.x, mz = cm2m((a.y + b.y) / 2) - centerOffset.z;
      out[i] = level2CeilingAt(level2, mx, mz, ceilingM);
    }
    return out;
  }, [vertices, centerOffset.x, centerOffset.z, ceilingM, level2]);
  useEffect(() => () => { baked?.ao.dispose(); baked?.glow.dispose(); }, [baked]);
  useEffect(() => { invalidateScene(); }, [baked]);
  const ceilingEdge = useMemo(() => "#" + new THREE.Color(ceilingColor).multiplyScalar(0.78).getHexString(), [ceilingColor]);

  const wallMeshes = useMemo(() => {
    const meshes: Array<{
      key: string;
      index: number;
      geometry: THREE.ExtrudeGeometry;
      position: [number, number, number];
      rotationY: number;
      length: number;
      inwardZ: number;
      /** Смещение начала стены по её оси (стык в углу, см. ниже). */
      u0: number;
      /** 1/tg(α/2) для углов в начале и конце стены (трапеции AO). */
      k0: number;
      k1: number;
    }> = [];
    const inwardAll = interiorSign(vertices);

    // Стык стен в углах (10.10.2026). Стена — коробка 6 см, центр на осевой
    // линии; в углу торцы соседних стен были видны изнутри — двойная линия в
    // каждом углу (аудит, бэклог). Теперь каждая стена у стыка удлиняется на
    // (T/2)·tan(φ/2): в вогнутом углу (внутренний угол Г-комнаты) внутренние
    // грани так сходятся ровно в точку, в выпуклом коробки перекрываются и торцы
    // прячутся внутри соседней стены. Укорачивать нельзя — в вогнутом углу
    // торец вылезал наружу (проверено на «Коридор кухня»).
    const n = vertices.length - 1; // контур замкнут дублем первой точки
    const pts = Array.from({ length: n }, (_, i) => ({ x: cm2m(vertices[i].x) - centerOffset.x, z: cm2m(vertices[i].y) - centerOffset.z }));
    const dirs = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      return { x: (q.x - p.x) / l, z: (q.z - p.z) / l, len: l };
    });
    // Смещение торца стены i у вершины i (её начало) и у вершины i+1 (конец).
    const miterAt = (v: number): number => {
      if (n < 3) return 0;
      const dPrev = dirs[(v - 1 + n) % n];
      const dNext = dirs[v % n];
      if (dPrev.len < 0.01 || dNext.len < 0.01) return 0;
      const cross = dPrev.x * dNext.z - dPrev.z * dNext.x;
      const dot = dPrev.x * dNext.x + dPrev.z * dNext.z;
      const phi = Math.atan2(Math.abs(cross), dot); // 0 — прямая, π/2 — прямой угол
      if (phi < 0.02) return 0;
      // −3 мм: при ровно T/2 торец ложится в плоскость грани соседней стены и
      // мерцает светлой полоской (z-fighting, виден с третьего ракурса).
      return Math.max(0, (WALL_THICKNESS / 2) * Math.min(3, Math.tan(phi / 2)) - 0.003);
    };
    // 1/tg(α/2) по внутреннему углу α у вершины v: выпуклый угол → полоса AO
    // укорачивается у конца (срез по биссектрисе), вогнутый → удлиняется.
    const cornerK = (v: number): number => {
      if (n < 3) return 0;
      const dPrev = dirs[(v - 1 + n) % n];
      const dNext = dirs[v % n];
      if (dPrev.len < 0.01 || dNext.len < 0.01) return 0;
      const cross = dPrev.x * dNext.z - dPrev.z * dNext.x;
      const dot = dPrev.x * dNext.x + dPrev.z * dNext.z;
      const turn = Math.atan2(Math.abs(cross), dot);
      if (turn < 0.02) return 0;
      const convex = cross * inwardAll > 0;
      const alpha = convex ? Math.PI - turn : Math.PI + turn;
      return 1 / Math.tan(alpha / 2);
    };

    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i];
      const b = vertices[i + 1];
      const ax = cm2m(a.x) - centerOffset.x;
      const az = cm2m(a.y) - centerOffset.z;
      const bx = cm2m(b.x) - centerOffset.x;
      const bz = cm2m(b.y) - centerOffset.z;
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const u0 = -miterAt(i);
      const u1 = length + miterAt(i + 1);

      const shape = new THREE.Shape();
      shape.moveTo(u0, 0);
      shape.lineTo(u1, 0);
      shape.lineTo(u1, ceilingM);
      shape.lineTo(u0, ceilingM);
      shape.closePath();

      const cutouts = wallCutouts[i] ?? [];
      for (const c of cutouts) {
        const u0 = Math.max(0.001, Math.min(length - 0.001, c.uStart));
        const u1 = Math.max(0.001, Math.min(length - 0.001, c.uEnd));
        if (u1 - u0 < 0.05) continue;
        const v0 = Math.max(0.001, c.vBottom);
        const v1 = Math.min(ceilingM - 0.001, c.vTop);
        if (v1 - v0 < 0.05) continue;
        const hole = new THREE.Path();
        hole.moveTo(u0, v0);
        hole.lineTo(u1, v0);
        hole.lineTo(u1, v1);
        hole.lineTo(u0, v1);
        hole.closePath();
        shape.holes.push(hole);
      }

      // UV лицевых граней ExtrudeGeometry = координаты фигуры в метрах (u вдоль
      // стены, v — высота) → текстура с repeat 1/tileM ложится одинаково на
      // любую длину стены.
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: WALL_THICKNESS,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -WALL_THICKNESS / 2);

      // Fake-AO вертексными цветами (02.11.2026): свет в комнате идёт с
      // потолка, стена на фото светлее вверху и темнеет к полу. Раньше верх
      // ещё и притемнялся (−0.03) — это спорило с засветом парящего.
      const posAttr = geometry.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);
      for (let v = 0; v < posAttr.count; v++) {
        const y = posAttr.getY(v);
        const up = Math.min(1, Math.max(0, y / ceilingM));
        // Этап 5, лист 02 (08.11): низ стен 0.75 (было 0.6 — стены уходили в тёмно-серый).
        const ao = WALL_GRAD_BOTTOM + (1 - WALL_GRAD_BOTTOM) * Math.pow(up, 1.5);
        colors[v * 3] = ao;
        colors[v * 3 + 1] = ao;
        colors[v * 3 + 2] = ao;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      // Сторона интерьера одна на все стены — по знаку площади контура.
      const inwardZ = inwardAll;

      meshes.push({
        key: `wall-${i}`,
        index: i,
        geometry,
        position: [ax, 0, az],
        rotationY: -Math.atan2(dz, dx),
        length: u1 - u0,
        inwardZ,
        u0,
        k0: cornerK(i),
        k1: cornerK(i + 1),
      });
    }

    return meshes;
  }, [vertices, ceilingM, centerOffset.x, centerOffset.z, wallCutouts]);
  // ExtrudeGeometry стен при смене высоты (чипы 2,5/2,7/3,0) раньше не
  // освобождалась — утечка GPU-памяти на каждое переключение (аудит 02.11).
  useEffect(() => () => { for (const w of wallMeshes) w.geometry.dispose(); }, [wallMeshes]);

  // Свет от софитов и люстры на стенах — запечённые карты (wallBake.ts, этап 4).
  const wallLight = useMemo(() => {
    const spots = bake?.spots ?? [];
    const chandeliers = bake?.chandeliers ?? [];
    return wallMeshes.map((w) => {
      const a = vertices[w.index];
      const b = vertices[w.index + 1];
      return bakeWallLight({
        ax: cm2m(a.x) - centerOffset.x, az: cm2m(a.y) - centerOffset.z,
        bx: cm2m(b.x) - centerOffset.x, bz: cm2m(b.y) - centerOffset.z,
        len: Math.hypot(cm2m(b.x - a.x), cm2m(b.y - a.y)),
        inwardZ: w.inwardZ, u0: w.u0, spanLen: w.length, ceilingM,
        spots, chandeliers,
      });
    });
  }, [wallMeshes, vertices, centerOffset.x, centerOffset.z, ceilingM, bake]);
  useEffect(() => () => { for (const t of wallLight) t?.dispose(); }, [wallLight]);
  useEffect(() => { requestShadowRebake(2); }, [wallLight]);
  const wallLightColor = bake?.spotHex ?? "#FBF7F0";
  // Этап 5, лист 02 (08.11, выбор Наримана): стены теплее и светлее — цвет пресета
  // на 50 % к #F4EDE2 (на фото окно-1 стены тёплые светлые, но темнее полотна).
  const wallColorTuned = useMemo(() => "#" + new THREE.Color(wallColor).lerp(new THREE.Color(WALL_WARM_HEX), WALL_WARM_T).getHexString(), [wallColor]);
  // Этап 5, лист 07: плинтус на 60 % в цвет стены — на фото мастеров его почти не видно.
  const plinthClean = useDesignPass("cleanLines") || DESIGN_PASS.plinthCleanAlways; // дизайн-разбор 11.11: плинтус без торца
  const skirtColor = useMemo(() => "#" + new THREE.Color(SKIRT_HEX).lerp(new THREE.Color(wallColorTuned), SKIRT_TO_WALL).getHexString(), [wallColorTuned]);

  // Тени (09.10.2026): стены и потолок тень НЕ отбрасывают. Раньше бросали, а
  // единственный теневой directional стоял снаружи сверху → весь интерьер
  // оказывался в тени потолка, и это глушили ambient 0.74 + свечением потолка
  // 0.55 (плоская серая картинка). Теперь тени дают только мебель/светильники,
  // пол и стены их принимают.
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial
          /* Пока текстура грузится (первый кадр после холодного старта) — цвет
             пресета приглушаем к серо-бежевому: насыщенный оранжевый на секунду
             в первом кадре портил впечатление (аудит 02.11). */
          key={floorTex ? "floor-tex" : "floor-flat"}
          color={floorTex ? "#" + new THREE.Color(floorTexCfg?.tint ?? "#FFFFFF").lerp(new THREE.Color("#FFFFFF"), FLOOR_TINT_TO_WHITE).getHexString() : "#" + new THREE.Color(floorColor).lerp(new THREE.Color("#D9D3CB"), 0.65).getHexString()}
          map={floorTex ?? null}
          roughness={Math.min(1, floorRoughness + FLOOR_ROUGH_ADD)}
          metalness={0.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {!hideCeiling && level2Cut && (
        <Level2Ceiling3D build={level2Cut} ceilingM={ceilingM} ceilingColor={ceilingColor} ao={baked?.ao ?? null} glow={baked?.glow ?? null} roughness={finish.roughness} metalness={finish.metalness} envIntensity={finish.envIntensity} />
      )}
      {!hideCeiling && !level2 && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingM, 0]}>
          <shapeGeometry args={[ceilingShape]} />
          {/* Полотно (10.10.2026): только матовое, MeshStandardMaterial на обеих
              платформах. Physical (clearcoat/sheen) компилировался дольше всех
              шейдеров сцены, а на мате ничего не добавлял; глянец/сатин
              отложены решением Наримана 10.10 (в продаже почти всегда мат).
              dithering — убирает полосы-кольца на плавном градиенте белого. */}
          <meshStandardMaterial
            color={ceilingColor}
            map={baked?.ao ?? null}
            emissive={baked ? "#FFFFFF" : ceilingColor}
            emissiveMap={baked?.glow ?? null}
            emissiveIntensity={baked ? 1 : CEILING_EMISSIVE}
            roughness={finish.roughness}
            metalness={finish.metalness}
            envMapIntensity={finish.envIntensity}
            dithering
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {wallMeshes.map((w, wi) => {
        const profile = wallProfileList?.[w.index] ?? ceilingProfile;
        const facadeHex = wallFacadeHex?.[w.index];
        return (
          <group key={w.key} position={w.position} rotation={[0, w.rotationY, 0]}>
            {/* Стены не принимают тень ключевого света (06.11.2026): её бросает
                только мебель, и при свете под 47° тень шкафа ложилась на соседнюю
                стену оторванной полосой. На полу тень остаётся, у стены мебель
                даёт свою мягкую контактную тень (Furniture3D). */}
            <mesh geometry={w.geometry}>
              <meshStandardMaterial
                key={wallTex ? "wall-tex" : "wall-flat"}
                color={wallColorTuned}
                map={wallTex ?? null}
                emissive={wallLight[wi] ? wallLightColor : "#000000"}
                emissiveMap={wallLight[wi] ?? null}
                emissiveIntensity={1}
                vertexColors
                roughness={wallRoughness}
                metalness={0.0}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Плинтус, тень пола, заглушка торца и профиль — по удлинённой/
                укороченной стене (u0 — смещение начала, см. wallMeshes). */}
            <group position={[w.u0, 0, 0]}>
            {/* Плинтус 6 см × 10 мм, почти в цвет стены (этап 5, лист 07; trimLook.ts) — был 8 см #FAFAF8. */}
            {/* У фасада шкафа плинтуса нет — свой цоколь в WallFacade3D. */}
            {!facadeHex && (
            plinthClean ? (
              // Дизайн-разбор 11.11: только лицевая грань. Верхний торец 1 см ловил ключевой
              // свет и давал яркую линию в 1 px, которая без MSAA рвалась в пунктир.
              <mesh position={[w.length / 2, SKIRT_H / 2, w.inwardZ * (WALL_THICKNESS / 2 + SKIRT_D)]} rotation={[0, w.inwardZ > 0 ? 0 : Math.PI, 0]}>
                <planeGeometry args={[w.length, SKIRT_H]} />
                <meshStandardMaterial color={skirtColor} roughness={0.6} metalness={0.05} side={THREE.DoubleSide} />
              </mesh>
            ) : (
            <mesh position={[w.length / 2, SKIRT_H / 2, w.inwardZ * (WALL_THICKNESS / 2 + SKIRT_D / 2)]}>
              <boxGeometry args={[w.length, SKIRT_H, SKIRT_D]} />
              <meshStandardMaterial color={skirtColor} roughness={0.6} metalness={0.05} />
            </mesh>
            )
            )}
            {facadeHex && (
              <WallFacade3D length={w.length} heightM={wallTopM[w.index] ?? ceilingM} inwardZ={w.inwardZ} hex={facadeHex} />
            )}

            <FloorEdgeAO length={w.length} inwardZ={w.inwardZ} k0={w.k0} k1={w.k1} />
            {/* AO полотна у стен — в запечённой карте (ceilingBake.ts). */}
            <WallCornerAO length={w.length} ceilingM={ceilingM} inwardZ={w.inwardZ} atEnd={false} />
            <WallCornerAO length={w.length} ceilingM={ceilingM} inwardZ={w.inwardZ} atEnd />

            {/* Заглушка торца стены у потолка: плоскость потолка доходит лишь до
                осевой линии стены — открытую полку накрываем цветом потолка. */}
            {!hideCeiling && (
              <mesh
                position={[w.length / 2, (wallTopM[w.index] ?? ceilingM) - 0.001, w.inwardZ * (WALL_THICKNESS / 2 - 0.001) / 2]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[w.length, WALL_THICKNESS / 2 + 0.008]} />
                <meshStandardMaterial color={ceilingEdge} emissive={ceilingColor} emissiveIntensity={CEILING_EMISSIVE} roughness={finish.roughness} metalness={finish.metalness} dithering side={THREE.DoubleSide} />
              </mesh>
            )}

            {!hideCeiling && (
              <WallTopProfile length={w.length} ceilingM={wallTopM[w.index] ?? ceilingM} profile={profile} glow={ceilingGlowColor} glowKelvin={ceilingGlowKelvin} inwardZ={w.inwardZ} insertEnabled={insertEnabled} insertColor={insertColor} />
            )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
