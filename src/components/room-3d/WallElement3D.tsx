import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ElementType } from "./types";
import { DOOR_HEIGHT_M, DOOR_THICKNESS_M, WINDOW_HEIGHT_M, WINDOW_SILL_M } from "./constants";
import { getStripTexture, getWindowFloorTexture, getGardinaTexture, getLightLineTexture } from "./lightTextures";
import { WINDOW_LIGHT_I, WINDOW_LIGHT_DIST, WINDOW_FLOOR_A, WINDOW_FLOOR_LEN, WINDOW_REVEAL_HEX, WINDOW_GLASS_HEX } from "./windowLight";

// Полтолщины стены (Room3D.WALL_THICKNESS = 0.06): грань интерьера на ±0.03 по z.
const WALL_HALF = 0.03;

// Ореол вдоль светящейся линии (трек/светолиния) на полотне: полоса с мягкими
// краями, AdditiveBlending (10.10.2026, по фото — у линий виден лёгкий засвет).
function LineHalo({ lengthM, widthM, opacity, color }: { lengthM: number; widthM: number; opacity: number; color: string }) {
  const strip = getStripTexture();
  return (
    <mesh position={[0, -0.003, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[lengthM + widthM * 0.9, widthM]} />
      <meshBasicMaterial color={color} map={strip} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// Полотно шторы «волна» (ripple fold): сплошная ткань с РОВНЫМИ одинаковыми
// волнами (синусоида по ширине), а не отдельные складки-«трубы». Это
// современный премиум-вид (Система «Волна»). Делаем плоскость с displacement
// по Z = sin(x), нормали пересчитываем → свет ловит гребни волн как ткань.
function WavyDrape({
  width,
  height,
  color,
  centerY,
  z,
}: {
  width: number;
  height: number;
  color: string;
  centerY: number;
  z: number;
}) {
  const geometry = useMemo(() => {
    const waveLen = 0.17; // период волны ~17 см
    const amp = 0.055; // глубина волны ~5.5 см
    const segs = Math.max(24, Math.round(width / waveLen) * 6); // гладкость
    const g = new THREE.PlaneGeometry(width, height, segs, 2);
    const pos = g.attributes.position;
    const k = (Math.PI * 2) / waveLen;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      // лёгкое затухание волны к низу (внизу складка чуть глубже) — естественнее
      const yN = (pos.getY(i) + height / 2) / height; // 0 низ .. 1 верх
      pos.setZ(i, Math.sin(x * k) * amp * (0.82 + 0.18 * (1 - yN)));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [width, height]);
  return (
    <mesh geometry={geometry} position={[0, centerY, z]}>
      <meshStandardMaterial color={color} roughness={0.96} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface WallElement3DProps {
  position: [number, number, number];
  rotationY: number;
  lengthM: number;
  ceilingM: number;
  type: ElementType;
  variant?: "ours" | "client";
  lightColor?: string;
  /** Глобальный бюджет света — если false, реальные pointLight отключены
   *  (свечение остаётся через emissive), чтобы плотная сцена не висла. */
  withLight?: boolean;
  /** Сдвиг ниши-гардины от линии элемента внутрь комнаты (для гардин у стены). */
  nicheOffsetZ?: number;
  /** Сторона интерьера в локальных координатах стены (±1). Свободные элементы — 1. */
  inwardZ?: 1 | -1;
  /** Гардина: число дорожек (1 — шторка ванны, 2 — обычная, 3 — тройная). */
  rows?: 1 | 2 | 3;
  /** Трек: накладной (рейка выступает, споты-цилиндры) или магнитный встраиваемый. */
  trackKind?: "magnetic" | "surface";
  /** Гардина: цвет канала (09.11.2026) — из поля элемента; нет — чёрная. */
  color?: "black" | "white";
}

const CURTAIN_THICKNESS_M = 0.04;
// Ткань штор на гардине: выключена (Нариман 10.10) — показываем сам карниз.
const SHOW_DRAPE = false;

// Два разных изделия (Нариман 04.11 по парe 32):
//  • «Гардина» (curtain, builtin_gardina) — обычная алюминиевая гардина,
//    УТОПЛЕННАЯ в полотно (главный эталон gardina-installed-white.jpg,
//    Нариман 04.11): канал 10–12 см шириной (по рядности) и 2,5 см глубиной, полотно
//    подходит к его краям; внутри rows+1 гребней и rows щелей; по краям
//    видна тень глубины (борта), торец открыт. Цвет чёрный (решение
//    Наримана, заметнее; выбор «чёрная/белая» — позже). → RecessedGardina3D
//    + вырез в полотне (ceilingSlots).
//  • «Подшторник»/ниша (subcurtain, профиль niche) — гипсовая ниша под штору:
//    ЧЁРНАЯ ЩЕЛЬ 10–15 см вдоль стены (эталоны ниша-1/2/3), внутри черно
//    #151515, край полотна ровный. → GardinaNiche3D + вырез в полотне.
/** Ширина канала по рядности (Нариман 04.11: реальная 10–12 см): 1 ряд — 8, 2 — 10, 3 — 12 см. */
export function gardinaWidth(rows: 1 | 2 | 3 | undefined): number {
  return rows === 3 ? 0.12 : rows === 1 ? 0.08 : 0.10;
}
export const GARDINA_DEPTH = 0.025;
/** Центр канала в 11 см от грани стены (на фото 10–12 см): полтолщины стены + 11 см. */
export const GARDINA_OFFSET = WALL_HALF + 0.11;
export const NICHE_W = 0.12;
export const NICHE_H = 0.14;
export const NICHE_OFFSET = WALL_HALF + 0.01 + NICHE_W / 2;
const GARDINA_SIDE = "#141414";
const GARDINA_SIDE_WHITE = "#BDBDB9"; // борта белого канала — светлее, но в тени
function RecessedGardina3D({ lengthM, ceilingM, offsetZ = 0, rows = 2, color = "black" }: { lengthM: number; ceilingM: number; offsetZ?: number; rows?: 1 | 2 | 3; color?: "black" | "white" }) {
  const W = gardinaWidth(rows);
  const D = GARDINA_DEPTH;
  const L = lengthM;
  const side = color === "white" ? GARDINA_SIDE_WHITE : GARDINA_SIDE;
  return (
    <group position={[0, ceilingM, offsetZ]}>
      {/* дно канала с гребнями и щелями (unlit — внутрь свет сцены не попадает); цвет изделия — из поля элемента (09.11) */}
      <mesh position={[0, D, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L + 0.01, W + 0.01]} />
        <meshBasicMaterial map={getGardinaTexture(rows, color)} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* борта — тень глубины по краям канала */}
      {[-1, 1].map((sg) => (
        <mesh key={`side-${sg}`} position={[0, D / 2, (sg * W) / 2]}>
          <boxGeometry args={[L + 0.01, D, 0.003]} />
          <meshBasicMaterial color={side} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* торцы: канал обрывается — виден его профиль */}
      {[-1, 1].map((sg) => (
        <mesh key={`cap-${sg}`} position={[(sg * (L + 0.01)) / 2, D / 2, 0]}>
          <boxGeometry args={[0.003, D, W + 0.006]} />
          <meshBasicMaterial color={side} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
function GardinaNiche3D({ lengthM, ceilingM, offsetZ = 0 }: { lengthM: number; ceilingM: number; offsetZ?: number }) {
  // Утопленная (Нариман 10–11.10): в полотне вырез (Room3D.ceilingSlots), здесь
  // сама полость — unlit, без бликов, одного тона.
  const W = NICHE_W;
  const H = NICHE_H;
  const L = lengthM;
  return (
    <group position={[0, ceilingM, offsetZ]}>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L + 0.02, W + 0.02]} />
        <meshBasicMaterial color="#151515" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((sg) => (
        <mesh key={`side-${sg}`} position={[0, H / 2, (sg * W) / 2]}>
          <boxGeometry args={[L + 0.02, H, 0.004]} />
          <meshBasicMaterial color="#151515" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[-1, 1].map((sg) => (
        <mesh key={`cap-${sg}`} position={[(sg * (L + 0.02)) / 2, H / 2, 0]}>
          <boxGeometry args={[0.004, H, W + 0.01]} />
          <meshBasicMaterial color="#151515" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
const DOOR_FRAME_W = 0.05;

export function WallElement3D({
  position,
  rotationY,
  lengthM,
  ceilingM,
  type,
  variant,
  lightColor: lightColorOverride,
  withLight = true,
  nicheOffsetZ = 0,
  inwardZ = 1,
  rows = 2,
  trackKind = "magnetic",
  color = "black",
}: WallElement3DProps) {
  const lightColor = lightColorOverride ?? "#FFE5B4";
  const emissiveColor = lightColorOverride ?? "#FFD37A";
  const floatingEmissive = lightColorOverride ?? "#FFEAB4";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {type === "door" && <Door3D lengthM={lengthM} inwardZ={inwardZ} />}
      {type === "window" && <Window3D lengthM={lengthM} inwardZ={inwardZ} />}

      {type === "curtain" && (SHOW_DRAPE ? (
        <Curtain3D lengthM={lengthM} ceilingM={ceilingM} variant={variant} type={type} />
      ) : (
        // Нариман 10.10: «гардину делай без штор, чтобы было видно саму гардину».
        // 04.11: утопленный в полотно канал с гребнями (см. выше).
        <RecessedGardina3D lengthM={lengthM} ceilingM={ceilingM} offsetZ={nicheOffsetZ} rows={rows} color={color} />
      ))}

      {type === "builtin_gardina" && (
        <RecessedGardina3D lengthM={lengthM} ceilingM={ceilingM} offsetZ={nicheOffsetZ} rows={rows} color={color} />
      )}

      {type === "subcurtain" && (
        // Подшторник — чёрная щель-ниша у стены с вырезом в полотне (эталоны
        // ниша-1/2/3). Раньше имитация цветом коробкой под полотном (02.07).
        <GardinaNiche3D lengthM={lengthM} ceilingM={ceilingM} offsetZ={nicheOffsetZ} />
      )}

      {type === "track" && (trackKind === "surface" ? <SurfaceTrack3D lengthM={lengthM} ceilingM={ceilingM} /> : <Track3D lengthM={lengthM} ceilingM={ceilingM} lightColor={lightColor} withLight={withLight} />)}

      {type === "lightline" && (
        <LightLine3D lengthM={lengthM} ceilingM={ceilingM} lightColor={lightColor} emissiveColor={emissiveColor} withLight={withLight} />
      )}

      {type === "floating" && (
        <group position={[0, ceilingM, 0]}>
          {/* Тонкий тёмный паз заподлицо с полотном (не толстый канал) */}
          <mesh position={[0, -0.013, 0]}>
            <boxGeometry args={[lengthM, 0.026, 0.055]} />
            <meshStandardMaterial color="#202024" roughness={0.6} metalness={0.15} />
          </mesh>
          {/* Яркая LED-линия вниз — ГОРИТ (парящий backlight) */}
          <mesh position={[0, -0.028, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[lengthM * 0.99, 0.055]} />
            <meshBasicMaterial color={floatingEmissive} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Ореол свечения на полотне вокруг линии (как пятно от спота) */}
          <mesh position={[0, -0.031, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[lengthM, 0.22]} />
            <meshBasicMaterial color={floatingEmissive} transparent opacity={0.16} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* Свет LED спиллит на потолок/стены (в бюджете света) */}
          {withLight && (
            <pointLight
              position={[0, -0.08, 0]}
              color={lightColor}
              intensity={1.5}
              distance={Math.max(lengthM * 0.8, 2.5)}
              decay={2}
            />
          )}
        </group>
      )}

      {type === "shower_curtain" && (
        <group>
          <mesh position={[0, ceilingM - 1.0, 0]}>
            <boxGeometry args={[lengthM, 2.0, 0.015]} />
            <meshStandardMaterial color="#BFDBFE" transparent opacity={0.42} side={THREE.DoubleSide} metalness={0.05} roughness={0.05} />
          </mesh>
          {[
            { y: ceilingM - 0.01, h: 0.02 },
            { y: ceilingM - 1.99, h: 0.02 },
          ].map((b) => (
            <mesh key={`hb-${b.y}`} position={[0, b.y, 0]}>
              <boxGeometry args={[lengthM, b.h, 0.04]} />
              <meshStandardMaterial color="#C0C0C8" roughness={0.3} metalness={0.7} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

// — Дверь. Этап 2 (по фото мастеров: окно-1, софиты-3, трек-3 — межкомнатные
//   двери в этих интерьерах белые, гладкие, с плоским наличником 7 см):
//   коробка в проёме + белое полотно без филёнок, утоплено на 1 см + наличник
//   на грани стены со стороны комнаты + маленькая тёмная ручка.
const DOOR_CASING_W = 0.07;
const DOOR_CASING_T = 0.012;
const DOOR_WHITE = "#F4F2EE";
function Door3D({ lengthM, inwardZ = 1 }: { lengthM: number; inwardZ?: number }) {
  const H = DOOR_HEIGHT_M;
  const frameD = WALL_HALF * 2 + 0.01;
  const panelW = lengthM - DOOR_FRAME_W * 2;
  const panelH = H - DOOR_FRAME_W;
  const zCasing = inwardZ * (WALL_HALF + DOOR_CASING_T / 2);
  const zPanel = -inwardZ * 0.01;
  return (
    <group>
      {/* Коробка в проёме */}
      <mesh position={[-lengthM / 2 + DOOR_FRAME_W / 2, H / 2, 0]}>
        <boxGeometry args={[DOOR_FRAME_W, H, frameD]} />
        <meshStandardMaterial color={DOOR_WHITE} roughness={0.5} metalness={0.03} />
      </mesh>
      <mesh position={[lengthM / 2 - DOOR_FRAME_W / 2, H / 2, 0]}>
        <boxGeometry args={[DOOR_FRAME_W, H, frameD]} />
        <meshStandardMaterial color={DOOR_WHITE} roughness={0.5} metalness={0.03} />
      </mesh>
      <mesh position={[0, H - DOOR_FRAME_W / 2, 0]}>
        <boxGeometry args={[lengthM, DOOR_FRAME_W, frameD]} />
        <meshStandardMaterial color={DOOR_WHITE} roughness={0.5} metalness={0.03} />
      </mesh>
      {/* Наличник на стене со стороны комнаты: две стойки + перекладина */}
      {[-1, 1].map((s) => (
        <mesh key={`cas-${s}`} position={[s * (lengthM / 2 + DOOR_CASING_W / 2 - 0.015), (H + 0.055) / 2, zCasing]}>
          <boxGeometry args={[DOOR_CASING_W, H + 0.055, DOOR_CASING_T]} />
          <meshStandardMaterial color={DOOR_WHITE} roughness={0.5} metalness={0.03} />
        </mesh>
      ))}
      <mesh position={[0, H + 0.055 - DOOR_CASING_W / 2, zCasing]}>
        <boxGeometry args={[lengthM + 2 * (DOOR_CASING_W - 0.015), DOOR_CASING_W, DOOR_CASING_T]} />
        <meshStandardMaterial color={DOOR_WHITE} roughness={0.5} metalness={0.03} />
      </mesh>
      {/* Полотно — гладкое белое, чуть темнее коробки (утоплено, в тени) */}
      <mesh position={[0, panelH / 2, zPanel]}>
        <boxGeometry args={[panelW - 0.006, panelH - 0.006, DOOR_THICKNESS_M]} />
        <meshStandardMaterial color="#EFEDE8" roughness={0.55} metalness={0.03} />
      </mesh>
      {/* Ручка — небольшая, тёмный графит, с обеих сторон */}
      {[1, -1].map((side) => (
        <group key={side} position={[panelW / 2 - 0.07, 1.02, zPanel + side * (DOOR_THICKNESS_M / 2 + 0.012)]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.01, 12]} />
            <meshStandardMaterial color="#3A3A3E" roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[-0.045, 0, side * 0.012]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.006, 0.006, 0.09, 10]} />
            <meshStandardMaterial color="#3A3A3E" roughness={0.35} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// — Окно. Этап 2 по эталону 09-окно (окно-1/-2): рама стоит в ГЛУБИНЕ проёма,
//   к ней от грани стены идут белые засвеченные откосы ~18 см, подоконник
//   на откосе; стекло днём — почти белое с голубизной, улицы не видно;
//   на полу от окна светлая трапеция со спадом за ~2 м.
const WINDOW_REVEAL = 0.18;
const WINDOW_FRAME_D = 0.06;
function Window3D({ lengthM, inwardZ = 1 }: { lengthM: number; inwardZ?: number }) {
  // Этап 5, лист 06 (08.11, вариант Б): свет от окна, трапеция на полу, откосы, стекло — windowLight.ts.
  const REVEAL_COLOR = WINDOW_REVEAL_HEX;
  const H = WINDOW_HEIGHT_M;
  const y = WINDOW_SILL_M + H / 2;
  const frameW = 0.06;
  const innerW = lengthM - frameW * 2;
  const innerH = H - frameW * 2;
  // Откос: от грани интерьера (inwardZ·WALL_HALF) до наружного края рамы.
  const zIn = inwardZ * WALL_HALF;
  const zFrame = -inwardZ * (WALL_HALF + WINDOW_REVEAL - WINDOW_FRAME_D); // центр рамы
  const zOut = zFrame - inwardZ * (WINDOW_FRAME_D / 2);
  const revealLen = Math.abs(zIn - zOut);
  const zMid = (zIn + zOut) / 2;
  const sillTop = WINDOW_SILL_M;
  const yTop = sillTop + H;
  // Трапеция света на полу: у проёма — ширина проёма, через 2,4 м — шире на 1,8 м.
  const floorGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const zN = inwardZ * (WALL_HALF + 0.01);
    const zF = inwardZ * (WALL_HALF + WINDOW_FLOOR_LEN);
    const wN = (lengthM + 0.3) / 2;
    const wF = (lengthM + 1.8 * (WINDOW_FLOOR_LEN / 2.4)) / 2;
    const pos = new Float32Array([-wN, 0, zN, wN, 0, zN, wF, 0, zF, -wF, 0, zF]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [lengthM, inwardZ]);
  useEffect(() => () => floorGeom.dispose(), [floorGeom]);
  return (
    <group>
      {/* Откосы: боковые и верхний — unlit светлые (на фото засвечены +30 %) */}
      {[-1, 1].map((s) => (
        <mesh key={`rev-${s}`} position={[s * (lengthM / 2 - 0.001), y, zMid]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[revealLen, H]} />
          <meshBasicMaterial color={REVEAL_COLOR} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, yTop - 0.001, zMid]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[lengthM, revealLen]} />
        <meshBasicMaterial color={REVEAL_COLOR} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Рама в глубине проёма */}
      <mesh position={[0, yTop - frameW / 2, zFrame]}>
        <boxGeometry args={[lengthM, frameW, WINDOW_FRAME_D]} />
        <meshStandardMaterial color="#F8F8F6" roughness={0.4} metalness={0.03} />
      </mesh>
      <mesh position={[0, sillTop + frameW / 2, zFrame]}>
        <boxGeometry args={[lengthM, frameW, WINDOW_FRAME_D]} />
        <meshStandardMaterial color="#F8F8F6" roughness={0.4} metalness={0.03} />
      </mesh>
      <mesh position={[-lengthM / 2 + frameW / 2, y, zFrame]}>
        <boxGeometry args={[frameW, H, WINDOW_FRAME_D]} />
        <meshStandardMaterial color="#F8F8F6" roughness={0.4} metalness={0.03} />
      </mesh>
      <mesh position={[lengthM / 2 - frameW / 2, y, zFrame]}>
        <boxGeometry args={[frameW, H, WINDOW_FRAME_D]} />
        <meshStandardMaterial color="#F8F8F6" roughness={0.4} metalness={0.03} />
      </mesh>
      {/* Импост (одна вертикаль — как у двустворчатого окна) */}
      <mesh position={[0, y, zFrame]}>
        <boxGeometry args={[0.04, innerH, WINDOW_FRAME_D * 0.9]} />
        <meshStandardMaterial color="#F8F8F6" roughness={0.4} metalness={0.03} />
      </mesh>
      {/* Дневной свет за стеклом: почти белый, чуть голубее к верху, без улицы */}
      <mesh position={[0, y, zFrame - inwardZ * 0.012]}>
        <planeGeometry args={[innerW + 0.2, innerH + 0.2]} />
        {/* Ровный почти белый без «неба» (лист 06): днём окно на фото всегда пересвечено. */}
        <meshBasicMaterial color={WINDOW_GLASS_HEX} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Подоконник: от рамы по откосу и на 8 см в комнату */}
      <mesh position={[0, sillTop - 0.02, (zOut + inwardZ * (WALL_HALF + 0.08)) / 2]}>
        <boxGeometry args={[lengthM + 0.08, 0.04, Math.abs(zOut - inwardZ * (WALL_HALF + 0.08))]} />
        <meshStandardMaterial color="#FAFAF8" roughness={0.4} metalness={0.03} />
      </mesh>
      <pointLight position={[0, y, inwardZ * 0.45]} color="#EEF2F8" intensity={WINDOW_LIGHT_I} distance={WINDOW_LIGHT_DIST} decay={2} />
      {/* Свет из окна на полу — трапеция, ярче у окна, плавный спад за ~3 м без контура */}
      <mesh geometry={floorGeom} position={[0, 0.006, 0]} renderOrder={2}>
        <meshBasicMaterial color="#E8EEF6" map={getWindowFloorTexture()} transparent opacity={WINDOW_FLOOR_A} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </group>
  );
}

// — Гардина: шторы во всю высоту со складками.
//   curtain          — на видимом карнизе (профиль на потолке)
//   builtin_gardina  — СКРЫТЫЙ карниз: ниша ПК-14 заподлицо, штора «из потолка»
function Curtain3D({
  lengthM,
  ceilingM,
  variant,
  type,
}: {
  lengthM: number;
  ceilingM: number;
  variant?: "ours" | "client";
  type: "curtain" | "builtin_gardina";
}) {
  const drapeColor = variant === "client" ? "#A8A29E" : "#D6BFA4";
  const isBuiltin = type === "builtin_gardina";
  // builtin: штора начинается у самого полотна (из потолка); curtain: под карнизом
  const drapeTop = ceilingM - (isBuiltin ? 0.02 : 0.09);
  const drapeH = drapeTop - 0.04; // почти до пола
  const drapeZ = isBuiltin ? 0.03 : CURTAIN_THICKNESS_M / 2 + 0.06;
  return (
    <group>
      {isBuiltin ? (
        // скрытый карниз: ниша ПК-14 заподлицо (тёмный паз вдоль стены)
        <mesh position={[0, ceilingM - 0.022, 0.05]}>
          <boxGeometry args={[lengthM, 0.044, 0.1]} />
          <meshStandardMaterial color="#15151A" roughness={0.75} metalness={0.1} />
        </mesh>
      ) : (
        // видимый карниз-профиль на потолке
        <mesh position={[0, ceilingM - 0.04, 0.06]}>
          <boxGeometry args={[lengthM, 0.05, 0.12]} />
          <meshStandardMaterial color="#3F3F46" roughness={0.4} metalness={0.5} />
        </mesh>
      )}
      {/* Сплошное полотно «волна» во всю высоту (ripple fold) */}
      <WavyDrape
        width={lengthM - 0.04}
        height={drapeH}
        color={drapeColor}
        centerY={drapeTop - drapeH / 2}
        z={drapeZ}
      />
    </group>
  );
}

// — Накладной трек (этап 3, 04.11.2026; эталоны трек-2/-3): чёрная рейка
//   ~25 мм выступает из полотна на 25 мм, на ней поворотные споты-цилиндры
//   Ø 50 мм × 80 мм (чёрные, линза снизу яркая) — один на ~0,7 м; между ними
//   рейка чёрная. Линейных модулей нет, тень от рейки на полотне не рисуем
//   (3–5 мм на фото, с 2,7 м не читается).
function SurfaceTrack3D({ lengthM, ceilingM }: { lengthM: number; ceilingM: number }) {
  const RAIL_W = 0.025;
  const RAIL_H = 0.025;
  const SPOT_R = 0.025;
  const SPOT_H = 0.08;
  const n = Math.max(1, Math.round(lengthM / 0.7));
  const seg = lengthM / n;
  const centers = Array.from({ length: n }, (_, i) => -lengthM / 2 + seg * (i + 0.5));
  return (
    <group position={[0, ceilingM, 0]}>
      <mesh position={[0, -RAIL_H / 2, 0]}>
        <boxGeometry args={[lengthM, RAIL_H, RAIL_W]} />
        <meshStandardMaterial color="#111114" metalness={0.3} roughness={0.6} />
      </mesh>
      {centers.map((cx, i) => (
        <group key={i} position={[cx, -RAIL_H, 0]}>
          {/* крепление к рейке */}
          <mesh position={[0, -0.012, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.024, 10]} />
            <meshStandardMaterial color="#111114" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* корпус спота — цилиндр, чуть наклонён вдоль рейки (поворотный) */}
          <group position={[0, -0.024 - SPOT_H / 2, 0]} rotation={[0, 0, (i % 2 === 0 ? 1 : -1) * 0.22]}>
            <mesh>
              <cylinderGeometry args={[SPOT_R, SPOT_R, SPOT_H, 20]} />
              <meshStandardMaterial color="#141418" metalness={0.35} roughness={0.5} />
            </mesh>
            <mesh position={[0, -SPOT_H / 2 - 0.0006, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[SPOT_R * 0.8, 20]} />
              <meshBasicMaterial color="#FFFFFF" toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// — Магнитный трек: тонкая ЧЁРНАЯ рейка заподлицо + СВЕТИЛЬНИКИ на ней (фото
// __potolki_astana, фидбек Наримана 29.06: «трек не просто чёрная линия, а со
// светильниками»). На рейке: длинный линейный LED-светильник (яркий брусок) +
// точечные споты, между ними видна чёрная рейка. Светильники чуть выступают и
// ярко светят.
function Track3D({ lengthM, ceilingM, lightColor, withLight }: { lengthM: number; ceilingM: number; lightColor: string; withLight: boolean }) {
  void lightColor; // трек-светильники всегда нейтрально-белые (~4000K), не по Kelvin сцены
  const NEUTRAL = "#FFF6EC";
  // Встраиваемый магнитный трек по фото (refs/magnit-trek-*, 10.10.2026): чёрная
  // рейка ~24–39 мм, в ней линейные модули-светильники, которые чуть выступают
  // вниз. Раньше рейка была плоской полоской в 1 пиксель — «пунктир с лесенкой».
  const TRACK_W = 0.03; // 20–25 мм по эталону, 30 мм в сцене — с 2,7 м 25 мм читались ниткой (ревью 03.11)
  const RAIL_H = 0.006; // рейка выступает из полотна на 6 мм
  const MOD_W = 0.022;
  const MOD_H = 0.018; // модуль ниже рейки
  const half = lengthM / 2;
  // ОДИН линейный светильник 60см на КАЖДЫЙ метр трека (фидбек Наримана).
  const fixCount = Math.max(1, Math.round(lengthM / 1.0));
  const seg = lengthM / fixCount;
  const fixLen = Math.min(0.6, seg * 0.75);
  const fixCenters = Array.from({ length: fixCount }, (_, i) => -half + seg * (i + 0.5));
  return (
    <group position={[0, ceilingM, 0]}>
      {/* Рейка: тёмная коробка с матовым дном */}
      <mesh position={[0, -RAIL_H / 2, 0]}>
        <boxGeometry args={[lengthM, RAIL_H, TRACK_W]} />
        <meshStandardMaterial color="#111114" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Паз внутри рейки — чуть темнее дна, читается как щель */}
      <mesh position={[0, -RAIL_H - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[lengthM - 0.01, TRACK_W * 0.6]} />
        <meshBasicMaterial color="#050507" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Линейные модули: корпус + светящийся рассеиватель снизу */}
      {fixCenters.map((cx, i) => (
        <group key={i} position={[cx, 0, 0]}>
          <mesh position={[0, -MOD_H / 2, 0]}>
            <boxGeometry args={[fixLen, MOD_H, MOD_W]} />
            <meshStandardMaterial color="#1A1A1E" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, -MOD_H - 0.0006, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[fixLen - 0.01, MOD_W * 0.7]} />
            <meshBasicMaterial color="#FFFFFF" toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* Засвет полотна вдоль трека запечён в карту потолка (ceilingBake.ts). */}
      {void withLight}
    </group>
  );
}

// — Световая линия: яркая полоса заподлицо с потолком
function LightLine3D({
  lengthM,
  ceilingM,
  lightColor,
  emissiveColor,
  withLight,
}: {
  lengthM: number;
  ceilingM: number;
  lightColor: string;
  emissiveColor: string;
  withLight: boolean;
}) {
  // Светолиния = линейный светильник магнитного трека, но СПЛОШНОЙ на всю длину
  // (Нариман 30.06). Тот же нейтральный #FFF6EC диффузор заподлицо в тонкой чёрной
  // рейке, 3см, полный засвет, БЕЗ свечения вокруг (ни halo, ни pointLight).
  void emissiveColor;
  void lightColor;
  void withLight;
  const LED_WIDTH = 0.04;          // 4 см (30–50 мм на рынке)
  const NEUTRAL = "#FFF6EC";       // как светильник трека (нейтр.-белый ~4000K)
  return (
    <group position={[0, ceilingM, 0]}>
      {/* Сплошной светящийся диффузор 3см на всю длину ЗАПОДЛИЦО — БЕЗ чёрной рейки
          (Нариман 30.06: «убери чёрное вокруг»). Только сама светящаяся полоса. */}
      {/* Тонкая тёмная рамка профиля по краю (на фото у линий виден торец
          профиля) — даёт чёткий край вместо «размазанного» пятна (10.10). */}
      {/* Одна плоскость с mipmap-текстурой поперёк (рамка 6 мм + диффузор 40 мм, lightTextures
          getLightLineTexture, 10.11.2026): две геометрические плоскости под острым углом издали
          рвались z-буфером и алиасингом на пунктир (ERSO, линия у стены в нижнем уровне). */}
      <mesh position={[0, -0.0008, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[lengthM * 0.99 + 0.012, LED_WIDTH + 0.012]} />
        <meshBasicMaterial map={getLightLineTexture()} toneMapped={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* Широкий засвет полотна запечён в карту (ceilingBake.ts); здесь — узкое
          плотное свечение у самой кромки. */}
      <LineHalo lengthM={lengthM} widthM={0.14} opacity={0.5} color={NEUTRAL} />
    </group>
  );
}
