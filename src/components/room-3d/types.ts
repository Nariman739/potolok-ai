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

export const FURNITURE_3D_DIMENSIONS: Record<FurnitureType, { heightCm: number; color: string; label: string }> = {
  bed:        { heightCm: 50, color: "#A78BFA", label: "Кровать" },
  sofa:       { heightCm: 80, color: "#818CF8", label: "Диван" },
  table:      { heightCm: 75, color: "#FBBF24", label: "Стол" },
  wardrobe:   { heightCm: 220, color: "#A8A29E", label: "Шкаф" },
  tv:         { heightCm: 70, color: "#1E293B", label: "ТВ" },
  nightstand: { heightCm: 50, color: "#D6D3D1", label: "Тумба" },
  chair:      { heightCm: 90, color: "#34D399", label: "Стул" },
  desk:       { heightCm: 75, color: "#F59E0B", label: "Стол" },
  radiator:   { heightCm: 50, color: "#F87171", label: "Батарея" },
  kitchen:    { heightCm: 220, color: "#06B6D4", label: "Кухня" },
  wall_panel: { heightCm: 270, color: "#6B7280", label: "Стенка" },
};

export type ViewSpot = "center" | "door" | "window";
