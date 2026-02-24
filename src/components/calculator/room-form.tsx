"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANVAS_TYPES, ROOM_PRESETS } from "@/lib/constants";
import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";

interface RoomFormProps {
  onAdd: (room: RoomInput) => void;
  onCancel?: () => void;
}

export function RoomForm({ onAdd, onCancel }: RoomFormProps) {
  const [name, setName] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [ceilingHeight, setCeilingHeight] = useState("2.5");
  const [canvasType, setCanvasType] = useState<CanvasType>("mat");
  const [spotsCount, setSpotsCount] = useState("0");
  const [chandelierCount, setChandelierCount] = useState("0");
  const [cornersCount, setCornersCount] = useState("4");
  const [curtainRodLength, setCurtainRodLength] = useState("0");
  const [pipeBypasses, setPipeBypasses] = useState("0");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const room: RoomInput = {
      id: crypto.randomUUID(),
      name: name || "Комната",
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      ceilingHeight: parseFloat(ceilingHeight) || 2.5,
      canvasType,
      spotsCount: parseInt(spotsCount) || 0,
      chandelierCount: parseInt(chandelierCount) || 0,
      trackMagneticLength: 0,
      lightLineLength: 0,
      curtainRodLength: parseFloat(curtainRodLength) || 0,
      pipeBypasses: parseInt(pipeBypasses) || 0,
      cornersCount: parseInt(cornersCount) || 4,
      eurobrusCount: 0,
    };

    if (room.length <= 0 || room.width <= 0) return;

    onAdd(room);

    // Reset form
    setName("");
    setLength("");
    setWidth("");
    setSpotsCount("0");
    setChandelierCount("0");
    setCornersCount("4");
    setCurtainRodLength("0");
    setPipeBypasses("0");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Room name presets */}
      <div className="space-y-2">
        <Label>Название комнаты</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {ROOM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setName(preset)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                name === preset
                  ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  : "hover:bg-muted border-border"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Или введите своё название"
        />
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="length">Длина (м)</Label>
          <Input
            id="length"
            type="number"
            step="0.1"
            min="0.1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="5"
            inputMode="decimal"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="width">Ширина (м)</Label>
          <Input
            id="width"
            type="number"
            step="0.1"
            min="0.1"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            placeholder="4"
            inputMode="decimal"
            required
          />
        </div>
      </div>

      {/* Area preview */}
      {length && width && (
        <p className="text-sm text-muted-foreground">
          Площадь: {(parseFloat(length) * parseFloat(width)).toFixed(1)} м² |
          Периметр: {(2 * (parseFloat(length) + parseFloat(width))).toFixed(1)} м.п.
        </p>
      )}

      {/* Canvas type + height */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Тип потолка</Label>
          <Select value={canvasType} onValueChange={(v) => setCanvasType(v as CanvasType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANVAS_TYPES.map((ct) => (
                <SelectItem key={ct.value} value={ct.value}>
                  {ct.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="height">Высота (м)</Label>
          <Input
            id="height"
            type="number"
            step="0.1"
            min="2"
            value={ceilingHeight}
            onChange={(e) => setCeilingHeight(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>

      {/* Fixtures */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="spots">Споты</Label>
          <Input
            id="spots"
            type="number"
            min="0"
            value={spotsCount}
            onChange={(e) => setSpotsCount(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="chandeliers">Люстры</Label>
          <Input
            id="chandeliers"
            type="number"
            min="0"
            value={chandelierCount}
            onChange={(e) => setChandelierCount(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="corners">Углы</Label>
          <Input
            id="corners"
            type="number"
            min="0"
            value={cornersCount}
            onChange={(e) => setCornersCount(e.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="curtain">Карниз (м.п.)</Label>
          <Input
            id="curtain"
            type="number"
            step="0.1"
            min="0"
            value={curtainRodLength}
            onChange={(e) => setCurtainRodLength(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pipes">Обход труб</Label>
          <Input
            id="pipes"
            type="number"
            min="0"
            value={pipeBypasses}
            onChange={(e) => setPipeBypasses(e.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1 bg-[#1e3a5f] hover:bg-[#152d4a]">
          Добавить комнату
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  );
}
