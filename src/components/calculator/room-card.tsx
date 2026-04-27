"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil } from "lucide-react";
import { computeArea, computePerimeter } from "@/lib/room-geometry";
import type { RoomInput } from "@/lib/types";
import { CANVAS_TYPES } from "@/lib/constants";

const SHAPE_LABELS: Record<string, string> = {
  "l-shape": "Г-образная",
  "t-shape": "Т-образная",
  "custom": "Произвольная",
};

interface RoomCardProps {
  room: RoomInput;
  index: number;
  onRemove: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function RoomCard({ room, index, onRemove, onEdit }: RoomCardProps) {
  const area = computeArea(room).toFixed(1);
  const perimeter = computePerimeter(room).toFixed(1);
  const canvasLabel = CANVAS_TYPES.find((ct) => ct.value === room.canvasType)?.label ?? room.canvasType;
  const shape = room.shape || "rectangle";
  const shapeLabel = SHAPE_LABELS[shape];

  // Display dimensions in cm
  const lengthCm = Math.round(room.length * 100);
  const widthCm = Math.round(room.width * 100);

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-3 sm:px-6">
        <div className="flex items-start justify-between overflow-hidden">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f] text-white text-xs font-bold">
                {index + 1}
              </span>
              <h3 className="font-semibold">{room.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {canvasLabel}
              </Badge>
              {shapeLabel && (
                <Badge variant="outline" className="text-xs">
                  {shapeLabel}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              {(shape === "rectangle" || (shape as string) === "square") ? (
                <span>{lengthCm}×{widthCm} см = {area} м²</span>
              ) : (
                <span>{area} м²</span>
              )}
              <span>П: {perimeter} м.п.</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
              {room.spotsCount > 0 && <span>Споты: {room.spotsCount}</span>}
              {room.chandelierCount > 0 && <span>Закладные: {room.chandelierCount}</span>}
              {(room.chandelierInstallCount ?? 0) > 0 && <span>Уст. люстр: {room.chandelierInstallCount}</span>}
              {room.cornersCount > 0 && <span>Углы: {room.cornersCount}</span>}
              {room.curtainRodLength > 0 && <span>Карниз: {Math.round(room.curtainRodLength * 100)} см</span>}
              {(room.gardinaLength ?? 0) > 0 && <span>Гардина: {Math.round(room.gardinaLength * 100)} см</span>}
              {(room.podshtornikLength ?? 0) > 0 && <span>Подшторник: {Math.round(room.podshtornikLength * 100)} см</span>}
              {room.pipeBypasses > 0 && <span>Трубы: {room.pipeBypasses}</span>}
              {room.customItems && room.customItems.length > 0 && <span>Доп: {room.customItems.length} поз.</span>}
              {room.ceilingHeight > 3 && (
                <Badge variant="destructive" className="text-xs">
                  Высота {Math.round(room.ceilingHeight * 100)} см (×1.3)
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-1 ml-2 shrink-0">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={() => onEdit(room.id)}
              >
                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:text-destructive"
              onClick={() => onRemove(room.id)}
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
