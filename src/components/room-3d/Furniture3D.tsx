"use client";

import type { FurnitureType } from "@/lib/room-types";
import { FURNITURE_3D_DIMENSIONS } from "./types";

interface Furniture3DProps {
  position: [number, number, number];
  rotationY: number;
  furnitureType: FurnitureType;
  widthM: number;
  depthM: number;
}

// Процедурная мебель из примитивов вместо одного box. Каждый тип имеет
// характерный силуэт — клиент видит «диван с подушками и спинкой», а не
// синий куб. Без GLB-моделей (нет внешних зависимостей и сетевых запросов).
export function Furniture3D({ position, rotationY, furnitureType, widthM, depthM }: Furniture3DProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <FurnitureBody type={furnitureType} widthM={widthM} depthM={depthM} />
    </group>
  );
}

function FurnitureBody({ type, widthM, depthM }: { type: FurnitureType; widthM: number; depthM: number }) {
  const dim = FURNITURE_3D_DIMENSIONS[type];
  const heightM = dim.heightCm / 100;

  switch (type) {
    case "sofa":
      return <Sofa width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "bed":
      return <Bed width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "wardrobe":
    case "wall_panel":
      return <Wardrobe width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "kitchen":
      return <Kitchen width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "table":
    case "desk":
      return <Table width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "chair":
      return <Chair width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "tv":
      return <Television width={widthM} depth={depthM} height={heightM} />;
    case "nightstand":
      return <Nightstand width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    case "radiator":
      return <Radiator width={widthM} depth={depthM} height={heightM} color={dim.color} />;
    default:
      return (
        <mesh position={[0, heightM / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshStandardMaterial color={dim.color} roughness={0.7} metalness={0.05} />
        </mesh>
      );
  }
}

// — Диван: подушки сидения + спинка + 2 подлокотника + 4 ножки
function Sofa({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const backH = height * 0.85;
  const backD = depth * 0.18;
  const armW = width * 0.08;
  const seatH = height * 0.45;
  const seatPad = 0.04;
  return (
    <group>
      {/* Ножки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`leg-${sx}-${sz}`} position={[sx * (width / 2 - 0.06), 0.04, sz * (depth / 2 - 0.06)]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.08, 8]} />
            <meshStandardMaterial color="#2A2A2A" roughness={0.4} metalness={0.7} />
          </mesh>
        )),
      )}
      {/* Основание (каркас + сидушка) */}
      <mesh position={[0, 0.08 + seatH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width - armW * 2 - seatPad, seatH, depth - seatPad]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
      </mesh>
      {/* Спинка */}
      <mesh position={[0, 0.08 + backH / 2, -(depth / 2 - backD / 2)]} castShadow receiveShadow>
        <boxGeometry args={[width, backH, backD]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
      </mesh>
      {/* Подлокотники */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`arm-${sx}`}
          position={[sx * (width / 2 - armW / 2), 0.08 + (backH * 0.7) / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[armW, backH * 0.7, depth - 0.06]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {/* Декоративные подушки */}
      {[-0.25, 0.25].map((px) => (
        <mesh key={`pillow-${px}`} position={[width * px, 0.08 + seatH + 0.06, -(depth / 2 - backD - 0.08)]} castShadow>
          <boxGeometry args={[width * 0.25, 0.12, 0.18]} />
          <meshStandardMaterial color="#BFBABA" roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// — Кровать: ножки + рама + матрас + изголовье + 2 подушки
function Bed({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const frameH = 0.18;
  const mattressH = height - frameH;
  const headboardH = height + 0.55;
  const headboardD = 0.08;
  return (
    <group>
      {/* Ножки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`leg-${sx}-${sz}`} position={[sx * (width / 2 - 0.07), 0.06, sz * (depth / 2 - 0.07)]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color="#3B2F22" roughness={0.6} metalness={0.1} />
          </mesh>
        )),
      )}
      {/* Рама */}
      <mesh position={[0, 0.12 + frameH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, frameH, depth]} />
        <meshStandardMaterial color="#5C4A33" roughness={0.7} metalness={0.05} />
      </mesh>
      {/* Матрас */}
      <mesh position={[0, 0.12 + frameH + mattressH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.04, mattressH, depth - 0.04]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
      </mesh>
      {/* Изголовье */}
      <mesh position={[0, headboardH / 2, -(depth / 2 - headboardD / 2)]} castShadow receiveShadow>
        <boxGeometry args={[width, headboardH, headboardD]} />
        <meshStandardMaterial color="#3B2F22" roughness={0.75} metalness={0.05} />
      </mesh>
      {/* Подушки */}
      {[-0.22, 0.22].map((px) => (
        <mesh
          key={`pillow-${px}`}
          position={[width * px, 0.12 + frameH + mattressH + 0.06, -(depth / 2 - 0.22)]}
          castShadow
        >
          <boxGeometry args={[width * 0.32, 0.1, 0.32]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// — Шкаф: основной корпус + вертикальные «дверцы» через врезанные пазы
function Wardrobe({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const doorCount = Math.max(2, Math.round(width / 0.6));
  const doorW = width / doorCount;
  const doorH = height - 0.06;
  return (
    <group>
      {/* Корпус */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Дверцы (тонкие panels впереди) */}
      {Array.from({ length: doorCount }).map((_, i) => {
        const x = -width / 2 + doorW * (i + 0.5);
        return (
          <group key={i}>
            <mesh position={[x, height / 2, depth / 2 + 0.002]} castShadow>
              <boxGeometry args={[doorW - 0.015, doorH, 0.005]} />
              <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
            </mesh>
            {/* Ручка */}
            <mesh position={[x + doorW * 0.35, height / 2, depth / 2 + 0.015]} castShadow>
              <cylinderGeometry args={[0.008, 0.008, 0.08, 8]} />
              <meshStandardMaterial color="#3F3F46" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// — Кухня: нижний ряд + столешница + верхний ряд (если высота позволяет)
function Kitchen({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const bottomH = 0.85;
  const countertopH = 0.04;
  const upperGap = 0.5;
  const upperH = Math.min(0.7, Math.max(0.3, height - bottomH - countertopH - upperGap - 0.05));
  return (
    <group>
      {/* Нижний шкаф */}
      <mesh position={[0, bottomH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, bottomH, depth]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} />
      </mesh>
      {/* Столешница */}
      <mesh position={[0, bottomH + countertopH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.04, countertopH, depth + 0.04]} />
        <meshStandardMaterial color="#3F3F46" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Верхний шкаф */}
      {height > bottomH + countertopH + upperGap + 0.1 && (
        <mesh
          position={[0, bottomH + countertopH + upperGap + upperH / 2, -(depth * 0.1)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, upperH, depth * 0.65]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} />
        </mesh>
      )}
      {/* Фартук между столешницей и верхним шкафом */}
      {height > bottomH + countertopH + 0.1 && (
        <mesh
          position={[0, bottomH + countertopH + upperGap / 2, -(depth / 2) + 0.005]}
          receiveShadow
        >
          <boxGeometry args={[width - 0.02, upperGap, 0.005]} />
          <meshStandardMaterial color="#E5E7EB" roughness={0.2} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}

// — Стол: столешница + 4 ножки
function Table({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const topH = 0.04;
  const legW = 0.05;
  return (
    <group>
      <mesh position={[0, height - topH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, topH, depth]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`leg-${sx}-${sz}`}
            position={[sx * (width / 2 - legW), (height - topH) / 2, sz * (depth / 2 - legW)]}
            castShadow
          >
            <boxGeometry args={[legW, height - topH, legW]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
          </mesh>
        )),
      )}
    </group>
  );
}

// — Стул: сиденье + спинка + 4 ножки
function Chair({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const seatH = 0.45;
  const seatThick = 0.04;
  const backH = height - seatH;
  return (
    <group>
      {/* Ножки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`leg-${sx}-${sz}`}
            position={[sx * (width / 2 - 0.03), seatH / 2, sz * (depth / 2 - 0.03)]}
            castShadow
          >
            <boxGeometry args={[0.03, seatH, 0.03]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
          </mesh>
        )),
      )}
      {/* Сиденье */}
      <mesh position={[0, seatH + seatThick / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, seatThick, depth]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
      </mesh>
      {/* Спинка */}
      <mesh position={[0, seatH + backH / 2, -(depth / 2 - 0.025)]} castShadow receiveShadow>
        <boxGeometry args={[width, backH, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}

// — ТВ: тонкий чёрный экран с обводкой на подставке
function Television({ width, depth, height }: { width: number; depth: number; height: number }) {
  const screenThick = 0.04;
  return (
    <group>
      {/* Подставка */}
      <mesh position={[0, 0.025, 0]} castShadow>
        <boxGeometry args={[width * 0.4, 0.05, depth * 0.5]} />
        <meshStandardMaterial color="#1F2937" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Стойка */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, height, 8]} />
        <meshStandardMaterial color="#1F2937" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Экран */}
      <mesh position={[0, height * 0.7, 0]} castShadow>
        <boxGeometry args={[width, height * 0.6, screenThick]} />
        <meshStandardMaterial color="#0A0A0A" roughness={0.2} metalness={0.3} />
      </mesh>
    </group>
  );
}

// — Тумба: компактный шкафчик с одной полкой
function Nightstand({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Линия дверцы (фронт) */}
      <mesh position={[0, height * 0.45, depth / 2 + 0.003]} receiveShadow>
        <boxGeometry args={[width - 0.04, height * 0.4, 0.004]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Ручка */}
      <mesh position={[width * 0.3, height * 0.45, depth / 2 + 0.015]} castShadow>
        <cylinderGeometry args={[0.007, 0.007, 0.05, 8]} />
        <meshStandardMaterial color="#3F3F46" roughness={0.3} metalness={0.8} />
      </mesh>
    </group>
  );
}

// — Батарея: вертикальные секции
function Radiator({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  const sections = Math.max(4, Math.round(width / 0.08));
  const sectionW = width / sections;
  return (
    <group>
      {Array.from({ length: sections }).map((_, i) => (
        <mesh
          key={i}
          position={[-width / 2 + sectionW * (i + 0.5), height / 2 + 0.1, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[sectionW - 0.005, height, depth]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}
