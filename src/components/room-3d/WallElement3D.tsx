"use client";

import * as THREE from "three";
import type { ElementType } from "@/lib/room-types";
import { DOOR_HEIGHT_M, DOOR_THICKNESS_M, WINDOW_HEIGHT_M, WINDOW_SILL_M } from "./constants";

interface WallElement3DProps {
  position: [number, number, number];
  rotationY: number;
  lengthM: number;
  ceilingM: number;
  type: ElementType;
  variant?: "ours" | "client";
  lightColor?: string;
}

const CURTAIN_HEIGHT_M = 0.5;
const CURTAIN_THICKNESS_M = 0.04;
const DOOR_FRAME_W = 0.05;

export function WallElement3D({
  position,
  rotationY,
  lengthM,
  ceilingM,
  type,
  variant,
  lightColor: lightColorOverride,
}: WallElement3DProps) {
  const lightColor = lightColorOverride ?? "#FFE5B4";
  const emissiveColor = lightColorOverride ?? "#FFD37A";
  const floatingEmissive = lightColorOverride ?? "#FFEAB4";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {type === "door" && <Door3D lengthM={lengthM} />}
      {type === "window" && <Window3D lengthM={lengthM} />}

      {(type === "curtain" || type === "builtin_gardina") && (
        <Curtain3D lengthM={lengthM} ceilingM={ceilingM} variant={variant} type={type} />
      )}

      {type === "subcurtain" && (
        <mesh position={[0, ceilingM - 0.025, 0]}>
          <boxGeometry args={[lengthM, 0.05, 0.08]} />
          <meshStandardMaterial color="#1F2937" roughness={0.5} metalness={0.3} />
        </mesh>
      )}

      {type === "track" && <Track3D lengthM={lengthM} ceilingM={ceilingM} lightColor={lightColor} />}

      {type === "lightline" && (
        <LightLine3D lengthM={lengthM} ceilingM={ceilingM} lightColor={lightColor} emissiveColor={emissiveColor} />
      )}

      {type === "floating" && (
        <>
          <mesh position={[0, ceilingM - 0.05, -0.05]}>
            <boxGeometry args={[lengthM, 0.012, 0.05]} />
            <meshStandardMaterial
              color="#FFEFD5"
              emissive={floatingEmissive}
              emissiveIntensity={2.0}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            position={[0, ceilingM - 0.06, -0.08]}
            color={lightColor}
            intensity={0.8}
            distance={Math.max(lengthM * 0.6, 1.5)}
            decay={2}
          />
        </>
      )}

      {type === "shower_curtain" && (
        <group>
          <mesh position={[0, ceilingM - 1.0, 0]}>
            <boxGeometry args={[lengthM, 2.0, 0.015]} />
            <meshStandardMaterial color="#BFDBFE" transparent opacity={0.42} side={THREE.DoubleSide} metalness={0.05} roughness={0.05} />
          </mesh>
          {/* Профильная рама вокруг стекла */}
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

// — Дверь: коробка с порталом + полотно с филёнками + ручка-«рычаг»
function Door3D({ lengthM }: { lengthM: number }) {
  const H = DOOR_HEIGHT_M;
  const panelW = lengthM - DOOR_FRAME_W * 2;
  const panelH = H - DOOR_FRAME_W;
  return (
    <group>
      {/* Коробка-портал: 3 части */}
      <mesh position={[-lengthM / 2 + DOOR_FRAME_W / 2, H / 2, 0]} castShadow>
        <boxGeometry args={[DOOR_FRAME_W, H, DOOR_THICKNESS_M * 2]} />
        <meshStandardMaterial color="#F4ECD8" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[lengthM / 2 - DOOR_FRAME_W / 2, H / 2, 0]} castShadow>
        <boxGeometry args={[DOOR_FRAME_W, H, DOOR_THICKNESS_M * 2]} />
        <meshStandardMaterial color="#F4ECD8" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, H - DOOR_FRAME_W / 2, 0]} castShadow>
        <boxGeometry args={[lengthM, DOOR_FRAME_W, DOOR_THICKNESS_M * 2]} />
        <meshStandardMaterial color="#F4ECD8" roughness={0.5} metalness={0.05} />
      </mesh>

      {/* Полотно */}
      <mesh position={[0, panelH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelW, panelH, DOOR_THICKNESS_M]} />
        <meshStandardMaterial color="#6B4F36" roughness={0.55} metalness={0.05} />
      </mesh>

      {/* 2 филёнки (верхняя малая + нижняя большая) */}
      {[
        { y: panelH * 0.72, h: panelH * 0.22 },
        { y: panelH * 0.28, h: panelH * 0.35 },
      ].map((p, i) => (
        <mesh key={i} position={[0, p.y, DOOR_THICKNESS_M / 2 + 0.001]}>
          <boxGeometry args={[panelW * 0.72, p.h, 0.006]} />
          <meshStandardMaterial color="#5A3F26" roughness={0.6} metalness={0.05} />
        </mesh>
      ))}

      {/* Нажимная ручка-рычаг (обе стороны двери) */}
      {[1, -1].map((side) => (
        <group key={side} position={[panelW / 2 - 0.08, 1.05, side * (DOOR_THICKNESS_M / 2 + 0.02)]}>
          {/* Розетка */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.012, 16]} />
            <meshStandardMaterial color="#9CA3AF" roughness={0.25} metalness={0.85} />
          </mesh>
          {/* Рычаг */}
          <mesh position={[-0.05, 0, side * 0.025]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.1, 12]} />
            <meshStandardMaterial color="#9CA3AF" roughness={0.25} metalness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// — Окно: рама + 4 штапика крестом + стекло + подоконник + небесный отблеск
function Window3D({ lengthM }: { lengthM: number }) {
  const H = WINDOW_HEIGHT_M;
  const y = WINDOW_SILL_M + H / 2;
  const frameW = 0.06;
  const innerW = lengthM - frameW * 2;
  const innerH = H - frameW * 2;
  return (
    <group>
      {/* Рама вокруг (4 стороны) */}
      <mesh position={[0, y + H / 2 - frameW / 2, 0]}>
        <boxGeometry args={[lengthM, frameW, DOOR_THICKNESS_M * 1.5]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[0, y - H / 2 + frameW / 2, 0]}>
        <boxGeometry args={[lengthM, frameW, DOOR_THICKNESS_M * 1.5]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[-lengthM / 2 + frameW / 2, y, 0]}>
        <boxGeometry args={[frameW, H, DOOR_THICKNESS_M * 1.5]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[lengthM / 2 - frameW / 2, y, 0]}>
        <boxGeometry args={[frameW, H, DOOR_THICKNESS_M * 1.5]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* Крестовина (импост вертикальный + горизонтальный) */}
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[0.035, innerH, DOOR_THICKNESS_M * 1.3]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[innerW, 0.035, DOOR_THICKNESS_M * 1.3]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* Стекло (полупрозрачное, голубоватое) */}
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[innerW - 0.01, innerH - 0.01, DOOR_THICKNESS_M * 0.4]} />
        <meshStandardMaterial
          color="#DCEFFB"
          transparent
          opacity={0.35}
          metalness={0.4}
          roughness={0.05}
        />
      </mesh>

      {/* Подоконник */}
      <mesh position={[0, WINDOW_SILL_M - 0.025, DOOR_THICKNESS_M * 0.8]} castShadow receiveShadow>
        <boxGeometry args={[lengthM + 0.08, 0.04, 0.2]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Лёгкое свечение от «света через окно» */}
      <pointLight position={[0, y, 0.5]} color="#E0EBFA" intensity={0.6} distance={4} decay={2} />
    </group>
  );
}

// — Карниз-гардина: настоящий профиль + 2 шторы со складками
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
  // Шторы — до пола. Раньше CURTAIN_HEIGHT_M=0.5 → висели только верхней
  // частью на 50см. Теперь от (ceilingM - 0.08) до 0.05м над полом.
  const carnizY = ceilingM - 0.04;
  const drapeTop = ceilingM - 0.08;
  const drapeBottom = 0.05;
  const drapeH = Math.max(0.3, drapeTop - drapeBottom);
  const drapeColor = variant === "client" ? "#A8A29E" : "#D6BFA4";

  const isBuiltin = type === "builtin_gardina";
  return (
    <group>
      {/* Карниз: для builtin_gardina — встроенный, для curtain — настенный.
          Z-смещение ОТРИЦАТЕЛЬНОЕ (в сторону комнаты). */}
      {!isBuiltin && (
        <mesh position={[0, carnizY, -0.06]}>
          <boxGeometry args={[lengthM, 0.05, 0.12]} />
          <meshStandardMaterial color="#3F3F46" roughness={0.4} metalness={0.5} />
        </mesh>
      )}

      {/* 2 шторы — левая и правая половины со складками. Складки чаще +
          тоньше диаметром, чтобы выглядели как ткань а не столбики. */}
      {[-1, 1].map((side) => {
        const halfW = lengthM / 2 - 0.04;
        const folds = Math.max(10, Math.round(halfW / 0.08));
        const foldW = halfW / folds;
        const baseX = side * 0.04;
        return Array.from({ length: folds }).map((_, i) => {
          const x = baseX + side * (foldW * (i + 0.5));
          return (
            <mesh key={`s-${side}-${i}`} position={[x, drapeBottom + drapeH / 2, -(CURTAIN_THICKNESS_M / 2 + 0.06)]}>
              <cylinderGeometry args={[foldW * 0.4, foldW * 0.4, drapeH, 8]} />
              <meshStandardMaterial color={drapeColor} roughness={0.95} metalness={0} />
            </mesh>
          );
        });
      })}
    </group>
  );
}

