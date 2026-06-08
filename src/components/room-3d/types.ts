import type { RoomElement, FurnitureType, Vertex2D } from "@/lib/room-types";

export type { Vertex2D };

export interface Scene3DProps {
  vertices: Vertex2D[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  onScreenshot?: (dataUrl: string) => void;
  /** Скрыть мастер-инструменты (кнопку «Снимок для КП»). Используется на публичной КП. */
  readOnly?: boolean;
}

export const cm2m = (cm: number) => cm / 100;

// Натуральные цвета мебели. Используем как fallback / accent color
// для процедурной 3D-композиции (Furniture3D.tsx).
export const FURNITURE_3D_DIMENSIONS: Record<FurnitureType, { heightCm: number; color: string; label: string }> = {
  bed:        { heightCm: 50,  color: "#E8E4DC", label: "Кровать" },   // светло-серый матрас
  sofa:       { heightCm: 80,  color: "#9CA3AF", label: "Диван" },     // серая ткань
  table:      { heightCm: 75,  color: "#A47148", label: "Стол" },      // дуб
  wardrobe:   { heightCm: 220, color: "#D9CDB4", label: "Шкаф" },      // светлый ЛДСП дуб
  tv:         { heightCm: 70,  color: "#0B0B0B", label: "ТВ" },        // чёрный матовый
  nightstand: { heightCm: 50,  color: "#C9A876", label: "Тумба" },     // дуб ясень
  chair:      { heightCm: 90,  color: "#3F3F46", label: "Стул" },      // чёрный
  desk:       { heightCm: 75,  color: "#A47148", label: "Стол" },      // дуб
  radiator:   { heightCm: 50,  color: "#E5E7EB", label: "Батарея" },   // белая
  kitchen:    { heightCm: 220, color: "#EAE5DA", label: "Кухня" },     // светлая ЛДСП
  wall_panel: { heightCm: 270, color: "#B89B7A", label: "Стенка" },    // массив
};

export type ViewSpot = "center" | "door" | "window";
