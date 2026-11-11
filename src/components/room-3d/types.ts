import type { ElementType, RoomElement, Vertex2D } from "@/lib/room-types";
import type { WallFurnitureEntry } from "@/lib/wall-furniture";

// Файлы-близнецы приложения (Room3D, WallElement3D, …) берут типы чертежа из "./types".
export type { ElementType, RoomElement, Vertex2D };

/** Типы мебели, которые умеет рисовать 3D (furnitureModels.ts — файл-близнец приложения).
 *  Шире, чем FurnitureType чертежа сайта (tv_stand/shelf/armchair приходят из приложения). */
export type FurnitureType =
  | "sofa"
  | "bed"
  | "wardrobe"
  | "kitchen"
  | "table"
  | "tv"
  | "tv_stand"
  | "nightstand"
  | "chair"
  | "desk"
  | "radiator"
  | "wall_panel"
  | "shelf"
  | "armchair";

export interface Scene3DProps {
  vertices: Vertex2D[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  onScreenshot?: (dataUrl: string) => void;
  /** Скрыть мастер-инструменты (кнопку «Снимок для КП»). Используется на публичной КП. */
  readOnly?: boolean;
  /** DEV-конвейер: если задан — AI-захват НЕ идёт в API, а отдаёт сырые snapshot+маски
   * сюда (для локальной покадровой отладки каждого элемента). См. /vision-capture. */
  devCapture?: (sceneDataUrl: string, ceilingMaskDataUrl: string, floatingMaskDataUrl: string) => void;
  /** DEV-конвейер: авто-запустить AI-захват через N мс после монтирования сцены. */
  devAutoCaptureMs?: number;
  /** Серверный рендер (headless Chromium, /render-scene): без UI, без деградации качества
   * по FPS (swiftshader медленный), без постпроцессинга (AI-кадр всё равно снимается
   * сырым gl.render), без localStorage. */
  renderMode?: boolean;
  /** Начальные настройки сцены (перебивают localStorage). В renderMode — единственный источник. */
  initialLook?: {
    finish?: "matte" | "satin" | "glossy";
    colorId?: string;
    lightTempKey?: "warm" | "neutral" | "cool";
    floorId?: string;
    wallId?: string;
  };
  /** Вызывается один раз, когда все загрузчики (HDRI/текстуры/GLB) закончили и сцена
   * отрисовала несколько стабильных кадров — можно снимать. */
  onSceneReady?: () => void;
  /** Внешний триггер AI-захвата (каждое изменение >0 = один снимок beauty+маски). */
  captureTrigger?: number;
  /** Индексы стен с теневым профилем (тёмный зазор по периметру). Из wallProfiles мобилки.
   *  Если не задано — берётся из wallProfiles ("shadow"). */
  shadowGapWalls?: number[];
  /** Паритет с 3D приложения (11.11.2026, те же поля, что RoomSnapshot в open-room-3d.ts):
   *  профили по стенам (индекс = стена vertices[i]→[i+1]), вставка и её цвет, фасад шкафа. */
  wallProfiles?: Record<number, string>;
  withInsert?: boolean;
  insertColor?: "black" | "white";
  wallFurniture?: WallFurnitureEntry[];
  /** Подпись «3D · в разработке» мелко в углу (не снимать без слова Наримана). */
  betaLabel?: string;
}

export const cm2m = (cm: number) => cm / 100;

/**
 * Сторона интерьера (+1/−1 по локальному z стены) — по знаку площади контура
 * (как в types.ts приложения): у замкнутого обхода против часовой интерьер
 * слева от каждой стены, по часовой — справа.
 */
export function interiorSign(vertices: Vertex2D[]): 1 | -1 {
  let a = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a >= 0 ? 1 : -1;
}

export type ViewSpot = "center" | "door" | "window";