// — Магнитный трек: профильная рейка + 3-5 мини-спотов вдоль
function Track3D({ lengthM, ceilingM, lightColor }: { lengthM: number; ceilingM: number; lightColor: string }) {
  const spotCount = Math.max(3, Math.min(6, Math.round(lengthM / 0.5)));
  const spotSpan = lengthM * 0.85;
  const startX = -spotSpan / 2;
  return (
    <group>
      {/* Профиль трека — тонкий рейл */}
      <mesh position={[0, ceilingM - 0.03, 0]}>
        <boxGeometry args={[lengthM, 0.04, 0.045]} />
        <meshStandardMaterial color="#15171C" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Боковые «контакты» — тонкие медные полоски */}
      <mesh position={[0, ceilingM - 0.045, 0]}>
        <boxGeometry args={[lengthM, 0.005, 0.05]} />
        <meshStandardMaterial color="#B87333" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Мини-споты вдоль трека */}
      {Array.from({ length: spotCount }).map((_, i) => {
        const t = spotCount === 1 ? 0.5 : i / (spotCount - 1);
        const x = startX + t * spotSpan;
        return (
          <group key={i} position={[x, ceilingM - 0.06, 0]}>
            {/* Каретка */}
            <mesh position={[0, 0.005, 0]}>
              <boxGeometry args={[0.05, 0.035, 0.045]} />
              <meshStandardMaterial color="#0F1116" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Цилиндр-плафон спота */}
            <mesh position={[0, -0.035, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.05, 16]} />
              <meshStandardMaterial color="#15171C" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Стекло-свечение мини-спота на треке */}
            <mesh position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.022, 24]} />
              <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// — Световая линия: тонкая яркая полоса ЗАПОДЛИЦО с потолком (как
