"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // используется для customItems
import {
  ROOM_PRESETS,
  PROFILE_TYPES,
  SPOT_TYPES,
  CURTAIN_TYPES,
  GARDINA_TYPES,
  PODSHTORNIK_TYPES,
  PROFILE_CORNER_MAP,
  DEFAULT_PRICES,
} from "@/lib/constants";
import { getDefaultCorners, validateLShape, validateTShape, validateCustomDims, wallsToVertices, shoelaceArea, polygonGap } from "@/lib/room-geometry";
import { RoomShapeSvg, CustomRoomSvg } from "./room-shape-svg";
import type { RoomInput, RoomShape, CustomDimensions, OneOffItem } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

// Clear "0" on focus so user can type directly, restore "0" on blur if empty
function zeroFieldProps(value: string, setter: (v: string) => void) {
  return {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value),
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value === "0") setter("");
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value === "") setter("0");
    },
  };
}

interface CustomItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
}

interface RoomFormProps {
  onAdd: (room: RoomInput) => void;
  onCancel?: () => void;
  priceMap?: Record<string, number>;
  editRoom?: RoomInput;
  customItems?: CustomItemOption[];
}

function formatPriceCompact(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

const SHAPE_OPTIONS: { value: RoomShape | "designer"; label: string; icon: string; desc?: string }[] = [
  { value: "rectangle", label: "Прямоугольник", icon: "▭", desc: "Длина × Ширина" },
  { value: "designer", label: "Нарисовать", icon: "✏️", desc: "Любая форма" },
];

const DEFAULT_CUSTOM_WALLS = [
  { length: "", turnRight: true },
  { length: "", turnRight: true },
  { length: "", turnRight: true },
  { length: "", turnRight: true },
];

export function RoomForm({ onAdd, onCancel, priceMap, editRoom, customItems: customItemsProp }: RoomFormProps) {
  const router = useRouter();
  const prices = priceMap ?? DEFAULT_PRICES;
  const er = editRoom; // shorthand

  const [name, setName] = useState(er?.name ?? "");
  // Legacy "square" rooms treated as rectangle
  const erShape = er?.shape as string | undefined;
  const [shape, setShape] = useState<RoomShape>(erShape === "square" ? "rectangle" : (er?.shape ?? "rectangle"));

  // Rectangle dims (cm) — convert from meters (also handles legacy "square" rooms)
  const isRectLike = er && (er.shape === "rectangle" || erShape === "square" || !er.shape);
  const [length, setLength] = useState(isRectLike ? String(Math.round(er.length * 100)) : "");
  const [width, setWidth] = useState(isRectLike ? String(Math.round(er.width * 100)) : "");

  // L-shape dims (cm) — 5 sides clockwise: A(top), B(right↓), C(step←), D(inner↓), E(bottom←)
  // Handle backward compat: old format had a=top, b=right, c=fullHeight, d=bottomWidth
  const lOld = er?.lShapeDims;
  const lIsOldFormat = lOld && (lOld.e === undefined || lOld.e === 0);
  const [lA, setLA] = useState(lOld ? String(Math.round(lOld.a * 100)) : "");
  const [lB, setLB] = useState(lOld ? String(Math.round(lOld.b * 100)) : "");
  const [lC, setLC] = useState(lOld ? String(Math.round((lIsOldFormat ? (lOld.a - lOld.d) : lOld.c) * 100)) : "");
  const [lD, setLD] = useState(lOld ? String(Math.round((lIsOldFormat ? (lOld.c - lOld.b) : lOld.d) * 100)) : "");
  const [lE, setLE] = useState(lOld ? String(Math.round((lIsOldFormat ? lOld.d : (lOld.e ?? 0)) * 100)) : "");

  // T-shape dims (cm)
  const [tA, setTA] = useState(er?.tShapeDims ? String(Math.round(er.tShapeDims.a * 100)) : "");
  const [tB, setTB] = useState(er?.tShapeDims ? String(Math.round(er.tShapeDims.b * 100)) : "");
  const [tC, setTC] = useState(er?.tShapeDims ? String(Math.round(er.tShapeDims.c * 100)) : "");
  const [tD, setTD] = useState(er?.tShapeDims ? String(Math.round(er.tShapeDims.d * 100)) : "");

  // Custom polygon walls (stored in cm as strings)
  const [customWalls, setCustomWalls] = useState<{ length: string; turnRight: boolean }[]>(
    er?.customDims
      ? er.customDims.walls.map(w => ({ length: String(Math.round(w.length * 100)), turnRight: w.turnRight }))
      : DEFAULT_CUSTOM_WALLS.map(w => ({ ...w }))
  );
  const [activeWallIndex, setActiveWallIndex] = useState<number | null>(null);

  // Active side for SVG highlight
  const [activeSide, setActiveSide] = useState<"a" | "b" | "c" | "d" | "e" | null>(null);

  // Common fields
  const [ceilingHeight, setCeilingHeight] = useState(er ? String(Math.round(er.ceilingHeight * 100)) : "300");
  const [spotsCount, setSpotsCount] = useState(er ? String(er.spotsCount) : "0");
  const [chandelierCount, setChandelierCount] = useState(er ? String(er.chandelierCount) : "0");
  const [chandelierInstallCount, setChandelierInstallCount] = useState(er ? String(er.chandelierInstallCount ?? 0) : "0");
  const [cornersCount, setCornersCount] = useState(er ? String(er.cornersCount) : "4");
  const [curtainRodLength, setCurtainRodLength] = useState(er ? String(Math.round(er.curtainRodLength * 100)) : "0");
  const [pipeBypasses, setPipeBypasses] = useState(er ? String(er.pipeBypasses) : "0");
  const [shapeError, setShapeError] = useState<string | null>(null);

  // Component selection
  const [profileType, setProfileType] = useState(er?.profileType ?? "profile_insert");
  const [spotType, setSpotType] = useState(er?.spotType ?? "spot_ours");
  // Corner type auto-determined by profile
  const [curtainType, setCurtainType] = useState(er?.curtainType ?? "curtain_ldsp");
  const [transformerCount, setTransformerCount] = useState(String(er?.transformerCount ?? 0));

  // Gardina + Podshtornik
  const [gardinaLength, setGardinaLength] = useState(
    er ? String(Math.round((er.gardinaLength ?? 0) * 100)) : "0"
  );
  const [gardinaType, setGardinaType] = useState(er?.gardinaType ?? "gardina_plastic");
  const [podshtornikLength, setPodshtornikLength] = useState(
    er ? String(Math.round((er.podshtornikLength ?? 0) * 100)) : "0"
  );
  const [podshtornikType, setPodshtornikType] = useState(er?.podshtornikType ?? "podshtornik_aluminum");

  // Custom items (из справочника)
  const [availableCustomItems, setAvailableCustomItems] = useState<CustomItemOption[]>(customItemsProp ?? []);
  const [selectedCustomItems, setSelectedCustomItems] = useState<{ itemId: string; quantity: string }[]>(
    er?.customItems?.map((ci) => ({ itemId: ci.itemId, quantity: String(ci.quantity) })) ?? []
  );

  // One-off items (разовые позиции этой комнаты, без сохранения в каталог)
  type OneOffDraft = { name: string; price: string; quantity: string; unit: string };
  const [oneOffItems, setOneOffItems] = useState<OneOffDraft[]>(
    er?.oneOffItems?.map((oi) => ({
      name: oi.name,
      price: String(oi.price),
      quantity: String(oi.quantity),
      unit: oi.unit ?? "шт.",
    })) ?? []
  );

  function addOneOffItem() {
    setOneOffItems((prev) => [...prev, { name: "", price: "", quantity: "1", unit: "шт." }]);
  }
  function updateOneOffItem(idx: number, field: keyof OneOffDraft, value: string) {
    setOneOffItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function removeOneOffItem(idx: number) {
    setOneOffItems((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    if (customItemsProp) {
      setAvailableCustomItems(customItemsProp);
      return;
    }
    fetch("/api/custom-items")
      .then((r) => r.json())
      .then((items: CustomItemOption[]) => setAvailableCustomItems(items))
      .catch(() => {});
  }, [customItemsProp]);

  function addSelectedCustomItem() {
    if (availableCustomItems.length === 0) return;
    setSelectedCustomItems((prev) => [
      ...prev,
      { itemId: availableCustomItems[0].code, quantity: "1" },
    ]);
  }

  function updateSelectedCustomItem(idx: number, field: "itemId" | "quantity", value: string) {
    setSelectedCustomItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  function removeSelectedCustomItem(idx: number) {
    setSelectedCustomItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateWall(idx: number, field: "length" | "turnRight", value: string | boolean) {
    setCustomWalls(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }
  function addWall() {
    setCustomWalls(prev => [...prev, { length: "", turnRight: true }]);
  }
  function removeWall(idx: number) {
    setCustomWalls(prev => prev.filter((_, i) => i !== idx));
  }

  function handleShapeChange(newShape: RoomShape) {
    setShape(newShape);
    if (newShape === "custom") {
      setCornersCount(String(customWalls.length));
    } else {
      setCornersCount(String(getDefaultCorners(newShape)));
    }
    setShapeError(null);
  }

  // Sync corners count with wall count in custom mode
  useEffect(() => {
    if (shape === "custom") {
      setCornersCount(String(customWalls.length));
    }
  }, [customWalls.length, shape]);

  function computePreview(): { area: number; perimeter: number } | null {
    if (shape === "rectangle") {
      const l = parseFloat(length);
      const w = parseFloat(width);
      if (!l || !w || l <= 0 || w <= 0) return null;
      return { area: (l * w) / 10000, perimeter: (2 * (l + w)) / 100 };
    }
    if (shape === "l-shape") {
      const a = parseFloat(lA), b = parseFloat(lB), c = parseFloat(lC), d = parseFloat(lD), e = parseFloat(lE);
      if (!a || !b || !c || !d || !e) return null;
      // Area = A*B + E*D, Perimeter = A + 2B + C + 2D + E
      return {
        area: (a * b + e * d) / 10000,
        perimeter: (a + 2 * b + c + 2 * d + e) / 100,
      };
    }
    if (shape === "t-shape") {
      const a = parseFloat(tA), b = parseFloat(tB), c = parseFloat(tC), d = parseFloat(tD);
      if (!a || !b || !c || !d) return null;
      if (a <= c) return null;
      return {
        area: (a * b + c * d) / 10000,
        perimeter: (2 * (a + b + d)) / 100,
      };
    }
    if (shape === "custom") {
      const parsed = customWalls.map(w => ({
        length: (parseFloat(w.length) || 0) / 100,
        turnRight: w.turnRight,
      }));
      if (parsed.some(w => w.length <= 0)) return null;
      const verts = wallsToVertices(parsed);
      const area = shoelaceArea(verts);
      const perimeter = parsed.reduce((s, w) => s + w.length, 0);
      if (area <= 0) return null;
      return { area, perimeter };
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShapeError(null);

    const heightM = (parseFloat(ceilingHeight) || 300) / 100;
    const curtainM = (parseFloat(curtainRodLength) || 0) / 100;
    const gardinaM = (parseFloat(gardinaLength) || 0) / 100;
    const podshtornikM = (parseFloat(podshtornikLength) || 0) / 100;

    let lengthM = 0;
    let widthM = 0;
    let roomShape: RoomShape = shape;
    let lShapeDims = undefined;
    let tShapeDims = undefined;
    let customDims: CustomDimensions | undefined = undefined;

    if (shape === "rectangle") {
      lengthM = (parseFloat(length) || 0) / 100;
      widthM = (parseFloat(width) || 0) / 100;
      if (lengthM <= 0 || widthM <= 0) return;
    } else if (shape === "l-shape") {
      const dims = {
        a: (parseFloat(lA) || 0) / 100,
        b: (parseFloat(lB) || 0) / 100,
        c: (parseFloat(lC) || 0) / 100,
        d: (parseFloat(lD) || 0) / 100,
        e: (parseFloat(lE) || 0) / 100,
      };
      const err = validateLShape(dims);
      if (err) { setShapeError(err); return; }
      lShapeDims = dims;
      lengthM = dims.a;         // bounding box width
      widthM = dims.b + dims.d; // bounding box height (= left wall F)
    } else if (shape === "t-shape") {
      const dims = {
        a: (parseFloat(tA) || 0) / 100,
        b: (parseFloat(tB) || 0) / 100,
        c: (parseFloat(tC) || 0) / 100,
        d: (parseFloat(tD) || 0) / 100,
      };
      const err = validateTShape(dims);
      if (err) { setShapeError(err); return; }
      tShapeDims = dims;
      lengthM = dims.a;       // bounding box width
      widthM = dims.b + dims.d; // bounding box height
    } else if (shape === "custom") {
      const dims: CustomDimensions = {
        walls: customWalls.map(w => ({
          length: (parseFloat(w.length) || 0) / 100,
          turnRight: w.turnRight,
        })),
      };
      const err = validateCustomDims(dims);
      if (err) { setShapeError(err); return; }
      customDims = dims;
      const verts = wallsToVertices(dims.walls);
      const xs = verts.map(v => v.x);
      const ys = verts.map(v => v.y);
      lengthM = Math.max(...xs) - Math.min(...xs);
      widthM = Math.max(...ys) - Math.min(...ys);
    }

    const cleanOneOffs: OneOffItem[] = oneOffItems
      .map((oi) => ({
        name: oi.name.trim(),
        price: parseFloat(oi.price) || 0,
        quantity: parseFloat(oi.quantity) || 0,
        unit: oi.unit.trim() || "шт.",
      }))
      .filter((oi) => oi.name && oi.price > 0 && oi.quantity > 0);

    const room: RoomInput = {
      id: editRoom?.id ?? crypto.randomUUID(),
      name: name || "Комната",
      length: lengthM,
      width: widthM,
      ceilingHeight: heightM,
      // canvasType — оставлено в типе для обратной совместимости со старыми КП,
      // но цена полотна теперь всегда определяется по геометрии в calculate.ts
      canvasType: editRoom?.canvasType ?? "mat",
      spotsCount: parseInt(spotsCount) || 0,
      chandelierCount: parseInt(chandelierCount) || 0,
      chandelierInstallCount: parseInt(chandelierInstallCount) || 0,
      trackMagneticLength: 0,
      lightLineLength: 0,
      curtainRodLength: curtainM,
      pipeBypasses: parseInt(pipeBypasses) || 0,
      cornersCount: parseInt(cornersCount) || getDefaultCorners(roomShape),
      eurobrusCount: 0,
      shape: roomShape,
      lShapeDims,
      tShapeDims,
      customDims,
      profileType,
      spotType: (parseInt(spotsCount) || 0) > 0 ? spotType : undefined,
      curtainType: curtainM > 0 ? curtainType : undefined,
      transformerCount: (parseInt(chandelierCount) || 0) > 0 ? (parseInt(transformerCount) || 0) : undefined,
      gardinaLength: gardinaM,
      gardinaType: gardinaM > 0 ? gardinaType : undefined,
      podshtornikLength: podshtornikM,
      podshtornikType: podshtornikM > 0 ? podshtornikType : undefined,
      customItems: selectedCustomItems
        .filter((ci) => ci.itemId && parseFloat(ci.quantity) > 0)
        .map((ci) => ({ itemId: ci.itemId, quantity: parseFloat(ci.quantity) })),
      oneOffItems: cleanOneOffs.length > 0 ? cleanOneOffs : undefined,
    };

    onAdd(room);

    // Only reset form when adding (not editing)
    if (!editRoom) {
      setName("");
      setLength(""); setWidth("");
      setLA(""); setLB(""); setLC(""); setLD(""); setLE("");
      setTA(""); setTB(""); setTC(""); setTD("");
      setSpotsCount("0"); setChandelierCount("0"); setChandelierInstallCount("0");
      setCornersCount(String(getDefaultCorners(shape)));
      setCurtainRodLength("0"); setPipeBypasses("0");
      setGardinaLength("0"); setPodshtornikLength("0");
      setSelectedCustomItems([]);
      setOneOffItems([]);
      setCustomWalls(DEFAULT_CUSTOM_WALLS.map(w => ({ ...w })));
      setActiveWallIndex(null);
      setShapeError(null); setActiveSide(null);
    }
  }

  const preview = computePreview();

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

      {/* Shape selector */}
      <div className="space-y-2">
        <Label>Форма комнаты</Label>
        <div className="grid grid-cols-2 gap-3">
          {SHAPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value === "designer") {
                  router.push("/dashboard/vision-test?mode=calculator");
                } else {
                  handleShapeChange(opt.value as RoomShape);
                }
              }}
              className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border-2 text-sm transition-all ${
                shape === opt.value
                  ? "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md"
                  : "hover:bg-muted border-border hover:border-[#1e3a5f]/30"
              }`}
            >
              <span className="text-2xl leading-none">{opt.icon}</span>
              <span className="font-semibold">{opt.label}</span>
              {opt.desc && <span className={`text-xs ${shape === opt.value ? "text-white/70" : "text-muted-foreground"}`}>{opt.desc}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Dimensions based on shape */}
      {shape === "rectangle" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="length">Длина (см)</Label>
            <Input
              id="length"
              type="number"
              step="1"
              min="1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="500"
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="width">Ширина (см)</Label>
            <Input
              id="width"
              type="number"
              step="1"
              min="1"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="400"
              inputMode="numeric"
              required
            />
          </div>
        </div>
      )}

      {shape === "l-shape" && (
        <div className="space-y-3">
          <RoomShapeSvg shape="l-shape" dims={{ a: lA, b: lB, c: lC, d: lD, e: lE }} activeSide={activeSide} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lA" className="text-xs">A — верх →</Label>
              <Input id="lA" type="number" step="1" min="1" value={lA}
                onChange={(e) => setLA(e.target.value)} placeholder="500" inputMode="numeric"
                onFocus={() => setActiveSide("a")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lB" className="text-xs">B — правая ↓</Label>
              <Input id="lB" type="number" step="1" min="1" value={lB}
                onChange={(e) => setLB(e.target.value)} placeholder="200" inputMode="numeric"
                onFocus={() => setActiveSide("b")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lC" className="text-xs">C — выступ ←</Label>
              <Input id="lC" type="number" step="1" min="1" value={lC}
                onChange={(e) => setLC(e.target.value)} placeholder="200" inputMode="numeric"
                onFocus={() => setActiveSide("c")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lD" className="text-xs">D — внутренняя ↓</Label>
              <Input id="lD" type="number" step="1" min="1" value={lD}
                onChange={(e) => setLD(e.target.value)} placeholder="300" inputMode="numeric"
                onFocus={() => setActiveSide("d")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lE" className="text-xs">E — низ ←</Label>
              <Input id="lE" type="number" step="1" min="1" value={lE}
                onChange={(e) => setLE(e.target.value)} placeholder="300" inputMode="numeric"
                onFocus={() => setActiveSide("e")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">F — левая ↑ (авто)</Label>
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                {(parseFloat(lB) || 0) + (parseFloat(lD) || 0) || "—"} см
              </div>
            </div>
          </div>
        </div>
      )}

      {shape === "t-shape" && (
        <div className="space-y-3">
          <RoomShapeSvg shape="t-shape" dims={{ a: tA, b: tB, c: tC, d: tD }} activeSide={activeSide} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tA" className="text-xs">A — ширина верха (см)</Label>
              <Input id="tA" type="number" step="1" min="1" value={tA}
                onChange={(e) => setTA(e.target.value)} placeholder="600" inputMode="numeric"
                onFocus={() => setActiveSide("a")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tB" className="text-xs">B — высота верха (см)</Label>
              <Input id="tB" type="number" step="1" min="1" value={tB}
                onChange={(e) => setTB(e.target.value)} placeholder="150" inputMode="numeric"
                onFocus={() => setActiveSide("b")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tC" className="text-xs">C — ширина ножки (см)</Label>
              <Input id="tC" type="number" step="1" min="1" value={tC}
                onChange={(e) => setTC(e.target.value)} placeholder="200" inputMode="numeric"
                onFocus={() => setActiveSide("c")} onBlur={() => setActiveSide(null)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tD" className="text-xs">D — высота ножки (см)</Label>
              <Input id="tD" type="number" step="1" min="1" value={tD}
                onChange={(e) => setTD(e.target.value)} placeholder="300" inputMode="numeric"
                onFocus={() => setActiveSide("d")} onBlur={() => setActiveSide(null)} required />
            </div>
          </div>
        </div>
      )}

      {/* Custom polygon walls */}
      {shape === "custom" && (
        <div className="space-y-3">
          <CustomRoomSvg walls={customWalls} activeWallIndex={activeWallIndex} />

          {/* Closure status */}
          {(() => {
            const parsed = customWalls.map(w => ({
              length: (parseFloat(w.length) || 0) / 100,
              turnRight: w.turnRight,
            }));
            const allFilled = parsed.every(w => w.length > 0);
            if (!allFilled) return null;
            const gap = polygonGap(parsed);
            const closed = gap < 0.01;
            return (
              <div className={`text-xs px-2 py-1 rounded ${closed ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                {closed ? "Полигон замкнут" : `Не замкнут (разрыв ${(gap * 100).toFixed(0)} см)`}
              </div>
            );
          })()}

          {/* Wall list */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Обходите комнату по часовой стрелке, начиная с верхней стены
            </Label>
            {customWalls.map((wall, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  className="flex-1 h-9"
                  value={wall.length}
                  onChange={e => updateWall(idx, "length", e.target.value)}
                  onFocus={() => setActiveWallIndex(idx)}
                  onBlur={() => setActiveWallIndex(null)}
                  placeholder="см"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => updateWall(idx, "turnRight", !wall.turnRight)}
                  className={`px-2 py-1.5 text-xs rounded-lg border min-w-[70px] transition-colors ${
                    wall.turnRight
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "bg-amber-100 text-amber-800 border-amber-300"
                  }`}
                >
                  {wall.turnRight ? "→ внутр." : "← внеш."}
                </button>
                {customWalls.length > 4 && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => removeWall(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add wall button */}
          {customWalls.length < 20 && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={addWall}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Добавить стену
            </Button>
          )}
        </div>
      )}

      {/* Area/perimeter preview */}
      {preview && (
        <p className="text-sm text-muted-foreground">
          Площадь: {preview.area.toFixed(1)} м² | Периметр: {preview.perimeter.toFixed(1)} м.п.
        </p>
      )}

      {/* Shape validation error */}
      {shapeError && (
        <p className="text-sm text-destructive">{shapeError}</p>
      )}

      {/* Высота потолка. Тип/цена полотна — авто по короткой стороне комнаты. */}
      <div className="space-y-2">
        <Label htmlFor="height">Высота потолка (см)</Label>
        <Input
          id="height"
          type="number"
          step="1"
          min="200"
          value={ceilingHeight}
          onChange={(e) => setCeilingHeight(e.target.value)}
          inputMode="numeric"
        />
        {preview && (
          <p className="text-xs text-muted-foreground">
            Полотно подберётся автоматически по короткой стороне комнаты:
            до 3.2 м — {formatPriceCompact(prices["canvas_320"] ?? 0)}₸/м²,
            до 5.5 м — {formatPriceCompact(prices["canvas_550"] ?? 0)}₸/м²,
            больше — {formatPriceCompact(prices["canvas_over"] ?? 0)}₸/м².
          </p>
        )}
      </div>

      {/* Fixtures */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="spots">Споты</Label>
          <Input
            id="spots"
            type="number"
            min="0"
            {...zeroFieldProps(spotsCount, setSpotsCount)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="chandeliers">Закладные</Label>
          <Input
            id="chandeliers"
            type="number"
            min="0"
            {...zeroFieldProps(chandelierCount, setChandelierCount)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="corners">Углы</Label>
          <Input
            id="corners"
            type="number"
            min="0"
            {...zeroFieldProps(cornersCount, setCornersCount)}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Chandelier installation — shown when закладные > 0 */}
      {parseInt(chandelierCount) > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="chandelierInstall">Установка люстр</Label>
            <Input
              id="chandelierInstall"
              type="number"
              min="0"
              {...zeroFieldProps(chandelierInstallCount, setChandelierInstallCount)}
              inputMode="numeric"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="curtain">Карниз (см)</Label>
          <Input
            id="curtain"
            type="number"
            step="1"
            min="0"
            {...zeroFieldProps(curtainRodLength, setCurtainRodLength)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pipes">Обход труб</Label>
          <Input
            id="pipes"
            type="number"
            min="0"
            {...zeroFieldProps(pipeBypasses, setPipeBypasses)}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Gardina + Podshtornik inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="gardina">Гардина (см)</Label>
          <Input
            id="gardina"
            type="number"
            step="1"
            min="0"
            {...zeroFieldProps(gardinaLength, setGardinaLength)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="podshtornik">Подшторник (см)</Label>
          <Input
            id="podshtornik"
            type="number"
            step="1"
            min="0"
            {...zeroFieldProps(podshtornikLength, setPodshtornikLength)}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Component selection */}
      <div className="space-y-3 pt-2 border-t">
        <p className="text-sm font-medium text-muted-foreground">Комплектующие</p>

        {/* Profile type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Профиль</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {PROFILE_TYPES.map((p) => {
              // For galtel: just plastic profile; insert: plastic + insert; others: own price
              let displayPrice: number;
              if (p.code === "profile_galtel") {
                displayPrice = prices["profile_plastic"] ?? 0;
              } else if (p.code === "profile_insert") {
                displayPrice = (prices["profile_plastic"] ?? 0) + (prices["insert"] ?? 0);
              } else {
                displayPrice = prices[p.code] ?? 0;
              }
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setProfileType(p.code)}
                  className={`px-2 py-1.5 text-xs rounded-lg border transition-colors text-left ${
                    profileType === p.code
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {p.label}
                  <span className={`ml-1 ${profileType === p.code ? "text-white/70" : "text-muted-foreground"}`}>
                    {formatPriceCompact(displayPrice)}₸
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Spot type — only if spots > 0 */}
        {parseInt(spotsCount) > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Тип спотов</Label>
            <div className="flex gap-1.5">
              {SPOT_TYPES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setSpotType(s.code)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    spotType === s.code
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {s.label}
                  <span className={`block ${spotType === s.code ? "text-white/70" : "text-muted-foreground"}`}>
                    {formatPriceCompact(prices[s.code] ?? 0)}₸/шт
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Corner type — auto by profile */}
        {(() => {
          const autoCorner = PROFILE_CORNER_MAP[profileType] || "corner_plastic";
          const isAluminum = autoCorner === "corner_aluminum";
          return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <span>Углы: {isAluminum ? "алюминий" : "пластик"}</span>
              <span className="font-medium text-foreground">
                {formatPriceCompact(prices[autoCorner] ?? 0)}₸/шт
              </span>
              <span className="text-[10px]">
                (по типу профиля)
              </span>
            </div>
          );
        })()}

        {/* Curtain type — only if curtain > 0 */}
        {parseFloat(curtainRodLength) > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Тип карниза</Label>
            <div className="flex gap-1.5">
              {CURTAIN_TYPES.map((ct) => (
                <button
                  key={ct.code}
                  type="button"
                  onClick={() => setCurtainType(ct.code)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    curtainType === ct.code
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {ct.label}
                  <span className={`block ${curtainType === ct.code ? "text-white/70" : "text-muted-foreground"}`}>
                    {formatPriceCompact(prices[ct.code] ?? 0)}₸/м.п.
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gardina type — only if gardina > 0 */}
        {parseFloat(gardinaLength) > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Тип гардины</Label>
            <div className="flex gap-1.5">
              {GARDINA_TYPES.map((g) => (
                <button
                  key={g.code}
                  type="button"
                  onClick={() => setGardinaType(g.code)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    gardinaType === g.code
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {g.label}
                  <span className={`block ${gardinaType === g.code ? "text-white/70" : "text-muted-foreground"}`}>
                    {formatPriceCompact(prices[g.code] ?? 0)}₸/м.п.
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Podshtornik type — only if podshtornik > 0 */}
        {parseFloat(podshtornikLength) > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Тип подшторника</Label>
            <div className="flex gap-1.5">
              {PODSHTORNIK_TYPES.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPodshtornikType(p.code)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    podshtornikType === p.code
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {p.label}
                  <span className={`block ${podshtornikType === p.code ? "text-white/70" : "text-muted-foreground"}`}>
                    {formatPriceCompact(prices[p.code] ?? 0)}₸/м.п.
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transformer count — only if chandeliers > 0 */}
        {parseInt(chandelierCount) > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span>Трансформатор</span>
            <input
              type="number"
              min="0"
              value={transformerCount}
              onChange={(e) => setTransformerCount(e.target.value)}
              className="w-16 rounded border border-border px-2 py-0.5 text-center text-sm bg-background"
              placeholder="0"
            />
            <span className="text-muted-foreground text-xs">
              шт · {formatPriceCompact(prices["transformer"] ?? 0)}₸/шт
            </span>
          </div>
        )}
      </div>

      {/* Custom items section */}
      {availableCustomItems.length > 0 && (
        <div className="space-y-3 pt-2 border-t">
          <p className="text-sm font-medium text-muted-foreground">Доп. позиции</p>
          {selectedCustomItems.map((sci, idx) => {
            const info = availableCustomItems.find((ci) => ci.code === sci.itemId);
            return (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select value={sci.itemId} onValueChange={(v) => updateSelectedCustomItem(idx, "itemId", v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCustomItems.map((ci) => (
                        <SelectItem key={ci.code} value={ci.code}>
                          {ci.name} ({ci.price}₸/{ci.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={sci.quantity}
                  onChange={(e) => updateSelectedCustomItem(idx, "quantity", e.target.value)}
                  className="w-20 h-9 text-xs"
                  placeholder={info?.unit ?? "Кол-во"}
                />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeSelectedCustomItem(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addSelectedCustomItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Добавить позицию
          </Button>
        </div>
      )}

      {/* One-off items — разовые позиции этой комнаты */}
      <div className="space-y-3 pt-2 border-t">
        <p className="text-sm font-medium text-muted-foreground">Разовые позиции в этой комнате</p>
        {oneOffItems.map((oi, idx) => (
          <div key={idx} className="space-y-1.5 rounded-lg border border-border p-2">
            <div className="flex gap-2">
              <Input
                value={oi.name}
                onChange={(e) => updateOneOffItem(idx, "name", e.target.value)}
                placeholder="Название работы"
                className="flex-1 h-9 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => removeOneOffItem(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={oi.quantity}
                onChange={(e) => updateOneOffItem(idx, "quantity", e.target.value)}
                placeholder="Кол-во"
                className="h-9 text-xs"
                inputMode="decimal"
              />
              <Input
                value={oi.unit}
                onChange={(e) => updateOneOffItem(idx, "unit", e.target.value)}
                placeholder="ед."
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={oi.price}
                onChange={(e) => updateOneOffItem(idx, "price", e.target.value)}
                placeholder="Цена ₸"
                className="h-9 text-xs"
                inputMode="numeric"
              />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addOneOffItem}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Разовая позиция
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1 bg-[#1e3a5f] hover:bg-[#152d4a]">
          {editRoom ? "Сохранить" : "Добавить комнату"}
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
