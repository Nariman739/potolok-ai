"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, Undo2, Check, Share2, RotateCw, AlignHorizontalSpaceBetween, Move, ZoomIn, ZoomOut, Box, Square } from "lucide-react";
import { DEFAULT_PRICES } from "@/lib/constants";
import { Scene3DBoundary } from "./3d/Scene3DBoundary";

const Scene3D = dynamic(() => import("./3d/Scene3D").then(m => m.Scene3D), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-50 to-slate-100">
      <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
    </div>
  ),
});

const DEFAULT_CEILING_HEIGHT_CM = 270;

// ── Types ──

export type ElementType = "spot" | "chandelier" | "curtain" | "subcurtain" | "track" | "lightline" | "floating" | "door" | "window" | "furniture" | "builtin_gardina" | "shower_curtain";
export type FurnitureType = "bed" | "sofa" | "table" | "wardrobe" | "tv" | "nightstand" | "chair" | "desk" | "radiator";

export interface RoomElement {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  wallIndex?: number;
  wallPosition?: number;
  length?: number;
  variant?: "ours" | "client";
  furnitureType?: FurnitureType;
  width?: number;
  height?: number;
  rotation?: number;
  // Форма wall-элементов: straight (прямой), u-niche (П-ниша), l-bend (Г-ниша),
  // freeform (свободно перемещаемая линия — для световой линии и трека)
  shape?: "straight" | "u-niche" | "l-bend" | "freeform";
  // Глубина ниши в см (для u-niche / l-bend)
  depth?: number;
  // Сторона выпуска Г-ниши: left или right (относительно направления стены)
  side?: "left" | "right";
  // Точки freeform-линии в координатах SVG (для drag в любую точку)
  points?: { x: number; y: number }[];
}

interface Room {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  area: number;
  perimeter: number;
  elements?: RoomElement[];
  ceilingHeight?: number;
}

// ── Element config ──

type ToolbarTab = "light" | "walls" | "furniture";

const LIGHT_ELEMENTS: { type: ElementType; label: string; icon: string; color: string; category: "point" | "wall" | "perimeter" }[] = [
  { type: "spot",        label: "Софит",       icon: "💡", color: "#F59E0B", category: "point" },
  { type: "chandelier",  label: "Люстра",      icon: "🔆", color: "#8B5CF6", category: "point" },
  { type: "curtain",     label: "Гардина",     icon: "📏", color: "#10B981", category: "wall" },
  { type: "subcurtain",  label: "Подшторник",   icon: "📐", color: "#06B6D4", category: "wall" },
  { type: "track",       label: "Трек",        icon: "🔲", color: "#EF4444", category: "wall" },
  { type: "lightline",   label: "Свет.линия",  icon: "✨", color: "#FACC15", category: "wall" },
  { type: "floating",    label: "Парящий",     icon: "〰️", color: "#3B82F6", category: "perimeter" },
  { type: "builtin_gardina", label: "Гардина",  icon: "🪟", color: "#059669", category: "wall" },
  { type: "shower_curtain",  label: "Шторка ванн.", icon: "🚿", color: "#7C3AED", category: "wall" },
];

const WALL_ELEMENTS: { type: ElementType; label: string; icon: string; color: string }[] = [
  { type: "door",   label: "Дверь",  icon: "🚪", color: "#78716C" },
  { type: "window", label: "Окно",   icon: "🪟", color: "#60A5FA" },
];

const FURNITURE: { furnitureType: FurnitureType; label: string; icon: string; color: string; defaultW: number; defaultH: number }[] = [
  { furnitureType: "bed",        label: "Кровать",    icon: "🛏️", color: "#8B5CF6", defaultW: 200, defaultH: 160 },
  { furnitureType: "sofa",       label: "Диван",      icon: "🛋️", color: "#6366F1", defaultW: 200, defaultH: 90 },
  { furnitureType: "table",      label: "Стол",       icon: "🪑", color: "#D97706", defaultW: 120, defaultH: 80 },
  { furnitureType: "wardrobe",   label: "Шкаф",       icon: "🗄️", color: "#78716C", defaultW: 200, defaultH: 60 },
  { furnitureType: "tv",         label: "ТВ",         icon: "📺", color: "#1e3a5f", defaultW: 120, defaultH: 10 },
  { furnitureType: "nightstand", label: "Тумба",      icon: "📦", color: "#A3A3A3", defaultW: 50,  defaultH: 50 },
  { furnitureType: "chair",      label: "Стул",       icon: "💺", color: "#10B981", defaultW: 45,  defaultH: 45 },
  { furnitureType: "desk",       label: "Письм.стол", icon: "🖥️", color: "#F59E0B", defaultW: 140, defaultH: 70 },
  { furnitureType: "radiator",   label: "Батарея",    icon: "🔥", color: "#DC2626", defaultW: 100, defaultH: 15 },
];

const ALL_ELEMENTS = LIGHT_ELEMENTS; // backwards compat

/**
 * Длина одного подшторника в см с учётом формы:
 *  - прямой → e.length
 *  - П-ниша → e.length + 2 × depth (обход трёх стенок)
 *  - Г-ниша → e.length + depth (обход двух стенок)
 */
export function subcurtainTotalLengthCm(e: { length?: number; shape?: string; depth?: number }): number {
  const len = e.length || 0;
  if (e.shape === "u-niche" && e.depth) return len + 2 * e.depth;
  if (e.shape === "l-bend" && e.depth) return len + e.depth;
  return len;
}

/** Сумма длин всех подшторников комнаты в см (полная длина материала с обходом ниши). */
export function totalSubcurtainLengthCm(elements: { type: string; length?: number; shape?: string; depth?: number }[]): number {
  return elements
    .filter(e => e.type === "subcurtain")
    .reduce((s, e) => s + subcurtainTotalLengthCm(e), 0);
}

/**
 * Сумма длин участков СТЕНЫ, покрытых подшторниками (без учёта глубины ниши).
 * Используется для вычитания из периметра багета — багет не идёт под подшторником,
 * но и боковины ниши идут вглубь потолка, а не по стене.
 */
export function subcurtainOnWallLengthCm(elements: { type: string; length?: number }[]): number {
  return elements
    .filter(e => e.type === "subcurtain")
    .reduce((s, e) => s + (e.length || 0), 0);
}

const HINTS: Record<string, string> = {
  point: "Нажмите на комнату чтобы разместить",
  wall: "Нажмите на стену чтобы разместить",
  perimeter: "Нажмите на стену чтобы включить/выключить",
  door: "Нажмите на стену чтобы поставить дверь",
  window: "Нажмите на стену чтобы поставить окно",
  furniture: "Нажмите на комнату чтобы разместить",
};

// ── Geometry ──

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

interface Vertex { x: number; y: number }

function getVertices(walls: number[], normalCorners: boolean[], angles?: number[]): Vertex[] {
  const n = walls.length;
  const wallAngles = angles ?? normalCorners.map(nc => nc ? 90 : -90);
  const allRectilinear = wallAngles.every(a => a === 90 || a === -90);

  const vertices: Vertex[] = [{ x: 0, y: 0 }];

  if (allRectilinear) {
    let x = 0, y = 0, dir = 0;
    for (let i = 0; i < n; i++) {
      x += DX[dir] * walls[i];
      y += DY[dir] * walls[i];
      vertices.push({ x, y });
      dir = wallAngles[i] > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
  } else {
    let x = 0, y = 0, dirRad = 0;
    for (let i = 0; i < n; i++) {
      x += Math.cos(dirRad) * walls[i];
      y += Math.sin(dirRad) * walls[i];
      vertices.push({ x, y });
      dirRad += wallAngles[i] * Math.PI / 180;
    }
  }

  return vertices;
}

function nearestWall(px: number, py: number, vertices: Vertex[]): { wallIndex: number; dist: number; wallLength: number; t: number } {
  let best = { wallIndex: 0, dist: Infinity, wallLength: 0, t: 0.5 };
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx, projY = a.y + t * dy;
    const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    if (dist < best.dist) {
      best = { wallIndex: i, dist, wallLength: Math.sqrt(len2), t };
    }
  }
  return best;
}

