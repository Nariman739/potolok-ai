import React from "react";
import { Svg, Path, Circle, Rect } from "@react-pdf/renderer";
import type { RoomDesignerData } from "../pdf-data";

// Мини-схема комнаты для PDF. Рисует полигон стен (по walls + angles)
// и поверх — точки софитов, люстр, гардин из elements.
// Данные приходят с замера (Room Designer в web/mobile).
// Если данных нет — компонент возвращает null.

type Props = {
  designerData: RoomDesignerData;
  size: number; // ширина/высота квадрата в pt
  fillColor: string;
  strokeColor: string;
  spotColor: string;
  chandelierColor: string;
};

// Цвета элементов по типу — нейтральные тона + accent для люстры.
const ELEMENT_TYPES = {
  spot: { r: 2.5 }, // софит — маленький кружок
  chandelier: { r: 4.5 }, // люстра — большой кружок accent-цвета
  gardina: { kind: "line" }, // гардина — линия
  subcurtain: { kind: "line" }, // подшторник — линия
} as const;

export function RoomPlan2D({
  designerData,
  size,
  fillColor,
  strokeColor,
  spotColor,
  chandelierColor,
}: Props): React.ReactElement | null {
  if (!designerData || !designerData.walls || designerData.walls.length < 3) {
    return null;
  }

  // 1. Построение полигона из walls + angles.
  // Идём по периметру: текущая позиция (x, y) и направление (rad).
  const walls = designerData.walls;
  const angles = designerData.angles || [];
  const vertices: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let dir = 0; // вправо
  vertices.push([x, y]);
  for (let i = 0; i < walls.length; i++) {
    const len = walls[i];
    x += Math.cos(dir) * len;
    y += Math.sin(dir) * len;
    vertices.push([x, y]);
    // Поворачиваем на (180 - angle) против часовой
    const angle = angles[i] ?? 90;
    dir += Math.PI - (angle * Math.PI) / 180;
  }
  // Последняя точка должна совпадать с первой для замыкания — отбрасываем дубль.
  vertices.pop();

  if (vertices.length < 3) return null;

  // 2. Bounding box и масштабирование под `size` (с маленьким padding)
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;
  const padding = 6;
  const inner = size - padding * 2;
  const scale = Math.min(inner / w, inner / h);
  const offsetX = (size - w * scale) / 2 - minX * scale;
  const offsetY = (size - h * scale) / 2 - minY * scale;
  const tx = (px: number) => px * scale + offsetX;
  const ty = (py: number) => py * scale + offsetY;

  // 3. SVG path для полигона
  const points = vertices.map(([vx, vy]) => `${tx(vx)},${ty(vy)}`).join(" L ");
  const d = `M ${points} Z`;

  // 4. Элементы — точки. Координаты приходят в локальной системе Room Designer-а.
  //    Это может быть в пикселях canvas (например 0..600) — нам не критично точное
  //    соответствие масштабу, главное чтобы было видно где какой софит относительно
  //    комнаты. Поэтому нормализуем элементы в bounding box того же набора координат.
  const elements = designerData.elements ?? [];
  const elemXs = elements
    .map((e) => (typeof e.x === "number" ? e.x : null))
    .filter((v): v is number => v !== null);
  const elemYs = elements
    .map((e) => (typeof e.y === "number" ? e.y : null))
    .filter((v): v is number => v !== null);

  // Используем bbox самих стен — но элементы Room Designer-а часто в пиксельной
  // системе, поэтому делаем отдельную нормализацию: маппим bbox элементов
  // на bbox полигона.
  const hasElements = elemXs.length > 0 && elemYs.length > 0;
  const eMinX = hasElements ? Math.min(...elemXs) : 0;
  const eMaxX = hasElements ? Math.max(...elemXs) : 1;
  const eMinY = hasElements ? Math.min(...elemYs) : 0;
  const eMaxY = hasElements ? Math.max(...elemYs) : 1;
  const eW = Math.max(eMaxX - eMinX, 1);
  const eH = Math.max(eMaxY - eMinY, 1);

  const mapElem = (ex: number, ey: number): [number, number] => {
    const nx = (ex - eMinX) / eW;
    const ny = (ey - eMinY) / eH;
    // Размещаем элементы внутри bounding box полигона с небольшим внутренним padding
    const px = tx(minX) + nx * (tx(maxX) - tx(minX));
    const py = ty(minY) + ny * (ty(maxY) - ty(minY));
    return [px, py];
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Заливка комнаты */}
      <Path d={d} fill={fillColor} stroke={strokeColor} strokeWidth={0.8} />
      {/* Элементы */}
      {elements.map((el, i) => {
        if (typeof el.x !== "number" || typeof el.y !== "number") return null;
        const [px, py] = mapElem(el.x, el.y);
        const t = String(el.type || "").toLowerCase();
        if (t.includes("spot") || t.includes("софит")) {
          return (
            <Circle key={i} cx={px} cy={py} r={ELEMENT_TYPES.spot.r} fill={spotColor} />
          );
        }
        if (t.includes("chandelier") || t.includes("люстра")) {
          return (
            <Circle
              key={i}
              cx={px}
              cy={py}
              r={ELEMENT_TYPES.chandelier.r}
              fill={chandelierColor}
            />
          );
        }
        // Не отрисованные типы (мебель, колонны, ниши) — рендерим маленький
        // полупрозрачный квадрат как «занят».
        return (
          <Rect
            key={i}
            x={px - 2}
            y={py - 2}
            width={4}
            height={4}
            fill={strokeColor}
            opacity={0.35}
          />
        );
      })}
    </Svg>
  );
}
