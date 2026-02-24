"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2 } from "lucide-react";
import type { RoomInput } from "@/lib/types";
import { CANVAS_TYPES } from "@/lib/constants";

interface RoomCardProps {
  room: RoomInput;
  index: number;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function RoomCard({ room, index, onDuplicate, onRemove }: RoomCardProps) {
  const area = (room.length * room.width).toFixed(1);
  const perimeter = (2 * (room.length + room.width)).toFixed(1);
  const canvasLabel = CANVAS_TYPES.find((ct) => ct.value === room.canvasType)?.label ?? room.canvasType;

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f] text-white text-xs font-bold">
                {index + 1}
              </span>
              <h3 className="font-semibold">{room.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {canvasLabel}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{room.length}×{room.width}м = {area} м²</span>
              <span>П: {perimeter} м.п.</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
              {room.spotsCount > 0 && <span>Споты: {room.spotsCount}</span>}
              {room.chandelierCount > 0 && <span>Люстры: {room.chandelierCount}</span>}
              {room.cornersCount > 0 && <span>Углы: {room.cornersCount}</span>}
              {room.curtainRodLength > 0 && <span>Карниз: {room.curtainRodLength} м.п.</span>}
              {room.pipeBypasses > 0 && <span>Трубы: {room.pipeBypasses}</span>}
              {room.ceilingHeight > 3 && (
                <Badge variant="destructive" className="text-xs">
                  Высота {room.ceilingHeight}м (×1.3)
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-1 ml-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => onDuplicate(room.id)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive hover:text-destructive"
              onClick={() => onRemove(room.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