function projectOnWall(px: number, py: number, a: Vertex, b: Vertex): Vertex {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

// ── Component ──

export default function RoomDesigner({ room, onDone, onCancel }: {
  room: Room;
  onDone: (elements: RoomElement[]) => void;
  onCancel: () => void;
}) {
  const [elements, setElements] = useState<RoomElement[]>(room.elements || []);
  const [activeType, setActiveType] = useState<ElementType | FurnitureType | null>(null);
  const [activeVariant, setActiveVariant] = useState<"ours" | "client">("ours");
  const [toolbarTab, setToolbarTab] = useState<ToolbarTab>("light");
  const [lengthInput, setLengthInput] = useState<{ wallIndex: number } | null>(null);
  const [lengthValue, setLengthValue] = useState("");
  const [lengthSide, setLengthSide] = useState<"left" | "center" | "right">("center");
  const [editingWallElId, setEditingWallElId] = useState<string | null>(null);
  // Подшторник: выбор формы (Прямой / П-ниша / Г-ниша) перед вводом размеров
  const [subcurtainShapeChoice, setSubcurtainShapeChoice] = useState<{ wallIndex: number } | null>(null);
  // Ввод размеров для П/Г-ниши
  const [nicheInput, setNicheInput] = useState<
    | {
        wallIndex: number;
        shape: "u-niche" | "l-bend";
        width: string;
        depth: string;
        side: "left" | "right";
        position: "left" | "center" | "right";
      }
    | null
  >(null);
  const [furnitureMenu, setFurnitureMenu] = useState<{ x: number; y: number; furnitureType: FurnitureType; defaultW: number; defaultH: number } | null>(null);
  const [furnW, setFurnW] = useState("");
  const [furnH, setFurnH] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  // View mode (2D editor / 3D preview)
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Align
  const [alignMode, setAlignMode] = useState(false);
  // Position editor
  const [posEditor, setPosEditor] = useState<{ elId: string; wall1Dist: string; wall2Dist: string } | null>(null);
  // Fixture width editor (doors/windows)
  const [fixtureEditor, setFixtureEditor] = useState<{ elId: string; width: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerHandled = useRef(false);
  const dragStartRef = useRef<{ id: string; cx: number; cy: number; moved: boolean } | null>(null);

  const vertices = getVertices(room.walls, room.normalCorners, room.angles);

  // Bounding box
  const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const roomW = maxX - minX, roomH = maxY - minY;
  const roomSize = Math.max(roomW, roomH);
  const pad = roomSize * 0.12;
  const baseVbX = minX - pad, baseVbY = minY - pad;
  const baseVbW = roomW + pad * 2, baseVbH = roomH + pad * 2;
  // Apply zoom and pan
  const vbW = baseVbW / zoom, vbH = baseVbH / zoom;
  const centerX = baseVbX + baseVbW / 2, centerY = baseVbY + baseVbH / 2;
  const vbX = centerX - vbW / 2 + pan.x, vbY = centerY - vbH / 2 + pan.y;

  // Grid snapping for spots
  const gridSize = roomSize * 0.02;
  function snapToGrid(val: number): number {
    return Math.round(val / gridSize) * gridSize;
  }

  // Scale factors
  const spotR = roomSize * 0.022;
  const chandelierR = roomSize * 0.045;
  const strokeW = roomSize * 0.012;
  const wallOffset = roomSize * 0.05;
  const labelSize = roomSize * 0.028;

  const furnitureElements = elements.filter(e => e.type === "furniture");
  const fixtureElements = elements.filter(e => e.type === "door" || e.type === "window");

  function svgCoords(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = new DOMPoint(clientX, clientY).matrixTransform(inv);
    return { x: pt.x, y: pt.y };
  }

  // ── Is the active type a furniture type? ──
  function isFurnitureActive(): FurnitureType | null {
    if (!activeType) return null;
    const f = FURNITURE.find(f => f.furnitureType === activeType);
    return f ? f.furnitureType : null;
  }

  // ── Drag & Drop ──

  const DRAG_THRESHOLD = 8;

  function handleElementPointerDown(id: string, e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragStartRef.current = { id, cx: e.clientX, cy: e.clientY, moved: false };
    setDragId(id);
  }

  function handleSVGPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const ds = dragStartRef.current;
    if (!ds) return;

    const dx = e.clientX - ds.cx;
    const dy = e.clientY - ds.cy;

    if (!ds.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    ds.moved = true;

    const coords = svgCoords(e.clientX, e.clientY);
    if (!coords) return;
    // Snap during drag for spots/chandeliers
    const dragEl = elements.find(el => el.id === ds.id);
    if (dragEl && (dragEl.type === "spot" || dragEl.type === "chandelier")) {
      setDragPos({ x: snapToGrid(coords.x), y: snapToGrid(coords.y) });
    } else {
      setDragPos(coords);
    }
  }

  function handleSVGPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const ds = dragStartRef.current;

    if (ds) {
      if (ds.moved) {
        const finalCoords = svgCoords(e.clientX, e.clientY);
        const dropPos = finalCoords || dragPos;
        if (dropPos) {
          const el = elements.find(el => el.id === ds.id);
          if (el) {
            if (el.type === "spot" || el.type === "chandelier" || el.type === "furniture") {
              const useSnap = el.type === "spot" || el.type === "chandelier";
              setElements(prev => prev.map(e =>
                e.id === ds.id ? { ...e, x: useSnap ? snapToGrid(dropPos.x) : dropPos.x, y: useSnap ? snapToGrid(dropPos.y) : dropPos.y } : e
              ));
            } else if (el.shape === "freeform" && el.points) {
              // Freeform-элемент (свет.линия, трек) — двигаем все точки на offset.
              const cx = el.points.reduce((s, p) => s + p.x, 0) / el.points.length;
              const cy = el.points.reduce((s, p) => s + p.y, 0) / el.points.length;
              const offX = dropPos.x - cx, offY = dropPos.y - cy;
              setElements(prev => prev.map(e =>
                e.id === ds.id && e.points
                  ? { ...e, points: e.points.map(p => ({ x: p.x + offX, y: p.y + offY })) }
                  : e
              ));
            } else if (el.type === "door" || el.type === "window") {
              const nearest = nearestWall(dropPos.x, dropPos.y, vertices);
              setElements(prev => prev.map(e =>
                e.id === ds.id ? { ...e, wallIndex: nearest.wallIndex, wallPosition: nearest.t } : e
              ));
            } else if (el.shape === "l-bend" && el.wallIndex !== undefined && el.depth) {
              // Г-ниша: один конец зашит в угол стены, drag = resize свободного конца.
              // Стена не меняется, меняется только длина и wallPosition (анкор остаётся на месте).
              const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
              if (a && b) {
                const dxw = b.x - a.x, dyw = b.y - a.y;
                const wL = Math.sqrt(dxw * dxw + dyw * dyw);
                const wallLenCm = room.walls[el.wallIndex] || 0;
                if (wL > 0 && wallLenCm > 0) {
                  const wnx = dxw / wL, wny = dyw / wL;
                  // t = проекция drop-точки на стену в [0..1]
                  const t = Math.max(0, Math.min(1, ((dropPos.x - a.x) * wnx + (dropPos.y - a.y) * wny) / wL));
                  // side="left" → анкор справа (1), свободный конец слева; новая длина = (1-t)*wallLen
                  // side="right" → анкор слева (0), свободный конец справа; новая длина = t*wallLen
                  const rawLen = el.side === "left" ? (1 - t) * wallLenCm : t * wallLenCm;
                  const newLenCm = Math.max(20, Math.min(wallLenCm, Math.round(rawLen)));
                  const newPos = el.side === "left"
                    ? 1 - newLenCm / 2 / wallLenCm
                    : newLenCm / 2 / wallLenCm;
                  setElements(prev => prev.map(e =>
                    e.id === ds.id ? { ...e, length: newLenCm, wallPosition: newPos } : e
                  ));
                }
              }
            } else {
              const config = ALL_ELEMENTS.find(c => c.type === el.type);
              if (config?.category === "wall") {
                const nearest = nearestWall(dropPos.x, dropPos.y, vertices);
                setElements(prev => prev.map(e =>
                  e.id === ds.id ? { ...e, wallIndex: nearest.wallIndex, wallPosition: nearest.t } : e
                ));
              }
            }
          }
        }
        setSelectedId(ds.id);
      } else {
        // Short tap — select or deselect
        if (selectedId === ds.id) {
          setSelectedId(null);
        } else {
          setSelectedId(ds.id);
        }
      }
      dragStartRef.current = null;
      setDragId(null);
      setDragPos(null);
      pointerHandled.current = true;
      return;
    }

    // Not dragging — place new element
    if (pointerHandled.current) { pointerHandled.current = false; return; }

    setSelectedId(null);

    const coords = svgCoords(e.clientX, e.clientY);
    if (!coords) return;

    // Check if placing furniture
    const furnType = isFurnitureActive();
    if (furnType) {
      const fCfg = FURNITURE.find(f => f.furnitureType === furnType)!;
      setFurnitureMenu({ x: coords.x, y: coords.y, furnitureType: furnType, defaultW: fCfg.defaultW, defaultH: fCfg.defaultH });
      setFurnW(String(fCfg.defaultW));
      setFurnH(String(fCfg.defaultH));
      return;
    }

    if (!activeType) return;

    // Door/Window
    if (activeType === "door" || activeType === "window") {
      const nearest = nearestWall(coords.x, coords.y, vertices);
      setElements(prev => [...prev, {
        id: crypto.randomUUID(),
        type: activeType,
        wallIndex: nearest.wallIndex,
        wallPosition: nearest.t,
        length: activeType === "door" ? 90 : 120,
      }]);
      return;
    }

    const config = ALL_ELEMENTS.find(el => el.type === activeType);
    if (!config) return;

    if (config.category === "point") {
      const hasVariant = activeType === "spot";
      setElements(prev => [...prev, {
        id: crypto.randomUUID(),
        type: activeType as ElementType,
        x: snapToGrid(coords.x),
        y: snapToGrid(coords.y),
        ...(hasVariant && { variant: activeVariant }),
      }]);
    } else if (config.category === "wall") {
      const nearest = nearestWall(coords.x, coords.y, vertices);
      // Подшторник — сначала спрашиваем форму (Прямой / П-ниша / Г-ниша)
      if (activeType === "subcurtain") {
        setSubcurtainShapeChoice({ wallIndex: nearest.wallIndex });
        return;
      }
      setLengthInput({ wallIndex: nearest.wallIndex });
      setLengthValue(String(Math.round(nearest.wallLength)));
      setLengthSide("center");
    } else if (config.category === "perimeter") {
      const nearest = nearestWall(coords.x, coords.y, vertices);
      setElements(prev => {
        const existing = prev.find(el => el.type === "floating" && el.wallIndex === nearest.wallIndex);
        if (existing) return prev.filter(el => el.id !== existing.id);
        return [...prev, {
          id: crypto.randomUUID(),
          type: "floating",
          wallIndex: nearest.wallIndex,
          length: nearest.wallLength,
        }];
      });
    }
  }

  function getElPos(el: RoomElement): { x: number; y: number } {
    if (dragId === el.id && dragPos && dragStartRef.current?.moved) {
      return dragPos;
    }
    return { x: el.x ?? 0, y: el.y ?? 0 };
  }

  function confirmLength() {
    if (!lengthInput) return;
    const len = parseFloat(lengthValue);
    if (!len || len <= 0) { setLengthInput(null); setEditingWallElId(null); return; }
    const wallLen = room.walls[lengthInput.wallIndex] || 0;
    const clampedLen = Math.min(len, wallLen);
    const pos = lengthSide === "left" ? clampedLen / 2 / wallLen
      : lengthSide === "right" ? 1 - clampedLen / 2 / wallLen
      : 0.5;

    if (editingWallElId) {
      // Editing existing element
      setElements(prev => prev.map(e =>
        e.id === editingWallElId ? { ...e, length: clampedLen, wallPosition: pos } : e
      ));
    } else {
      // Creating new element
      if (!activeType) return;
      const newId = crypto.randomUUID();

      // Световая линия и трек — freeform: создаём 2 точки у стены, потом
      // элемент можно перетащить в любую точку комнаты как софит.
      if (activeType === "lightline" || activeType === "track") {
        const a = vertices[lengthInput.wallIndex];
        const b = vertices[lengthInput.wallIndex + 1];
        if (a && b) {
          const dxw = b.x - a.x, dyw = b.y - a.y;
          const wL = Math.sqrt(dxw * dxw + dyw * dyw);
          if (wL > 0) {
            const nx = dxw / wL, ny = dyw / wL;
            const perpX = -ny, perpY = nx;
            const ratio = clampedLen / wallLen;
            const startTSvg = Math.max(0, Math.min(1 - ratio, pos - ratio / 2)) * wL;
            const endTSvg = startTSvg + ratio * wL;
            const off = wallOffset;
            const p1 = { x: a.x + nx * startTSvg + perpX * off, y: a.y + ny * startTSvg + perpY * off };
            const p2 = { x: a.x + nx * endTSvg + perpX * off, y: a.y + ny * endTSvg + perpY * off };
            setElements(prev => [...prev, {
              id: newId,
              type: activeType as ElementType,
              shape: "freeform",
              points: [p1, p2],
              length: clampedLen,
            }]);
            setSelectedId(newId);
            setActiveType(null);
            setLengthInput(null);
            setLengthValue("");
            setLengthSide("center");
            return;
          }
        }
      }

      const hasVariant = activeType === "spot";
      setElements(prev => [...prev, {
        id: newId,
        type: activeType as ElementType,
        wallIndex: lengthInput.wallIndex,
        wallPosition: pos,
        length: clampedLen,
        shape: "straight",
        ...(hasVariant && { variant: activeVariant }),
      }]);
    }
    setLengthInput(null);
    setLengthValue("");
    setLengthSide("center");
    setEditingWallElId(null);
  }

  /** Создание П-ниши (u-niche) или Г-ниши (l-bend) подшторника. */
  function confirmNiche() {
    if (!nicheInput) return;
    const w = parseFloat(nicheInput.width);
    const d = parseFloat(nicheInput.depth);
    if (!w || w <= 0 || !d || d <= 0) {
      setNicheInput(null);
      return;
    }
    const wallLen = room.walls[nicheInput.wallIndex] || 0;
    const clampedW = Math.min(w, wallLen);
    // Г-ниша всегда упирается одним концом в угол стены (anchor):
    // side="left" (загиб слева) → анкор на правом углу стены
    // side="right" (загиб справа) → анкор на левом углу стены
    // Свободный конец (загиб) можно тянуть, чтобы менять длину.
    let pos: number;
    if (nicheInput.shape === "l-bend") {
      pos = nicheInput.side === "left"
        ? 1 - clampedW / 2 / wallLen
        : clampedW / 2 / wallLen;
    } else {
      pos =
        nicheInput.position === "left" ? clampedW / 2 / wallLen
        : nicheInput.position === "right" ? 1 - clampedW / 2 / wallLen
        : 0.5;
    }
    setElements(prev => [...prev, {
      id: crypto.randomUUID(),
      type: "subcurtain",
      wallIndex: nicheInput.wallIndex,
      wallPosition: pos,
      length: clampedW,
      shape: nicheInput.shape,
      depth: d,
      ...(nicheInput.shape === "l-bend" && { side: nicheInput.side }),
    }]);
    setNicheInput(null);
    setActiveType(null);
  }

  function confirmFurniture() {
    if (!furnitureMenu) return;
    const w = parseFloat(furnW), h = parseFloat(furnH);
    if (!w || !h) { setFurnitureMenu(null); return; }
    setElements(prev => [...prev, {
      id: crypto.randomUUID(),
      type: "furniture",
      x: furnitureMenu.x,
      y: furnitureMenu.y,
      furnitureType: furnitureMenu.furnitureType,
      width: w,
      height: h,
      rotation: 0,
    }]);
    setFurnitureMenu(null);
  }

  function rotateSelected() {
    if (!selectedId) return;
    setElements(prev => prev.map(el =>
      el.id === selectedId ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 } : el
    ));
  }

  function removeSelected() {
    if (!selectedId) return;
    setElements(prev => prev.filter(el => el.id !== selectedId));
    setSelectedId(null);
  }

  function undo() { setElements(prev => prev.slice(0, -1)); }

  // ── Zoom & Pan ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(5, z * delta)));
  }, []);

  function handlePanStart(e: React.PointerEvent) {
    // Mouse: средняя кнопка или Ctrl+Left
    const isMousePan = e.button === 1 || (e.button === 0 && e.ctrlKey);
    // Touch: при увеличенном зуме палец на свободном месте — пэн
    // (не пэним когда у мастера в руке инструмент или активна форма ввода)
    const isTouchPan = e.pointerType === "touch" && zoom > 1.05 && !activeType
      && !lengthInput && !nicheInput && !subcurtainShapeChoice;
    if (isMousePan || isTouchPan) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  }

  function handlePanMove(e: React.PointerEvent) {
    if (!isPanning || !panStart.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = vbW / rect.width, scaleY = vbH / rect.height;
    const dx = (e.clientX - panStart.current.x) * scaleX;
    const dy = (e.clientY - panStart.current.y) * scaleY;
    setPan({ x: panStart.current.panX - dx, y: panStart.current.panY - dy });
  }

  function handlePanEnd() {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
  }

  // ── Align/Distribute spots ──
  function alignSpots(axis: "row" | "col") {
    const spotEls = elements.filter(e => e.type === "spot" && e.x !== undefined && e.y !== undefined);
    if (spotEls.length < 2) return;
    if (axis === "row") {
      const avgY = spotEls.reduce((s, e) => s + (e.y || 0), 0) / spotEls.length;
      const sorted = [...spotEls].sort((a, b) => (a.x || 0) - (b.x || 0));
      const minX = sorted[0].x!, maxX = sorted[sorted.length - 1].x!;
      const step = spotEls.length > 1 ? (maxX - minX) / (spotEls.length - 1) : 0;
      setElements(prev => prev.map(el => {
        const idx = sorted.findIndex(s => s.id === el.id);
        if (idx === -1) return el;
        return { ...el, x: minX + step * idx, y: avgY };
      }));
    } else {
      const avgX = spotEls.reduce((s, e) => s + (e.x || 0), 0) / spotEls.length;
      const sorted = [...spotEls].sort((a, b) => (a.y || 0) - (b.y || 0));
      const minY = sorted[0].y!, maxY = sorted[sorted.length - 1].y!;
      const step = spotEls.length > 1 ? (maxY - minY) / (spotEls.length - 1) : 0;
      setElements(prev => prev.map(el => {
        const idx = sorted.findIndex(s => s.id === el.id);
        if (idx === -1) return el;
        return { ...el, y: minY + step * idx, x: avgX };
      }));
    }
    setAlignMode(false);
  }

  // ── Position editor ──
  function openPosEditor() {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el || el.x === undefined || el.y === undefined) return;
    // Find 2 nearest walls
    const wallDists: { dist: number; wallIdx: number }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      const proj = projectOnWall(el.x, el.y, a, b);
      const dist = Math.hypot(el.x - proj.x, el.y - proj.y);
      wallDists.push({ dist, wallIdx: i });
    }
    wallDists.sort((a, b) => a.dist - b.dist);
    const d1 = Math.round(wallDists[0]?.dist || 0);
    const d2 = Math.round(wallDists[1]?.dist || 0);
    setPosEditor({ elId: selectedId, wall1Dist: String(d1), wall2Dist: String(d2) });
  }

  function applyPosEditor() {
    if (!posEditor) return;
    const el = elements.find(e => e.id === posEditor.elId);
    if (!el || el.x === undefined || el.y === undefined) return;
    const d1 = parseFloat(posEditor.wall1Dist), d2 = parseFloat(posEditor.wall2Dist);
    if (isNaN(d1) || isNaN(d2)) { setPosEditor(null); return; }
    // Find 2 nearest walls and compute new position
    const wallDists: { dist: number; wallIdx: number; proj: Vertex; normal: Vertex }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      const proj = projectOnWall(el.x, el.y, a, b);
      const dist = Math.hypot(el.x - proj.x, el.y - proj.y);
      const nx = dist > 0 ? (el.x - proj.x) / dist : 0;
      const ny = dist > 0 ? (el.y - proj.y) / dist : 0;
      wallDists.push({ dist, wallIdx: i, proj, normal: { x: nx, y: ny } });
    }
    wallDists.sort((a, b) => a.dist - b.dist);
    const w1 = wallDists[0], w2 = wallDists[1];
    if (!w1 || !w2) { setPosEditor(null); return; }
    // Move along each wall's normal from projection
    const newX = w1.proj.x + w1.normal.x * d1;
    const newY = w1.proj.y + w1.normal.y * d1;
    setElements(prev => prev.map(e => e.id === posEditor.elId ? { ...e, x: newX, y: newY } : e));
    setPosEditor(null);
  }

  // ── Dimension lines (from edge for furniture) ──

  function computeDimLines() {
    const dims: { x1: number; y1: number; x2: number; y2: number; label: string; color: string }[] = [];

    // Show dims for element being dragged (using live drag position)
    if (dragId && dragPos && dragStartRef.current?.moved) {
      const dragEl = elements.find(e => e.id === dragId);
      if (dragEl) {
        addWallDims({ ...dragEl, x: dragPos.x, y: dragPos.y }, dims);
      }
    }
    // Show dims for selected element (when not dragging)
    else if (selectedId) {
      const sel = elements.find(e => e.id === selectedId);
      if (sel) {
        const isFreeform = sel.shape === "freeform" && sel.points && sel.points.length >= 2;
        if (isFreeform || (sel.x !== undefined && sel.y !== undefined)) {
          addWallDims(sel, dims);
        }
      }
    }
    return dims;
  }

  function addWallDims(el: RoomElement, dims: { x1: number; y1: number; x2: number; y2: number; label: string; color: string }[]) {
    const isFreeformLine = el.shape === "freeform" && el.points && el.points.length >= 2;
    // Для freeform-линий (свет.линия, трек) считаем от ближайшего к стене КОНЦА линии,
    // а не от центра — иначе размер до перпендикулярной стены показывает расстояние
    // до середины (вводит в заблуждение).
    if (!isFreeformLine && (el.x === undefined || el.y === undefined)) return;
    const isFurn = el.type === "furniture" && el.width && el.height;

    let lp1: Vertex | null = null, lp2: Vertex | null = null;
    if (isFreeformLine) {
      const cx = el.points!.reduce((s, p) => s + p.x, 0) / el.points!.length;
      const cy = el.points!.reduce((s, p) => s + p.y, 0) / el.points!.length;
      const offX = el.x !== undefined ? el.x - cx : 0;
      const offY = el.y !== undefined ? el.y - cy : 0;
      const last = el.points!.length - 1;
      lp1 = { x: el.points![0].x + offX, y: el.points![0].y + offY };
      lp2 = { x: el.points![last].x + offX, y: el.points![last].y + offY };
    }

    const wallDists: { dist: number; proj: Vertex; edgePt: Vertex }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];

      if (isFreeformLine && lp1 && lp2) {
        const proj1 = projectOnWall(lp1.x, lp1.y, a, b);
        const proj2 = projectOnWall(lp2.x, lp2.y, a, b);
        const d1 = Math.hypot(lp1.x - proj1.x, lp1.y - proj1.y);
        const d2 = Math.hypot(lp2.x - proj2.x, lp2.y - proj2.y);
        if (d1 <= d2) wallDists.push({ dist: d1, proj: proj1, edgePt: lp1 });
        else wallDists.push({ dist: d2, proj: proj2, edgePt: lp2 });
        continue;
      }

      const proj = projectOnWall(el.x!, el.y!, a, b);
      const dist = Math.hypot(el.x! - proj.x, el.y! - proj.y);
      let edgePt: Vertex = { x: el.x!, y: el.y! };
      if (isFurn && dist > 0.01) {
        const dirX = (proj.x - el.x!) / dist;
        const dirY = (proj.y - el.y!) / dist;
        const rot = (el.rotation || 0) * Math.PI / 180;
        const localDirX = dirX * Math.cos(-rot) - dirY * Math.sin(-rot);
        const localDirY = dirX * Math.sin(-rot) + dirY * Math.cos(-rot);
        const halfW = el.width! / 2, halfH = el.height! / 2;
        const scaleX = Math.abs(localDirX) > 0.001 ? halfW / Math.abs(localDirX) : Infinity;
        const scaleY = Math.abs(localDirY) > 0.001 ? halfH / Math.abs(localDirY) : Infinity;
        const edgeDist = Math.min(scaleX, scaleY);
        edgePt = { x: el.x! + dirX * edgeDist, y: el.y! + dirY * edgeDist };
      }
      const edgeToWall = Math.hypot(edgePt.x - proj.x, edgePt.y - proj.y);
      wallDists.push({ dist: edgeToWall, proj, edgePt });
    }
    wallDists.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < Math.min(2, wallDists.length); i++) {
      const wd = wallDists[i];
      if (wd.dist > 5) dims.push({ x1: wd.proj.x, y1: wd.proj.y, x2: wd.edgePt.x, y2: wd.edgePt.y, label: `${Math.round(wd.dist)}`, color: "#94A3B8" });
    }
  }

  const dimLines = computeDimLines();

  // ── Render helpers ──

  function wallLine(el: RoomElement) {
    if (el.wallIndex === undefined || !el.length) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;

    const dx = b.x - a.x, dy = b.y - a.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return null;

    const nx = dx / wallLen, ny = dy / wallLen;
    const perpX = -ny, perpY = nx;

    const elLen = Math.min(el.length, wallLen);
    const pos = el.wallPosition ?? 0.5;
    const startT = Math.max(0, Math.min(wallLen - elLen, (pos * wallLen) - elLen / 2));
    const offset = el.type === "subcurtain" ? wallOffset * 0.15
      : (el.type === "curtain" || el.type === "builtin_gardina" || el.type === "shower_curtain") ? wallOffset * 1.5
      : wallOffset;

    const x1 = a.x + nx * startT + perpX * offset;
    const y1 = a.y + ny * startT + perpY * offset;
    const x2 = a.x + nx * (startT + elLen) + perpX * offset;
    const y2 = a.y + ny * (startT + elLen) + perpY * offset;

    const config = ALL_ELEMENTS.find(c => c.type === el.type)!;
    const strokeColor = el.type === "subcurtain" ? "#0F172A" : config.color;
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

    const isDragging = dragId === el.id && dragStartRef.current?.moved;

    let drawX1 = x1, drawY1 = y1, drawX2 = x2, drawY2 = y2;
    let drawMidX = midX, drawMidY = midY;
    let drawPerpX = perpX, drawPerpY = perpY;

    if (isDragging && dragPos) {
      const halfLen = (el.length || 0) / 2;
      const nearest = nearestWall(dragPos.x, dragPos.y, vertices);
      const da = vertices[nearest.wallIndex], db = vertices[nearest.wallIndex + 1];
      if (da && db) {
        const ddx = db.x - da.x, ddy = db.y - da.y;
        const dwLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const dnx = ddx / dwLen, dny = ddy / dwLen;
        drawPerpX = -dny; drawPerpY = dnx;
        drawX1 = dragPos.x - dnx * halfLen + drawPerpX * offset;
        drawY1 = dragPos.y - dny * halfLen + drawPerpY * offset;
        drawX2 = dragPos.x + dnx * halfLen + drawPerpX * offset;
        drawY2 = dragPos.y + dny * halfLen + drawPerpY * offset;
        drawMidX = dragPos.x + drawPerpX * offset;
        drawMidY = dragPos.y + drawPerpY * offset;
      }
    }

    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        {/* Невидимая толстая обводка — расширенная зона тапа/перетаскивания.
            Для тонких линий (lightline, track) без неё пальцем/мышкой не попасть. */}
        <line x1={drawX1} y1={drawY1} x2={drawX2} y2={drawY2}
          stroke="transparent" strokeWidth={strokeW * 12} strokeLinecap="round" />
        <line x1={drawX1} y1={drawY1} x2={drawX2} y2={drawY2}
          stroke={strokeColor}
          strokeWidth={el.type === "lightline" ? strokeW * 1.5 : el.type === "builtin_gardina" ? strokeW * 2 : el.type === "subcurtain" ? strokeW * 1.8 : strokeW}
          strokeLinecap="round"
          strokeDasharray={el.type === "track" ? `${strokeW * 2.5} ${strokeW * 1.2}` : undefined}
          opacity={0.9}
        />
        {el.type === "track" && (
          <>
            <circle cx={drawX1} cy={drawY1} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
            <circle cx={drawX2} cy={drawY2} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
          </>
        )}
        {el.type === "subcurtain" && (
          <>
            <line x1={drawX1 + drawPerpX * strokeW * 2} y1={drawY1 + drawPerpY * strokeW * 2}
              x2={drawX1 - drawPerpX * strokeW * 2} y2={drawY1 - drawPerpY * strokeW * 2}
              stroke={strokeColor} strokeWidth={strokeW * 0.8} strokeLinecap="round" opacity={0.9} />
            <line x1={drawX2 + drawPerpX * strokeW * 2} y1={drawY2 + drawPerpY * strokeW * 2}
              x2={drawX2 - drawPerpX * strokeW * 2} y2={drawY2 - drawPerpY * strokeW * 2}
              stroke={strokeColor} strokeWidth={strokeW * 0.8} strokeLinecap="round" opacity={0.9} />
          </>
        )}
        {(() => {
          const elTx = drawMidX + drawPerpX * labelSize * 1.5;
          const elTy = drawMidY + drawPerpY * labelSize * 1.5;
          let elAng = Math.atan2(dy, dx) * 180 / Math.PI;
          if (elAng > 90 || elAng <= -90) elAng += 180;
          return (
            <text x={elTx} y={elTy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={labelSize * 0.85} fill={strokeColor} fontWeight="600"
              transform={`rotate(${elAng}, ${elTx}, ${elTy})`}>
              {el.length} см
            </text>
          );
        })()}
        {/* Distance from wall edges when selected/dragging */}
        {(selectedId === el.id || isDragging) && !isDragging && (() => {
          const distFromEdge = Math.round(startT);
          const distFromEnd = Math.round(wallLen - (startT + elLen));
          const outPX = -ny, outPY = nx;
          let edgeAng = Math.atan2(dy, dx) * 180 / Math.PI;
          if (edgeAng > 90 || edgeAng <= -90) edgeAng += 180;
          const ex1 = (a.x + x1) / 2 + outPX * offset + outPX * labelSize;
          const ey1 = (a.y + y1) / 2 + outPY * offset + outPY * labelSize;
          const ex2 = (a.x + nx * (startT + elLen) + b.x) / 2 + outPX * offset + outPX * labelSize;
          const ey2 = (a.y + ny * (startT + elLen) + b.y) / 2 + outPY * offset + outPY * labelSize;
          return (
            <>
              {distFromEdge > 5 && (
                <text x={ex1} y={ey1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={labelSize * 0.55} fill="#64748B" fontWeight="600"
                  transform={`rotate(${edgeAng}, ${ex1}, ${ey1})`}>
                  {distFromEdge}
                </text>
              )}
              {distFromEnd > 5 && (
                <text x={ex2} y={ey2}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={labelSize * 0.55} fill="#64748B" fontWeight="600"
                  transform={`rotate(${edgeAng}, ${ex2}, ${ey2})`}>
                  {distFromEnd}
                </text>
              )}
            </>
          );
        })()}
      </g>
    );
  }

  function floatingGlow(el: RoomElement) {
    if (el.wallIndex === undefined) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;

    return (
      <g key={el.id} onPointerDown={(e) => handleElementPointerDown(el.id, e)} className="cursor-pointer">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#60A5FA" strokeWidth={strokeW * 4} strokeLinecap="round" opacity={0.2} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#3B82F6" strokeWidth={strokeW * 2} strokeLinecap="round" opacity={0.5} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#93C5FD" strokeWidth={strokeW * 0.8} strokeLinecap="round" opacity={0.9} />
      </g>
    );
  }

  /**
   * Рендер П-ниши и Г-ниши подшторника.
   * П: подшторник вдоль стены + две боковины уходят вглубь комнаты + дальняя стенка.
   * Г: подшторник вдоль стены + одна боковина (left или right).
   */
  function nicheRender(el: RoomElement) {
    if (el.wallIndex === undefined || !el.length || !el.depth) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;
    const dxw = b.x - a.x, dyw = b.y - a.y;
    const wL = Math.sqrt(dxw * dxw + dyw * dyw);
    if (wL === 0) return null;
    const nx = dxw / wL, ny = dyw / wL;
    const perpX = -ny, perpY = nx; // внутрь комнаты

    const isDraggingNiche = dragId === el.id && dragPos && dragStartRef.current?.moved;
    const wallLenCm = room.walls[el.wallIndex] || 0;

    // Живой preview Г-ниши при drag: длина пересчитывается из позиции пальца,
    // анкор остаётся на углу стены.
    let elLen = Math.min(el.length, wL);
    let pos = el.wallPosition ?? 0.5;
    if (isDraggingNiche && el.shape === "l-bend" && wallLenCm > 0 && dragPos) {
      const t = Math.max(0, Math.min(1, ((dragPos.x - a.x) * nx + (dragPos.y - a.y) * ny) / wL));
      const rawLen = el.side === "left" ? (1 - t) * wallLenCm : t * wallLenCm;
      const previewLenCm = Math.max(20, Math.min(wallLenCm, rawLen));
      elLen = (previewLenCm / wallLenCm) * wL;
      pos = el.side === "left" ? 1 - previewLenCm / 2 / wallLenCm : previewLenCm / 2 / wallLenCm;
    }
    const startT = Math.max(0, Math.min(wL - elLen, pos * wL - elLen / 2));
    // Подшторник идёт ПО самой стене (offset=0), чтобы перекрывать линию стены
    // и визуально «заменять» её в этом участке
    const x1 = a.x + nx * startT;
    const y1 = a.y + ny * startT;
    const x2 = a.x + nx * (startT + elLen);
    const y2 = a.y + ny * (startT + elLen);

    const isSel = selectedId === el.id;
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const dpth = el.depth;

    // Точки в глубине ниши (концы боковин — внутри комнаты)
    const px1 = x1 + perpX * dpth, py1 = y1 + perpY * dpth;
    const px2 = x2 + perpX * dpth, py2 = y2 + perpY * dpth;

    const isU = el.shape === "u-niche";
    const isLBendLeft = el.shape === "l-bend" && el.side !== "right";
    const isLBendRight = el.shape === "l-bend" && el.side === "right";

    // Заливка прямоугольного «кармана» — лёгкий тон чтобы видеть объём ниши
    const fillPath = `M ${x1} ${y1} L ${px1} ${py1} L ${px2} ${py2} L ${x2} ${y2} Z`;

    const totalLen = isU ? elLen + 2 * dpth : elLen + dpth;
    const midX = (x1 + x2) / 2 + perpX * dpth * 0.5;
    const midY = (y1 + y2) / 2 + perpY * dpth * 0.5;

    // Цвет подшторника — тёмный, как нарисовано ручкой; перекрывает серую стену
    const podColor = "#0F172A";
    const podWidth = strokeW * 1.0; // чуть толще обычной стены (strokeW * 0.6)

    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        {/* Лёгкая заливка кармана — показывает объём ниши (где раньше был «потолок»,
            теперь подшторник). Стена комнаты остаётся видна по полигону. */}
        <path d={fillPath} fill={podColor} opacity={0.07} />

        {/* Невидимая толстая зона тапа — на ФРОНТЕ ниши (где теперь основная линия) */}
        <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="transparent" strokeWidth={strokeW * 8} strokeLinecap="round" />

        {/* 1. Фронт ниши (внутри комнаты, на глубине depth) — главная сплошная линия,
            новая граница натяжного потолка. Раньше рисовали по стене — но физически
            подшторник стоит на расстоянии depth от стены, образуя карман для штор. */}
        <line x1={px1} y1={py1} x2={px2} y2={py2}
          stroke={podColor} strokeWidth={podWidth} strokeLinecap="butt" />

        {/* 2. Левая боковина — соединяет стену с фронтом (для П и Г-left) */}
        {(isU || isLBendLeft) && (
          <line x1={x1} y1={y1} x2={px1} y2={py1}
            stroke={podColor} strokeWidth={podWidth} strokeLinecap="butt" />
        )}

        {/* 3. Правая боковина — соединяет стену с фронтом (для П и Г-right) */}
        {(isU || isLBendRight) && (
          <line x1={x2} y1={y2} x2={px2} y2={py2}
            stroke={podColor} strokeWidth={podWidth} strokeLinecap="butt" />
        )}

        {/* 4. Сама стена в участке подшторника — НЕ рисуем поверх (полигон комнаты
            уже её рисует серой линией, что и есть «еле видная полоса»). */}

        {/* Подпись общей длины подшторника */}
        <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.85} fill={podColor} fontWeight="600">
          {Math.round(totalLen)} см
        </text>

        {isSel && (
          <path d={fillPath} stroke={podColor} strokeWidth={strokeW * 0.5}
            fill="none" strokeDasharray={`${strokeW * 1.5} ${strokeW * 0.8}`} opacity={0.5} />
        )}
      </g>
    );
  }

  /**
   * Свободно перемещаемая линия (свет.линия и трек) — points вместо wallIndex.
   * Двигается в любую точку комнаты как софит, не привязана к стене.
   */
  function freeformLine(el: RoomElement) {
    if (!el.points || el.points.length < 2) return null;
    const config = ALL_ELEMENTS.find(c => c.type === el.type);
    if (!config) return null;
    const isDragging = dragId === el.id && dragStartRef.current?.moved;

    // Во время drag — смещаем все точки на offset до dragPos
    let drawPoints = el.points;
    if (isDragging && dragPos) {
      const cx = el.points.reduce((s, p) => s + p.x, 0) / el.points.length;
      const cy = el.points.reduce((s, p) => s + p.y, 0) / el.points.length;
      const offX = dragPos.x - cx, offY = dragPos.y - cy;
      drawPoints = el.points.map(p => ({ x: p.x + offX, y: p.y + offY }));
    }

    const p1 = drawPoints[0], p2 = drawPoints[drawPoints.length - 1];
    const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lineLen = Math.hypot(dx, dy) || 1;
    const perpX = -dy / lineLen, perpY = dx / lineLen;
    const isSel = selectedId === el.id;

    let labelAng = Math.atan2(dy, dx) * 180 / Math.PI;
    if (labelAng > 90 || labelAng <= -90) labelAng += 180;
    const elTx = midX + perpX * labelSize * 1.5;
    const elTy = midY + perpY * labelSize * 1.5;

    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        {/* Невидимая толстая обводка — расширенная зона тапа/перетаскивания. */}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="transparent" strokeWidth={strokeW * 12} strokeLinecap="round" />
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke={config.color}
          strokeWidth={el.type === "lightline" ? strokeW * 1.5 : strokeW}
          strokeLinecap="round"
          strokeDasharray={el.type === "track" ? `${strokeW * 2.5} ${strokeW * 1.2}` : undefined}
          opacity={0.9}
        />
        {el.type === "track" && (
          <>
            <circle cx={p1.x} cy={p1.y} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
            <circle cx={p2.x} cy={p2.y} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
          </>
        )}
        {/* Подпись длины */}
        <text x={elTx} y={elTy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.85} fill={config.color} fontWeight="600"
          transform={`rotate(${labelAng}, ${elTx}, ${elTy})`}>
          {el.length} см
        </text>
        {/* Контур выделения */}
        {isSel && (
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={config.color} strokeWidth={strokeW * 5} strokeLinecap="round"
            opacity={0.25} strokeDasharray={`${strokeW * 1.5} ${strokeW * 0.8}`} />
        )}
      </g>
    );
  }

  function spotCircle(el: RoomElement) {
    const pos = getElPos(el);
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const isClient = el.variant === "client";
    const fillColor = isClient ? "#6B7280" : "#F59E0B";
    const glowColor = isClient ? "#E5E7EB" : "#FEF3C7";
    const strokeColor = isClient ? "#4B5563" : "#D97706";
    const isSel = selectedId === el.id;
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        <circle cx={pos.x} cy={pos.y} r={spotR * 4} fill="transparent" />
        {isSel && <circle cx={pos.x} cy={pos.y} r={spotR * 1.4} fill="none" stroke={fillColor} strokeWidth={spotR * 0.2} strokeDasharray={`${spotR * 0.5},${spotR * 0.3}`} />}
        <circle cx={pos.x} cy={pos.y} r={spotR * 0.7} fill="none" stroke={fillColor} strokeWidth={spotR * 0.28} />
        {isClient && (
          <text x={pos.x} y={pos.y + spotR * 3.5} textAnchor="middle" fontSize={labelSize * 0.6} fill="#6B7280">кл.</text>
        )}
      </g>
    );
  }

  function chandelierIcon(el: RoomElement) {
    const pos = getElPos(el);
    const r = roomSize * 0.025;
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const isSel = selectedId === el.id;
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        <circle cx={pos.x} cy={pos.y} r={r * 2} fill="transparent" />
        {isSel && <circle cx={pos.x} cy={pos.y} r={r * 1.8} fill="none" stroke="#8B5CF6" strokeWidth={spotR * 0.2} strokeDasharray={`${spotR * 0.5},${spotR * 0.3}`} />}
        <circle cx={pos.x} cy={pos.y} r={r} fill="none" stroke="#8B5CF6" strokeWidth={spotR * 0.32} />
        <circle cx={pos.x} cy={pos.y} r={spotR * 0.35} fill="#8B5CF6" />
      </g>
    );
  }

  function fixtureRender(el: RoomElement) {
    if (el.wallIndex === undefined) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return null;
    const nx = dx / wallLen, ny = dy / wallLen;
    const elLen = el.length || (el.type === "door" ? 90 : 120);
    const pos = el.wallPosition ?? 0.5;
    const startT = Math.max(0, Math.min(wallLen - elLen, (pos * wallLen) - elLen / 2));
    const endT = startT + elLen;
    const distFromEdge = Math.round(startT);
    const distFromEnd = Math.round(wallLen - endT);

    const x1 = a.x + nx * startT;
    const y1 = a.y + ny * startT;
    const x2 = a.x + nx * endT;
    const y2 = a.y + ny * endT;

    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const color = el.type === "door" ? "#78716C" : "#60A5FA";
    const isSel = selectedId === el.id;
    const showDims = isSel || isDragging;

    // Perpendicular direction (outward)
    const perpX = ny, perpY = -nx;

    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.6 : 0.5}
      >
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="transparent" strokeWidth={strokeW * 6} strokeLinecap="round" />
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={strokeW * 2.5} strokeLinecap="round"
        />
        {isSel && (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth={strokeW * 4} strokeLinecap="round" opacity={0.3}
          />
        )}
        <text
          x={(x1 + x2) / 2 + perpX * labelSize * 1.5} y={(y1 + y2) / 2 + perpY * labelSize * 1.5}
          textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.7} fill={color} fontWeight="500"
        >
          {el.type === "door" ? "🚪" : "🪟"}
        </text>
        {/* Distance from edge labels */}
        {showDims && distFromEdge > 5 && (
          <>
            <line x1={a.x} y1={a.y} x2={x1} y2={y1}
              stroke="#94A3B8" strokeWidth={strokeW * 0.4} strokeDasharray={`${strokeW},${strokeW * 0.8}`} />
            <text
              x={(a.x + x1) / 2 + perpX * labelSize * 1.2} y={(a.y + y1) / 2 + perpY * labelSize * 1.2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={labelSize * 0.6} fill="#64748B" fontWeight="600"
            >
              {distFromEdge}
            </text>
          </>
        )}
        {showDims && distFromEnd > 5 && (
          <>
            <line x1={x2} y1={y2} x2={b.x} y2={b.y}
              stroke="#94A3B8" strokeWidth={strokeW * 0.4} strokeDasharray={`${strokeW},${strokeW * 0.8}`} />
            <text
              x={(x2 + b.x) / 2 + perpX * labelSize * 1.2} y={(y2 + b.y) / 2 + perpY * labelSize * 1.2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={labelSize * 0.6} fill="#64748B" fontWeight="600"
            >
              {distFromEnd}
            </text>
          </>
        )}
      </g>
    );
  }

  function furnitureRender(el: RoomElement) {
    if (el.x === undefined || el.y === undefined || !el.width || !el.height) return null;
    const fCfg = FURNITURE.find(f => f.furnitureType === el.furnitureType);
    const clr = fCfg?.color || "#78716C";
    const isSel = selectedId === el.id;
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const rot = el.rotation || 0;
    const w = el.width, h = el.height;
    const pos = getElPos(el);

    // In light tab, furniture should not intercept pointer events
    const pointerEvents = toolbarTab === "light" ? "none" as const : undefined;

    return (
      <g key={el.id} transform={`translate(${pos.x}, ${pos.y}) rotate(${rot})`}
        onPointerDown={toolbarTab !== "light" ? (e) => handleElementPointerDown(el.id, e) : undefined}
        className={toolbarTab !== "light" ? "cursor-grab active:cursor-grabbing" : ""}
        opacity={isDragging ? 0.7 : 1}
        pointerEvents={pointerEvents}
      >
        {isSel && (
          <rect x={-w / 2 - roomSize * 0.01} y={-h / 2 - roomSize * 0.01}
            width={w + roomSize * 0.02} height={h + roomSize * 0.02}
            rx={roomSize * 0.01} fill="none" stroke={clr}
            strokeWidth={spotR * 0.25} strokeDasharray={`${spotR * 0.5},${spotR * 0.3}`} />
        )}
        <rect x={-w / 2} y={-h / 2} width={w} height={h}
          rx={roomSize * 0.008} fill={clr} opacity={0.12}
          stroke={clr} strokeWidth={strokeW * 0.5} />
        {/* Inner details */}
        {el.furnitureType === "bed" && (
          <>
            <rect x={-w / 2 + w * 0.08} y={-h / 2 + h * 0.06} width={w * 0.38} height={h * 0.22}
              rx={roomSize * 0.005} fill={clr} opacity={0.2} />
            <rect x={w / 2 - w * 0.08 - w * 0.38} y={-h / 2 + h * 0.06} width={w * 0.38} height={h * 0.22}
              rx={roomSize * 0.005} fill={clr} opacity={0.2} />
          </>
        )}
        {el.furnitureType === "sofa" && (
          <>
            <rect x={-w / 2 + w * 0.05} y={-h / 2 + h * 0.05}
              width={w * 0.9} height={h * 0.25}
              rx={roomSize * 0.005} fill={clr} opacity={0.2} />
            <line x1={0} y1={-h / 2 + h * 0.35} x2={0} y2={h / 2 - h * 0.1}
              stroke={clr} strokeWidth={strokeW * 0.3} opacity={0.2} />
          </>
        )}
        {el.furnitureType === "wardrobe" && (
          <line x1={0} y1={-h / 2 + h * 0.1} x2={0} y2={h / 2 - h * 0.1}
            stroke={clr} strokeWidth={strokeW * 0.3} opacity={0.25} />
        )}
        {el.furnitureType === "tv" && (
          <rect x={-w / 2 + w * 0.1} y={-h * 0.3} width={w * 0.8} height={h * 0.6}
            fill={clr} opacity={0.25} rx={roomSize * 0.003} />
        )}
        {/* Label */}
        <text x={0} y={labelSize * 0.35} textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.7} fill={clr} fontWeight="600" opacity={0.8}>
          {fCfg?.label || ""}
        </text>
        <text x={0} y={h / 2 + labelSize * 1.2} textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.55} fill="#94A3B8" fontWeight="500">
          {w}x{h}
        </text>
      </g>
    );
  }

  // ── DimLine component ──
  function DimLine({ x1, y1, x2, y2, label, color }: { x1: number; y1: number; x2: number; y2: number; label: string; color: string }) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const perpX = -dy / len, perpY = dx / len;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={spotR * 0.15}
          strokeDasharray={`${spotR * 0.4},${spotR * 0.3}`} opacity={0.6} />
        <circle cx={x1} cy={y1} r={spotR * 0.2} fill={color} opacity={0.5} />
        <circle cx={x2} cy={y2} r={spotR * 0.2} fill={color} opacity={0.5} />
        {(() => {
          const tx = mx + perpX * labelSize * 0.8, ty = my + perpY * labelSize * 0.8;
          let ang = Math.atan2(dy, dx) * 180 / Math.PI;
          if (ang > 90 || ang <= -90) ang += 180;
          return (
            <text x={tx} y={ty}
              textAnchor="middle" dominantBaseline="central"
              fontSize={labelSize * 0.7} fill={color} fontWeight="600"
              transform={`rotate(${ang}, ${tx}, ${ty})`}>
              {label}
            </text>
          );
        })()}
      </g>
    );
  }

  // ── Summary badges ──
  const summary: { icon: string; label: string; color: string }[] = [];
  const spots = elements.filter(e => e.type === "spot").length;
  const spotsOursCount = elements.filter(e => e.type === "spot" && e.variant !== "client").length;
  const spotsClientCount = elements.filter(e => e.type === "spot" && e.variant === "client").length;
  const chands = elements.filter(e => e.type === "chandelier").length;
  const doors = fixtureElements.filter(e => e.type === "door").length;
  const windows = fixtureElements.filter(e => e.type === "window").length;
  const furnitureCount = furnitureElements.length;
  if (spotsOursCount > 0) summary.push({ icon: "💡", label: `${spotsOursCount} наши`, color: "bg-amber-50 text-amber-700" });
  if (spotsClientCount > 0) summary.push({ icon: "💡", label: `${spotsClientCount} кл.`, color: "bg-gray-100 text-gray-600" });
  if (chands > 0) summary.push({ icon: "🔆", label: `${chands} шт`, color: "bg-purple-50 text-purple-700" });
  if (doors > 0) summary.push({ icon: "🚪", label: `${doors} шт`, color: "bg-gray-100 text-gray-600" });
  if (windows > 0) summary.push({ icon: "🪟", label: `${windows} шт`, color: "bg-blue-50 text-blue-600" });
  if (furnitureCount > 0) summary.push({ icon: "🪑", label: `${furnitureCount} шт`, color: "bg-violet-50 text-violet-600" });
  for (const type of ["curtain", "subcurtain", "track", "lightline"] as ElementType[]) {
    const items = elements.filter(e => e.type === type);
    if (items.length > 0) {
      const totalLen = items.reduce((s, e) => s + (e.length || 0), 0);
      const cfg = ALL_ELEMENTS.find(c => c.type === type)!;
      summary.push({ icon: cfg.icon, label: `${totalLen} см`, color: "bg-gray-50 text-gray-700" });
    }
  }
  const floatingCount = elements.filter(e => e.type === "floating").length;
  const floatingLenCm = elements.filter(e => e.type === "floating").reduce((s, e) => s + (e.length || 0), 0);
  if (floatingCount > 0) summary.push({ icon: "〰️", label: `${floatingCount} стен`, color: "bg-blue-50 text-blue-700" });

  // ── Live cost estimate ──
  function calcLiveCost(): number {
    const p = DEFAULT_PRICES;
    let cost = 0;
    cost += room.area * (p.canvas_320 || 2000);
    // Багет/вставка идут только по стенам, НЕ под подшторником.
    // Вычитаем только участок стены, покрытый подшторником (e.length),
    // глубина ниши (2*depth для П, depth для Г) — это сам подшторник, не стена.
    const podOnWallM = subcurtainOnWallLengthCm(elements) / 100;
    const profilePerim = Math.max(0, room.perimeter - podOnWallM);
    cost += profilePerim * (p.profile_plastic || 500);
    cost += profilePerim * (p.insert || 1000);
    cost += room.walls.length * (p.corner_plastic || 1000);
    const spotsOurs = elements.filter(e => e.type === "spot" && e.variant !== "client").length;
    const spotsClient = elements.filter(e => e.type === "spot" && e.variant === "client").length;
    cost += spotsOurs * (p.spot_ours || 5000);
    cost += spotsClient * (p.spot_client || 2500);
    cost += chands * ((p.chandelier || 2000) + (p.chandelier_install || 5000));
    const trackOursM = elements.filter(e => e.type === "track" && e.variant !== "client").reduce((s, e) => s + (e.length || 0), 0) / 100;
    const trackClientM = elements.filter(e => e.type === "track" && e.variant === "client").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += trackOursM * (p.track_magnetic || 27000);
    cost += trackClientM * Math.round((p.track_magnetic || 27000) * 0.4);
    const lightM = elements.filter(e => e.type === "lightline").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += lightM * (p.light_line || 15000);
    const gardinaM = elements.filter(e => e.type === "curtain").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += gardinaM * (p.gardina_plastic || 5000);
    const podM = totalSubcurtainLengthCm(elements) / 100;
    cost += podM * (p.podshtornik_aluminum || 8000);
    const floatingM = floatingLenCm / 100;
    cost += floatingM * (p.profile_floating || 14000);
    return Math.round(cost);
  }

  const liveCost = elements.length > 0 ? calcLiveCost() : 0;

  function formatPrice(n: number): string {
    return n.toLocaleString("ru-RU");
  }

  // ── WhatsApp share ──
  function handleShare() {
    const name = room.name || "Помещение";
    const lines = [`📐 ${name}: ${room.area} м², P = ${room.perimeter} м`];
    lines.push(`Стены: ${room.walls.join(" · ")} см`);
    if (spots > 0) lines.push(`💡 Софиты: ${spots} шт`);
    if (chands > 0) lines.push(`🔆 Люстры: ${chands} шт`);
    if (doors > 0) lines.push(`🚪 Двери: ${doors} шт`);
    if (windows > 0) lines.push(`🪟 Окна: ${windows} шт`);
    if (furnitureCount > 0) lines.push(`🪑 Мебель: ${furnitureCount} шт`);
    const trackCm = elements.filter(e => e.type === "track").reduce((s, e) => s + (e.length || 0), 0);
    if (trackCm > 0) lines.push(`🔲 Магнитный трек: ${trackCm} см`);
    const lightCm = elements.filter(e => e.type === "lightline").reduce((s, e) => s + (e.length || 0), 0);
    if (lightCm > 0) lines.push(`✨ Световая линия: ${lightCm} см`);
    const gardinaCm = elements.filter(e => e.type === "curtain").reduce((s, e) => s + (e.length || 0), 0);
    if (gardinaCm > 0) lines.push(`📏 Гардина: ${gardinaCm} см`);
    const podCm = Math.round(totalSubcurtainLengthCm(elements));
    if (podCm > 0) lines.push(`📐 Подшторник: ${podCm} см`);
    if (floatingCount > 0) lines.push(`〰️ Парящий: ${floatingCount} стен`);
    if (liveCost > 0) lines.push(`\n💰 Ориентировочно: ${formatPrice(liveCost)} ₸`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  // ── Hint ──
  const spotsCount = elements.filter(e => e.type === "spot").length;
  let hintText = "Выберите элемент из панели внизу ↓";
  if (alignMode) {
    hintText = "Выберите направление выравнивания ↔ или ↕";
  } else if (selectedId) {
    const sel = elements.find(e => e.id === selectedId);
    hintText = sel?.type === "furniture" ? "Перетащите · 🔄 Повернуть · 📏 Позиция · 🗑️" : "Перетащите · 📏 Позиция · 🗑️";
  } else if (activeType) {
    const furnType = isFurnitureActive();
    if (furnType) {
      hintText = HINTS.furniture;
    } else if (activeType === "door" || activeType === "window") {
      hintText = HINTS[activeType];
    } else {
      const config = ALL_ELEMENTS.find(e => e.type === activeType);
      if (config) hintText = `${config.icon} ${config.label}: ${HINTS[config.category]}`;
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white"
      style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <button onClick={onCancel} className="p-1 -ml-1 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">{room.name || "Дизайн"} · {room.area} м²</span>
        <button onClick={() => onDone(elements)}
          className="flex items-center gap-1 text-sm font-semibold text-[#1e3a5f] px-3 py-2 -mr-2 active:bg-blue-50 rounded-lg min-h-[44px]">
          <Check className="h-4 w-4" /> Готово
        </button>
      </div>

      {/* Hint + selected actions */}
      <div className="shrink-0 px-4 py-2 text-center border-b bg-gray-50 flex items-center justify-center gap-3">
        <p className="text-xs text-muted-foreground">{hintText}</p>
        {selectedId && (
          <div className="flex gap-2">
            {/* Rotate */}
            {(elements.find(e => e.id === selectedId)?.type === "furniture"
              || elements.find(e => e.id === selectedId)?.type === "spot"
              || elements.find(e => e.id === selectedId)?.type === "chandelier") && (
              <button onClick={rotateSelected}
                className="p-2.5 rounded-xl bg-violet-100 text-violet-700 hover:bg-violet-200 active:scale-95 shadow-sm"
                title="Повернуть">
                <RotateCw className="h-5 w-5" />
              </button>
            )}
            {/* Position editor */}
            {(elements.find(e => e.id === selectedId)?.x !== undefined) && (
              <button onClick={openPosEditor}
                className="p-2.5 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 active:scale-95 shadow-sm"
                title="Точная позиция">
                <Move className="h-5 w-5" />
              </button>
            )}
            {/* Width editor for doors/windows */}
            {(elements.find(e => e.id === selectedId)?.type === "door" || elements.find(e => e.id === selectedId)?.type === "window") && (
              <button onClick={() => {
                const el = elements.find(e => e.id === selectedId);
                if (el) setFixtureEditor({ elId: el.id, width: String(el.length || (el.type === "door" ? 90 : 120)) });
              }}
                className="px-3 py-2 rounded-xl bg-cyan-100 text-cyan-700 text-xs font-semibold hover:bg-cyan-200 active:scale-95 shadow-sm"
                title="Ширина">
                📏 Ширина
              </button>
            )}
            {/* Size editor for wall elements (subcurtain, curtain, track, etc.) */}
            {(() => {
              const selEl = elements.find(e => e.id === selectedId);
              const selCfg = selEl ? ALL_ELEMENTS.find(c => c.type === selEl.type) : null;
              if (!selEl || !selCfg || selCfg.category !== "wall") return null;
              return (
                <button onClick={() => {
                  if (selEl.wallIndex != null) {
                    setEditingWallElId(selEl.id);
                    setLengthInput({ wallIndex: selEl.wallIndex });
                    setLengthValue(String(Math.round(selEl.length || 0)));
                    const wallLen = room.walls[selEl.wallIndex] || 1;
                    const pos = selEl.wallPosition ?? 0.5;
                    const halfRatio = (selEl.length || 0) / 2 / wallLen;
                    if (pos <= halfRatio + 0.05) setLengthSide("left");
                    else if (pos >= 1 - halfRatio - 0.05) setLengthSide("right");
                    else setLengthSide("center");
                  }
                }}
                  className="px-3 py-2 rounded-xl bg-cyan-100 text-cyan-700 text-xs font-semibold hover:bg-cyan-200 active:scale-95 shadow-sm"
                  title="Размер">
                  📏 Размер
                </button>
              );
            })()}
            <button onClick={removeSelected}
              className="p-2.5 rounded-xl bg-red-100 text-red-600 text-sm font-medium hover:bg-red-200 active:scale-95 shadow-sm">
              🗑️
            </button>
          </div>
        )}
        {/* Align spots */}
        {!selectedId && elements.filter(e => e.type === "spot").length >= 2 && (
          <div className="flex gap-2">
            {!alignMode ? (
              <button onClick={() => setAlignMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 active:scale-95 shadow-sm"
                title="Выровнять софиты">
                <AlignHorizontalSpaceBetween className="h-4 w-4" />
                Выровнять
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => alignSpots("row")}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-medium active:scale-95 shadow-sm">
                  ↔ В ряд
                </button>
                <button onClick={() => alignSpots("col")}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-medium active:scale-95 shadow-sm">
                  ↕ В колонку
                </button>
                <button onClick={() => setAlignMode(false)}
                  className="px-3 py-1.5 rounded-xl bg-gray-200 text-gray-600 text-sm font-medium active:scale-95">
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive SVG */}
      <div className="flex-1 min-h-0 px-2 py-1 relative">
        {/* Floating dimension panel — visible during drag so user can see distances */}
        {dimLines.length > 0 && dragId && dragStartRef.current?.moved && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur rounded-xl shadow-lg border px-4 py-2 flex items-center gap-4">
            {dimLines.map((d, i) => (
              <div key={`fp-${i}`} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm font-bold text-gray-800">{d.label} см</span>
              </div>
            ))}
          </div>
        )}
        {/* View mode + Zoom controls — компактные, чтобы не мешать строить потолок */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button
            onClick={() => setViewMode(m => m === "2d" ? "3d" : "2d")}
            className={`h-8 px-2 rounded-lg shadow-sm border flex items-center justify-center gap-1 text-[11px] font-bold active:scale-95 ${
              viewMode === "3d"
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white/70 text-gray-700 hover:bg-white"
            }`}
            title={viewMode === "2d" ? "Показать 3D" : "Вернуться в 2D"}
          >
            {viewMode === "2d" ? <Box className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            {viewMode === "2d" ? "3D" : "2D"}
          </button>
          {viewMode === "2d" && (
            <>
              <button onClick={() => setZoom(z => Math.min(5, z * 1.3))}
                className="w-8 h-8 bg-white/70 rounded-lg shadow-sm border flex items-center justify-center text-gray-600 hover:bg-white active:scale-95">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={() => setZoom(z => Math.max(0.3, z / 1.3))}
                className="w-8 h-8 bg-white/70 rounded-lg shadow-sm border flex items-center justify-center text-gray-600 hover:bg-white active:scale-95">
                <ZoomOut className="h-4 w-4" />
              </button>
              {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  className="w-8 h-8 bg-white/70 rounded-lg shadow-sm border flex items-center justify-center text-gray-600 hover:bg-white active:scale-95 text-[11px] font-bold">
                  1:1
                </button>
              )}
            </>
          )}
        </div>
        {viewMode === "3d" && (
          <Scene3DBoundary>
            <Scene3D
              vertices={vertices}
              walls={room.walls}
              ceilingHeight={room.ceilingHeight ?? DEFAULT_CEILING_HEIGHT_CM}
              elements={elements}
            />
          </Scene3DBoundary>
        )}
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="w-full h-full"
          onWheel={handleWheel}
          onPointerDown={handlePanStart}
          onPointerMove={(e) => { handlePanMove(e); if (!isPanning) handleSVGPointerMove(e); }}
          onPointerUp={(e) => { handlePanEnd(); if (!isPanning) handleSVGPointerUp(e); }}
          style={{ touchAction: "none", cursor: isPanning ? "grabbing" : undefined, display: viewMode === "3d" ? "none" : undefined }}
        >
          {/* Room fill */}
          <defs>
            <clipPath id="room-clip">
              <polygon points={vertices.map(v => `${v.x},${v.y}`).join(" ")} />
            </clipPath>
          </defs>
          <polygon
            points={vertices.map(v => `${v.x},${v.y}`).join(" ")}
            fill="#F8FAFC" stroke="#94A3B8" strokeWidth={strokeW * 0.6} strokeLinejoin="round"
          />

          {/* Grid overlay for spot/chandelier placement */}
          {(activeType === "spot" || activeType === "chandelier") && (
            <g clipPath="url(#room-clip)" opacity={0.15}>
              {Array.from({ length: Math.ceil(roomW / gridSize) + 1 }, (_, i) => {
                const x = minX + i * gridSize;
                return <line key={`gv-${i}`} x1={x} y1={minY} x2={x} y2={maxY} stroke="#94A3B8" strokeWidth={strokeW * 0.12} />;
              })}
              {Array.from({ length: Math.ceil(roomH / gridSize) + 1 }, (_, i) => {
                const y = minY + i * gridSize;
                return <line key={`gh-${i}`} x1={minX} y1={y} x2={maxX} y2={y} stroke="#94A3B8" strokeWidth={strokeW * 0.12} />;
              })}
            </g>
          )}

          {/* Wall dimension labels — короткие стены получают меньший шрифт и больший отступ, чтобы подписи в углах ступенек не наезжали друг на друга */}
          {vertices.slice(0, -1).map((a, i) => {
            const b = vertices[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const wLen = Math.sqrt(dx * dx + dy * dy);
            if (wLen === 0) return null;
            const realLen = room.walls[i] || 0;
            const isShort = realLen < 100;
            const isVeryShort = realLen < 60;
            const fontScale = isVeryShort ? 0.5 : isShort ? 0.6 : 0.75;
            const offsetMul = isVeryShort ? 2.6 : isShort ? 2.2 : 1.8;
            const nx = dx / wLen, ny = dy / wLen;
            const outX = ny, outY = -nx;
            const mx = (a.x + b.x) / 2 + outX * labelSize * offsetMul;
            const my = (a.y + b.y) / 2 + outY * labelSize * offsetMul;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle > 90 || angle <= -90) angle += 180;
            return (
              <text key={`dim-${i}`} x={mx} y={my} textAnchor="middle" dominantBaseline="central"
                fontSize={labelSize * fontScale} fill="#94A3B8" fontWeight="500"
                transform={`rotate(${angle}, ${mx}, ${my})`}>
                {room.walls[i]}
              </text>
            );
          })}

          {/* Floating elements */}
          {elements.filter(e => e.type === "floating").map(floatingGlow)}

          {/* Furniture (behind light elements) */}
          {furnitureElements.map(furnitureRender)}

          {/* Doors/Windows */}
          {fixtureElements.map(fixtureRender)}

          {/* Wall elements (прямые) — подшторник прямой, гардина, шторка ванной */}
          {elements.filter(e => e.wallIndex !== undefined && e.shape !== "freeform" && e.shape !== "u-niche" && e.shape !== "l-bend" && e.type !== "floating" && e.type !== "door" && e.type !== "window").map(wallLine)}

          {/* П/Г-ниши подшторника */}
          {elements.filter(e => e.shape === "u-niche" || e.shape === "l-bend").map(nicheRender)}

          {/* Freeform-линии (свет.линия, трек) — двигаются в любую точку */}
          {elements.filter(e => e.shape === "freeform").map(freeformLine)}

          {/* Spots */}
          {elements.filter(e => e.type === "spot").map(spotCircle)}

          {/* Chandeliers */}
          {elements.filter(e => e.type === "chandelier").map(chandelierIcon)}

          {/* Dimension lines */}
          {dimLines.map((d, i) => (
            <DimLine key={`dl-${i}`} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} label={d.label} color={d.color} />
          ))}

          {/* Active type indicator */}
          {activeType && (
            <rect x={vbX} y={vbY} width={vbW} height={vbH}
              fill="none" stroke={
                ALL_ELEMENTS.find(e => e.type === activeType)?.color
                || WALL_ELEMENTS.find(e => e.type === activeType)?.color
                || FURNITURE.find(f => f.furnitureType === activeType)?.color
                || "#999"
              }
              strokeWidth={strokeW * 0.4} strokeDasharray={`${strokeW * 2} ${strokeW}`}
              opacity={0.3} rx={roomSize * 0.02}
            />
          )}
        </svg>
      </div>

      {/* Summary + Cost + Actions */}
      {elements.length > 0 && (
        <div className="shrink-0 border-t bg-white">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <div className="flex gap-1.5 flex-wrap overflow-x-auto">
              {summary.map((s, i) => (
                <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
                  {s.icon} {s.label}
                </span>
              ))}
            </div>
            <button onClick={undo} className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 ml-2">
              <Undo2 className="h-4 w-4" />
            </button>
          </div>
          <div className="px-3 pb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">~</span>
              <span className="text-lg font-bold text-[#1e3a5f]">{formatPrice(liveCost)} ₸</span>
            </div>
            <button onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white active:bg-green-700">
              <Share2 className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Variant toggle — only for spots */}
      {activeType === "spot" && (
        <div className="shrink-0 px-3 py-1.5 border-t bg-amber-50 flex items-center justify-center gap-2">
          <span className="text-xs text-amber-800 font-medium">Софиты:</span>
          <button
            onClick={() => setActiveVariant("ours")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeVariant === "ours"
                ? "bg-[#1e3a5f] text-white"
                : "bg-white border border-amber-300 text-amber-700"
            }`}
          >
            Наши (с материалом)
          </button>
          <button
            onClick={() => setActiveVariant("client")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeVariant === "client"
                ? "bg-gray-600 text-white"
                : "bg-white border border-amber-300 text-amber-700"
            }`}
          >
            Клиентские
          </button>
        </div>
      )}

      {/* Toolbar with tabs */}
      <div className="shrink-0 border-t bg-gray-50">
        {/* Tab headers */}
        <div className="flex border-b">
          {([["light", "Свет"], ["walls", "Стены"], ["furniture", "Мебель"]] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => { setToolbarTab(key); setActiveType(null); setSelectedId(null); }}
              className={`flex-1 py-2 text-xs font-semibold transition-all ${
                toolbarTab === key
                  ? "text-[#1e3a5f] border-b-2 border-[#1e3a5f]"
                  : "text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Tab content */}
        <div className="px-2 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {toolbarTab === "light" && LIGHT_ELEMENTS.map(el => (
              <button
                key={el.type}
                onClick={() => {
                  if (activeType === el.type) { setActiveType(null); }
                  else { setActiveType(el.type); setActiveVariant("ours"); }
                }}
                className={`flex flex-col items-center min-w-[64px] px-3 py-2 rounded-xl text-xs transition-all ${
                  activeType === el.type
                    ? "bg-[#1e3a5f] text-white shadow-lg scale-105"
                    : "bg-white border border-gray-200 text-gray-600 active:scale-95"
                }`}
              >
                <span className="text-xl leading-none">{el.icon}</span>
                <span className="mt-1 whitespace-nowrap text-[11px] font-medium">{el.label}</span>
              </button>
            ))}
            {toolbarTab === "walls" && WALL_ELEMENTS.map(el => (
              <button
                key={el.type}
                onClick={() => {
                  if (activeType === el.type) { setActiveType(null); }
                  else { setActiveType(el.type); }
                }}
                className={`flex flex-col items-center min-w-[64px] px-3 py-2 rounded-xl text-xs transition-all ${
                  activeType === el.type
                    ? "bg-[#1e3a5f] text-white shadow-lg scale-105"
                    : "bg-white border border-gray-200 text-gray-600 active:scale-95"
                }`}
              >
                <span className="text-xl leading-none">{el.icon}</span>
                <span className="mt-1 whitespace-nowrap text-[11px] font-medium">{el.label}</span>
              </button>
            ))}
            {toolbarTab === "furniture" && FURNITURE.map(f => (
              <button
                key={f.furnitureType}
                onClick={() => {
                  if (activeType === f.furnitureType) { setActiveType(null); }
                  else { setActiveType(f.furnitureType); }
                }}
                className={`flex flex-col items-center min-w-[64px] px-3 py-2 rounded-xl text-xs transition-all ${
                  activeType === f.furnitureType
                    ? "bg-[#1e3a5f] text-white shadow-lg scale-105"
                    : "bg-white border border-gray-200 text-gray-600 active:scale-95"
                }`}
              >
                <span className="text-xl leading-none">{f.icon}</span>
                <span className="mt-1 whitespace-nowrap text-[11px] font-medium">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Подшторник — выбор формы */}
      {subcurtainShapeChoice && (() => {
        const wallIdx = subcurtainShapeChoice.wallIndex;
        const wallLen = room.walls[wallIdx] || 0;
        const close = () => setSubcurtainShapeChoice(null);
        const pickStraight = () => {
          setSubcurtainShapeChoice(null);
          setLengthInput({ wallIndex: wallIdx });
          setLengthValue(String(Math.round(wallLen)));
          setLengthSide("center");
        };
        const pickShape = (shape: "u-niche" | "l-bend") => {
          setSubcurtainShapeChoice(null);
          setNicheInput({
            wallIndex: wallIdx,
            shape,
            width: String(Math.round(wallLen)),
            depth: "25",
            side: "left",
            position: "center",
          });
        };
        return (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">📐 Подшторник — форма</span>
                <button onClick={close} className="p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Стена {wallIdx + 1}: {wallLen} см</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={pickStraight}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">▬</span>
                  <span className="text-xs font-semibold">Прямой</span>
                </button>
                <button onClick={() => pickShape("u-niche")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">⊓</span>
                  <span className="text-xs font-semibold">П-ниша</span>
                </button>
                <button onClick={() => pickShape("l-bend")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">⌐</span>
                  <span className="text-xs font-semibold">Г-ниша</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Подшторник — размеры П/Г-ниши */}
      {nicheInput && (() => {
        const wallLen = room.walls[nicheInput.wallIndex] || 0;
        const isU = nicheInput.shape === "u-niche";
        const close = () => setNicheInput(null);
        return (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">{isU ? "⊓ П-ниша" : "⌐ Г-ниша"} — размеры</span>
                <button onClick={close} className="p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Стена {nicheInput.wallIndex + 1}: {wallLen} см</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ширина (см)</label>
                  <input type="number" inputMode="numeric"
                    value={nicheInput.width}
                    onChange={(e) => setNicheInput(prev => prev ? { ...prev, width: e.target.value } : null)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Глубина (см)</label>
                  <input type="number" inputMode="numeric"
                    value={nicheInput.depth}
                    onChange={(e) => setNicheInput(prev => prev ? { ...prev, depth: e.target.value } : null)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                </div>
                {!isU && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Сторона выпуска</label>
                    <div className="flex gap-2 mt-1">
                      {(["left", "right"] as const).map(s => (
                        <button key={s}
                          onClick={() => setNicheInput(prev => prev ? { ...prev, side: s } : null)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${
                            nicheInput.side === s ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-gray-300"
                          }`}>
                          {s === "left" ? "← Слева" : "Справа →"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Позиция на стене — только для П-ниши.
                    Г-ниша всегда упирается одним концом в угол (определяется стороной выпуска). */}
                {isU && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Положение на стене</label>
                    <div className="flex gap-2 mt-1">
                      {(["left", "center", "right"] as const).map(p => (
                        <button key={p}
                          onClick={() => setNicheInput(prev => prev ? { ...prev, position: p } : null)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${
                            nicheInput.position === p ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-gray-300"
                          }`}>
                          {p === "left" ? "← Слева" : p === "right" ? "Справа →" : "По центру"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={confirmNiche}
                disabled={!nicheInput.width || !nicheInput.depth || parseFloat(nicheInput.width) <= 0 || parseFloat(nicheInput.depth) <= 0}
                className="w-full mt-5 py-3 rounded-xl bg-[#1e3a5f] text-white font-semibold disabled:opacity-30 active:scale-95">
                Добавить
              </button>
            </div>
          </div>
        );
      })()}

      {/* Length input with numpad */}
      {lengthInput && (() => {
        const wallLen = room.walls[lengthInput.wallIndex] || 0;
        const editEl = editingWallElId ? elements.find(e => e.id === editingWallElId) : null;
        const elConfig = ALL_ELEMENTS.find(e => e.type === (editEl?.type || activeType));
        const numDigit = (d: string) => setLengthValue(p => p === "0" ? d : p + d);
        const numBack = () => setLengthValue(p => p.slice(0, -1));
        return (
          <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <button onClick={() => { setLengthInput(null); setLengthValue(""); setLengthSide("center"); setEditingWallElId(null); }} className="p-1 text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold">
                {elConfig?.icon} {elConfig?.label}
              </span>
              <div className="w-8" />
            </div>

            <div className="px-4 py-3 border-b bg-gray-50 shrink-0">
              <p className="text-xs text-muted-foreground text-center mb-2">
                Стена {lengthInput.wallIndex + 1}: {wallLen} см
              </p>
              <div className="flex items-center gap-1.5 justify-center">
                {(["left", "center", "right"] as const).map(side => (
                  <button key={side} onClick={() => setLengthSide(side)}
                    className={`px-3 py-1.5 text-xs rounded-lg border active:scale-95 transition-colors ${
                      lengthSide === side ? "bg-[#1e3a5f] text-white border-[#1e3a5f] font-semibold" : "border-gray-300 text-gray-600"
                    }`}>
                    {side === "left" ? "← Слева" : side === "right" ? "Справа →" : "По центру"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1" />

            <div className="shrink-0 border-t">
              <div className="flex items-baseline justify-center py-3 gap-1">
                <span className="text-4xl font-bold tabular-nums">{lengthValue || "0"}</span>
                <span className="text-base text-muted-foreground">см</span>
              </div>

              <div className="grid grid-cols-3 select-none" style={{ touchAction: "manipulation" }}>
                {(["1","2","3","4","5","6","7","8","9"] as const).map(d => (
                  <button key={d} onClick={() => numDigit(d)}
                    style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                    className="py-3.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                    {d}
                  </button>
                ))}
                <button onClick={numBack}
                  style={{ touchAction: "manipulation" }}
                  className="py-3.5 text-xl text-center border-b border-r border-gray-100 active:bg-red-50 text-muted-foreground">
                  ⌫
                </button>
                <button onClick={() => numDigit("0")}
                  style={{ touchAction: "manipulation" }}
                  className="py-3.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                  0
                </button>
                <button onClick={confirmLength}
                  disabled={!lengthValue || parseFloat(lengthValue) <= 0}
                  style={{ touchAction: "manipulation" }}
                  className="py-3.5 text-2xl font-bold bg-[#1e3a5f] text-white border-b active:bg-[#152d4a] disabled:opacity-30">
                  ✓
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Position editor modal */}
      {posEditor && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setPosEditor(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center mb-1">📏 Точная позиция</p>
            <p className="text-xs text-muted-foreground text-center mb-4">Расстояние от ближайших стен (см)</p>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Стена 1</label>
                <input
                  type="number" value={posEditor.wall1Dist}
                  onChange={e => setPosEditor(prev => prev ? { ...prev, wall1Dist: e.target.value } : null)}
                  className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-3 py-2.5 text-center text-xl font-bold outline-none transition-colors"
                  autoFocus inputMode="numeric"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Стена 2</label>
                <input
                  type="number" value={posEditor.wall2Dist}
                  onChange={e => setPosEditor(prev => prev ? { ...prev, wall2Dist: e.target.value } : null)}
                  className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-3 py-2.5 text-center text-xl font-bold outline-none transition-colors"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPosEditor(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium active:bg-gray-50">
                Отмена
              </button>
              <button onClick={applyPosEditor}
                className="flex-1 rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold active:bg-[#152d4a]">
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixture width editor (doors/windows) */}
      {fixtureEditor && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setFixtureEditor(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center mb-1">
              {elements.find(e => e.id === fixtureEditor.elId)?.type === "door" ? "🚪 Дверь" : "🪟 Окно"}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4">Укажите ширину (см)</p>
            <input
              type="number" value={fixtureEditor.width}
              onChange={e => setFixtureEditor(prev => prev ? { ...prev, width: e.target.value } : null)}
              className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-3 py-2.5 text-center text-xl font-bold outline-none transition-colors mb-4"
              autoFocus inputMode="numeric"
            />
            <div className="flex gap-3">
              <button onClick={() => setFixtureEditor(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium active:bg-gray-50">
                Отмена
              </button>
              <button onClick={() => {
                const w = parseFloat(fixtureEditor.width);
                if (w > 0) {
                  setElements(prev => prev.map(e => e.id === fixtureEditor.elId ? { ...e, length: w } : e));
                }
                setFixtureEditor(null);
              }}
                className="flex-1 rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold active:bg-[#152d4a]">
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Furniture size modal */}
      {furnitureMenu && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setFurnitureMenu(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center mb-1">
              {FURNITURE.find(f => f.furnitureType === furnitureMenu.furnitureType)?.icon}{" "}
              {FURNITURE.find(f => f.furnitureType === furnitureMenu.furnitureType)?.label}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4">Укажите размеры (см)</p>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Ширина</label>
                <input
                  type="number"
                  value={furnW}
                  onChange={e => setFurnW(e.target.value)}
                  className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-3 py-2.5 text-center text-xl font-bold outline-none transition-colors"
                  autoFocus
                  inputMode="numeric"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Глубина</label>
                <input
                  type="number"
                  value={furnH}
                  onChange={e => setFurnH(e.target.value)}
                  className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-3 py-2.5 text-center text-xl font-bold outline-none transition-colors"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFurnitureMenu(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium active:bg-gray-50">
                Отмена
              </button>
              <button onClick={confirmFurniture}
                className="flex-1 rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold active:bg-[#152d4a]">
                Поставить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