// прорезь). Без выступающего профиля. Референс: реальные натяжные потолки
// со встроенной LED-лентой в линию.
function LightLine3D({
  lengthM,
  ceilingM,
  lightColor,
  emissiveColor,
}: {
  lengthM: number;
  ceilingM: number;
  lightColor: string;
  emissiveColor: string;
}) {
  void emissiveColor;
  // Светящаяся LED-полоса заподлицо с потолком — выглядит как «прорезь»
  // в потолке которая светится. Без выступающего профиля.
  //
  // meshBasicMaterial гарантирует яркий цвет независимо от освещения сцены,
  // toneMapped:false — не приглушается ACES tone mapping.
  // DoubleSide — видна и сверху и снизу.
  // Белый цвет даёт максимальную яркость / контраст с потолком, а Kelvin
  // лежит на pointLight ниже (тонирует стены).
  const LED_WIDTH = 0.04;
  return (
    <group>
      <mesh position={[0, ceilingM - 0.003, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[lengthM, LED_WIDTH]} />
        <meshBasicMaterial color="#FFFFFF" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Свет вниз — тонирует ближайшую поверхность Kelvin-цветом */}
      <pointLight
        position={[0, ceilingM - 0.08, 0]}
        color={lightColor}
        intensity={0.8}
        distance={Math.max(lengthM * 0.9, 2)}
        decay={2}
      />
    </group>
  );
}
