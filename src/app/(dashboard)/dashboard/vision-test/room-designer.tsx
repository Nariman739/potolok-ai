"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, Undo2, Check, Share2, RotateCw, AlignHorizontalSpaceBetween, Move, ZoomIn, ZoomOut, Box, Square, Pencil } from "lucide-react";
import { DEFAULT_PRICES } from "@/lib/constants";
import { furnitureCeilingStats, classifyEdges, getFurnitureCorners, snapFurnitureToWallAndNeighbors } from "@/lib/furniture-ceiling";
import { Scene3DBoundary } from "@/components/room-3d/Scene3DBoundary";
import type { ElementType, FurnitureType, CeilingMode, RoomElement } from "@/lib/room-types";
import { getVertices } from "@/lib/room-geometry";

// Re-export — старые импорты `from "./room-designer"` продолжают работать
export type { ElementType, FurnitureType, CeilingMode, RoomElement };
export { getVertices };

const Scene3D = dynamic(() => import("@/components/room-3d/Scene3D").then(m => m.Scene3D), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-50 to-slate-100">
      <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
    </div>
  ),
});

const DEFAULT_CEILING_HEIGHT_CM = 270;

interface Room {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  /** Радиус скругления каждого угла (см). Индекс i = угол МЕЖДУ стеной i-1 и i.
   *  0 или undefined = прямой угол. */
  cornerRadii?: number[];
  area: number;
  perimeter: number;
  elements?: RoomElement[];
  ceilingHeight?: number;
  previewUrl3d?: string;
}

// ── Element config ──

type ToolbarTab = "light" | "walls" | "furniture";

const LIGHT_ELEMENTS: { type: ElementType; label: string; icon: string; color: string; category: "point" | "wall" | "perimeter" }[] = [
  { type: "spot",        label: "Софит",       icon: "💡", color: "#F59E0B", category: "point" },
  { type: "pendant",     label: "Подвесной",   icon: "💡", color: "#3B82F6", category: "point" },
  { type: "chandelier",  label: "Люстра",      icon: "🔆", color: "#8B5CF6", category: "point" },
  { type: "curtain",     label: "Гардина",     icon: "📏", color: "#10B981", category: "wall" },
  { type: "subcurtain",  label: "Подшторник",   icon: "📐", color: "#06B6D4", category: "wall" },
  { type: "track",       label: "Трек",        icon: "🔲", color: "#EF4444", category: "wall" },
  { type: "lightline",   label: "Свет.линия",  icon: "✨", color: "#FACC15", category: "wall" },
  { type: "floating",    label: "Парящий",     icon: "〰️", color: "#F97316", category: "perimeter" },
  { type: "builtin_gardina", label: "Гардина",  icon: "🪟", color: "#059669", category: "wall" },
  { type: "shower_curtain",  label: "Шторка ванн.", icon: "🚿", color: "#7C3AED", category: "wall" },
];

const WALL_ELEMENTS: { type: ElementType; label: string; icon: string; color: string }[] = [
  { type: "door",   label: "Дверь",  icon: "🚪", color: "#78716C" },
  { type: "window", label: "Окно",   icon: "🪟", color: "#60A5FA" },
];

/** Мебель типы потолка: kitchen и wall_panel почти всегда «до потолка», поэтому они
 *  попадают в палитру с дефолтным режимом to-ceiling. Шкаф остаётся декоративным
 *  по умолчанию (бэк-компат), мастер переключает в форме. */
const FURNITURE: { furnitureType: FurnitureType; label: string; icon: string; color: string; defaultW: number; defaultH: number; defaultCeilingMode?: CeilingMode }[] = [
  { furnitureType: "bed",        label: "Кровать",    icon: "🛏️", color: "#8B5CF6", defaultW: 200, defaultH: 160 },
  { furnitureType: "sofa",       label: "Диван",      icon: "🛋️", color: "#6366F1", defaultW: 200, defaultH: 90 },
  { furnitureType: "table",      label: "Стол",       icon: "🪑", color: "#D97706", defaultW: 120, defaultH: 80 },
  { furnitureType: "wardrobe",   label: "Шкаф",       icon: "🗄️", color: "#78716C", defaultW: 200, defaultH: 60 },
  { furnitureType: "kitchen",    label: "Кухня",      icon: "🍳", color: "#0891B2", defaultW: 300, defaultH: 60, defaultCeilingMode: "to-ceiling" },
  { furnitureType: "wall_panel", label: "Стенка",     icon: "🚪", color: "#6B7280", defaultW: 400, defaultH: 40, defaultCeilingMode: "to-ceiling" },
  { furnitureType: "tv",         label: "ТВ",         icon: "📺", color: "#1e3a5f", defaultW: 120, defaultH: 10 },
  { furnitureType: "nightstand", label: "Тумба",      icon: "📦", color: "#A3A3A3", defaultW: 50,  defaultH: 50 },
  { furnitureType: "chair",      label: "Стул",       icon: "💺", color: "#10B981", defaultW: 45,  defaultH: 45 },
  { furnitureType: "desk",       label: "Письм.стол", icon: "🖥️", color: "#F59E0B", defaultW: 140, defaultH: 70 },
  { furnitureType: "radiator",   label: "Батарея",    icon: "🔥", color: "#DC2626", defaultW: 100, defaultH: 15 },
];

/** Может ли мебель быть «до потолка» (показывать выбор режима в форме). */
function canBeToCeiling(t: FurnitureType): boolean {
  return t === "wardrobe" || t === "kitchen" || t === "wall_panel";
}

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
// getVertices теперь импортится из @/lib/room-geometry (см. шапку файла)

/**
 * Строит SVG path комнаты с учётом скруглений в углах.
 * cornerRadii[i] — радиус скругления угла перед стеной i (т.е. в вершине vertices[i]).
 * Если все радиусы 0/undefined — возвращает обычный polygon path.
 * Для 90° углов длина "съедания" по стене = R. Для других углов аппроксимация (для замеров с прямоугольными комнатами OK).
 */
function getRoomPath(vertices: Vertex[], cornerRadii?: number[]): string {
  const n = vertices.length - 1; // последняя дублирует первую
  if (n < 3) return "";
  const hasRounded = cornerRadii?.some(r => r && r > 0);
  if (!hasRounded) {
    return "M " + vertices.slice(0, n).map(v => `${v.x},${v.y}`).join(" L ") + " Z";
  }
  // Точки начала/конца дуги для каждой вершины
  const inPts: Vertex[] = []; // куда приходим от предыдущей стены
  const outPts: Vertex[] = []; // откуда уходим на следующую
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    const r = cornerRadii![i] || 0;
    if (r <= 0) {
      inPts.push(v);
      outPts.push(v);
      continue;
    }
    const prev = vertices[(i - 1 + n) % n];
    const next = vertices[i + 1];
    const dxPrev = prev.x - v.x, dyPrev = prev.y - v.y;
    const dxNext = next.x - v.x, dyNext = next.y - v.y;
    const lenPrev = Math.hypot(dxPrev, dyPrev) || 1;
    const lenNext = Math.hypot(dxNext, dyNext) || 1;
    const off = Math.min(r, lenPrev / 2, lenNext / 2);
    inPts.push({ x: v.x + (dxPrev / lenPrev) * off, y: v.y + (dyPrev / lenPrev) * off });
    outPts.push({ x: v.x + (dxNext / lenNext) * off, y: v.y + (dyNext / lenNext) * off });
  }
  // Направление контура (signed area). В SVG Y растёт вниз — корректируем sweep.
  let signed = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n];
    signed += a.x * b.y - b.x * a.y;
  }
  // Базовый sweep для выпуклого угла. Для вогнутого инвертируется (определяется per-corner ниже).
  const baseSweep = signed > 0 ? 1 : 0;

  let d = `M ${outPts[0].x} ${outPts[0].y}`;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const r = cornerRadii![next] || 0;
    d += ` L ${inPts[next].x} ${inPts[next].y}`;
    if (r > 0) {
      const off = Math.min(r,
        Math.hypot(vertices[(next - 1 + n) % n].x - vertices[next].x, vertices[(next - 1 + n) % n].y - vertices[next].y) / 2,
        Math.hypot(vertices[next + 1].x - vertices[next].x, vertices[next + 1].y - vertices[next].y) / 2);
      // Определяем выпуклость через cross product (prev→v) × (v→next).
      // Если знак совпадает с общим направлением контура — convex, иначе concave.
      const v = vertices[next];
      const prev = vertices[(next - 1 + n) % n];
      const nxt = vertices[next + 1];
      const d1x = v.x - prev.x, d1y = v.y - prev.y;
      const d2x = nxt.x - v.x, d2y = nxt.y - v.y;
      const cross = d1x * d2y - d1y * d2x;
      const isConvex = (cross > 0) === (signed > 0);
      const sweep = isConvex ? baseSweep : 1 - baseSweep;
      d += ` A ${off} ${off} 0 0 ${sweep} ${outPts[next].x} ${outPts[next].y}`;
    }
  }
  d += " Z";
  return d;
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

/** Смещения софитов в группе относительно точки клика (см). */
function computeSpotGroupOffsets(
  group: "1" | "2h" | "2v" | "3h" | "3v",
  stepCm: number
): { dx: number; dy: number }[] {
  switch (group) {
    case "2h":
      return [{ dx: -stepCm / 2, dy: 0 }, { dx: stepCm / 2, dy: 0 }];
    case "2v":
      return [{ dx: 0, dy: -stepCm / 2 }, { dx: 0, dy: stepCm / 2 }];
    case "3h":
      return [{ dx: -stepCm, dy: 0 }, { dx: 0, dy: 0 }, { dx: stepCm, dy: 0 }];
    case "3v":
      return [{ dx: 0, dy: -stepCm }, { dx: 0, dy: 0 }, { dx: 0, dy: stepCm }];
    case "1":
    default:
      return [{ dx: 0, dy: 0 }];
  }
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

export default function RoomDesigner({ room, onDone, onCancel, onPreviewSaved }: {
  room: Room;
  onDone: (elements: RoomElement[], updates?: { walls: number[]; area: number; perimeter: number; name?: string }) => void;
  onCancel: () => void;
  onPreviewSaved?: (url: string) => void;
}) {
  const [elements, setElements] = useState<RoomElement[]>(room.elements || []);
  // Локальное редактирование размеров стен. Меняется через тап на цифру.
  // При onDone передаём новые walls + пересчитанные area/perimeter родителю.
  const [editableWalls, setEditableWalls] = useState<number[]>(room.walls);
  // Индекс стены, у которой открыт инлайн-инпут редактирования размера.
  const [wallSizeEdit, setWallSizeEdit] = useState<{ index: number; value: string } | null>(null);
  // Название комнаты — редактируется по тапу на заголовок.
  const [editableName, setEditableName] = useState<string>(room.name || "Помещение");
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ElementType | FurnitureType | null>(null);
  const [activeVariant, setActiveVariant] = useState<"ours" | "client">("ours");
  // Группа софитов: 1 / 2-горизонт / 2-вертикаль / 3-горизонт / 3-вертикаль.
  // Применяется при одиночном клике, когда activeType === "spot".
  const [spotGroup, setSpotGroup] = useState<"1" | "2h" | "2v" | "3h" | "3v">("1");
  const [toolbarTab, setToolbarTab] = useState<ToolbarTab>("light");
  const [lengthInput, setLengthInput] = useState<{ wallIndex: number; extraDepth?: string } | null>(null);
  const [lengthValue, setLengthValue] = useState("");
  const [lengthSide, setLengthSide] = useState<"left" | "center" | "right">("center");
  const [lengthDepthValue, setLengthDepthValue] = useState("20");
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
  // Свет.линия / трек: выбор формы (Прямая / Г / П / Квадрат) перед размерами
  const [lightShapeChoice, setLightShapeChoice] = useState<{ type: "lightline" | "track" } | null>(null);
  // Ввод размеров свет.линии/трека для выбранной формы
  const [lightSpecInput, setLightSpecInput] = useState<
    | {
        type: "lightline" | "track";
        shape: "straight" | "l" | "u" | "square";
        length: string;       // прямая
        width: string;        // Г/П: горизонталь, квадрат: сторона
        depth: string;        // Г/П: глубина боковин
        side: "left" | "right"; // Г: куда выпуск
      }
    | null
  >(null);
  const [furnitureMenu, setFurnitureMenu] = useState<{ x: number; y: number; furnitureType: FurnitureType; defaultW: number; defaultH: number; defaultCeilingMode?: CeilingMode } | null>(null);
  const [furnW, setFurnW] = useState("");
  const [furnH, setFurnH] = useState("");
  const [furnCeilingMode, setFurnCeilingMode] = useState<CeilingMode>("decor");
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

  const vertices = getVertices(editableWalls, room.normalCorners, room.angles);

  // Площадь полигона (см²) по формуле shoelace, м² для отображения.
  const computedArea = (() => {
    let s = 0;
    const n = vertices.length - 1; // последняя вершина = первой
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2 / 10000; // см² → м²
  })();
  const computedPerimeter = editableWalls.reduce((s, w) => s + w, 0) / 100; // см → м

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
    // Считаем координаты вручную через getBoundingClientRect + viewBox.
    // getScreenCTM() на iOS Safari иногда возвращает устаревшую матрицу
    // после изменения viewport (скрытие/показ URL-бара, появление клавиатуры) —
    // это давало эффект «нажимаешь ниже, попадает выше» при долгой работе.
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const localX = ((clientX - rect.left) / rect.width) * vbW + vbX;
    const localY = ((clientY - rect.top) / rect.height) * vbH + vbY;
    return { x: localX, y: localY };
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
    if (dragEl && (dragEl.type === "spot" || dragEl.type === "pendant" || dragEl.type === "chandelier")) {
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
            if (el.type === "spot" || el.type === "pendant" || el.type === "chandelier" || el.type === "furniture") {
              const useSnap = el.type === "spot" || el.type === "pendant" || el.type === "chandelier";
              const baseX = useSnap ? snapToGrid(dropPos.x) : dropPos.x;
              const baseY = useSnap ? snapToGrid(dropPos.y) : dropPos.y;
              // Для мебели — попытка snap к стене и соседним блокам
              let finalPatch: Partial<RoomElement> = { x: baseX, y: baseY };
              if (el.type === "furniture") {
                const moved: RoomElement = { ...el, x: baseX, y: baseY };
                const snapped = snapFurnitureToWallAndNeighbors(moved, vertices, elements);
                if (snapped) finalPatch = { x: snapped.x, y: snapped.y, rotation: snapped.rotation };
              }
              // Если spot/pendant в группе — двигаем всю группу на тот же delta.
              const draggedX = el.x ?? baseX;
              const draggedY = el.y ?? baseY;
              const dx = baseX - draggedX;
              const dy = baseY - draggedY;
              if (el.groupId && (el.type === "spot" || el.type === "pendant")) {
                const gid = el.groupId;
                setElements(prev => prev.map(e =>
                  e.id === ds.id
                    ? { ...e, ...finalPatch }
                    : e.groupId === gid && e.x !== undefined && e.y !== undefined
                      ? { ...e, x: e.x + dx, y: e.y + dy }
                      : e
                ));
              } else {
                setElements(prev => prev.map(e =>
                  e.id === ds.id ? { ...e, ...finalPatch } : e
                ));
              }
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
                const wallLenCm = editableWalls[el.wallIndex] || 0;
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
      setFurnitureMenu({ x: coords.x, y: coords.y, furnitureType: furnType, defaultW: fCfg.defaultW, defaultH: fCfg.defaultH, defaultCeilingMode: fCfg.defaultCeilingMode });
      setFurnW(String(fCfg.defaultW));
      setFurnH(String(fCfg.defaultH));
      setFurnCeilingMode(fCfg.defaultCeilingMode || "decor");
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
      // Двойные/тройные софиты одним кликом — расставляются с фиксированным
      // шагом вокруг точки клика. Применяется только к "spot".
      if (activeType === "spot" && spotGroup !== "1") {
        const stepCm = 25;
        const offsets = computeSpotGroupOffsets(spotGroup, stepCm);
        const cx = snapToGrid(coords.x), cy = snapToGrid(coords.y);
        const groupId = crypto.randomUUID();
        setElements(prev => [
          ...prev,
          ...offsets.map((off) => ({
            id: crypto.randomUUID(),
            type: "spot" as ElementType,
            x: cx + off.dx,
            y: cy + off.dy,
            variant: activeVariant,
            groupId,
          })),
        ]);
        return;
      }
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
      // Свет.линия и трек — freeform, выбор формы (Прямая / Г / П / Квадрат)
      if (activeType === "lightline" || activeType === "track") {
        setLightShapeChoice({ type: activeType });
        return;
      }
      setLengthInput({ wallIndex: nearest.wallIndex });
      setLengthValue(String(Math.round(nearest.wallLength)));
      setLengthSide("center");
    } else if (config.category === "perimeter") {
      // Сначала пробуем — попал ли тап в грань шкафа to-ceiling/planned (in-room ребро).
      // Если да — ставим парящий на ребре шкафа, не на стене.
      const edgeHit = (() => {
        const threshold = 25;
        let best: { id: string; edgeIndex: number; dist: number } | null = null;
        for (const f of elements) {
          if (f.type !== "furniture") continue;
          if (f.ceilingMode !== "to-ceiling" && f.ceilingMode !== "planned") continue;
          const corners = getFurnitureCorners(f);
          if (!corners) continue;
          const inRoomEdges = classifyEdges(f, vertices, elements).map(at => !at);
          const n = corners.length;
          for (let i = 0; i < n; i++) {
            if (!inRoomEdges[i]) continue;
            const p0 = corners[i], p1 = corners[(i + 1) % n];
            const segDx = p1.x - p0.x, segDy = p1.y - p0.y;
            const segL2 = segDx * segDx + segDy * segDy;
            if (segL2 < 0.001) continue;
            const t = Math.max(0, Math.min(1, ((coords.x - p0.x) * segDx + (coords.y - p0.y) * segDy) / segL2));
            const cx = p0.x + segDx * t, cy = p0.y + segDy * t;
            const dist = Math.hypot(coords.x - cx, coords.y - cy);
            if (dist < threshold && (!best || dist < best.dist)) {
              best = { id: f.id, edgeIndex: i, dist };
            }
          }
        }
        return best;
      })();

      if (edgeHit) {
        setElements(prev => {
          const existing = prev.find(el =>
            el.type === "floating" && el.furnitureId === edgeHit.id && el.edgeIndex === edgeHit.edgeIndex
          );
          if (existing) return prev.filter(el => el.id !== existing.id);
          return [...prev, {
            id: crypto.randomUUID(),
            type: "floating",
            furnitureId: edgeHit.id,
            edgeIndex: edgeHit.edgeIndex,
          }];
        });
        return;
      }

      const nearest = nearestWall(coords.x, coords.y, vertices);
      const wallCm = editableWalls[nearest.wallIndex];
      const tapCm = nearest.t * wallCm;
      const wallsCount = vertices.length - 1;
      // Считаем занятые подшторником/Г-нишой интервалы на этой стене (в см)
      const occupiedCm: Array<[number, number]> = [];
      for (const sub of elements) {
        if (sub.type !== "subcurtain" || !sub.length || sub.wallIndex === undefined) continue;
        if (sub.wallIndex === nearest.wallIndex) {
          const subPos = sub.wallPosition ?? 0.5;
          const subStart = Math.max(0, Math.min(wallCm - sub.length, subPos * wallCm - sub.length / 2));
          occupiedCm.push([subStart, subStart + sub.length]);
        } else if (sub.shape === "l-bend" && sub.depth) {
          if (sub.side === "left" && (sub.wallIndex - 1 + wallsCount) % wallsCount === nearest.wallIndex) {
            occupiedCm.push([Math.max(0, wallCm - sub.depth), wallCm]);
          }
          if (sub.side === "right" && (sub.wallIndex + 1) % wallsCount === nearest.wallIndex) {
            occupiedCm.push([0, Math.min(wallCm, sub.depth)]);
          }
        }
      }
      // Мебель «до потолка», прилегающая к этой стене, тоже «съедает» парящий
      const a0 = vertices[nearest.wallIndex], b0 = vertices[nearest.wallIndex + 1];
      if (a0 && b0) {
        const dx0 = b0.x - a0.x, dy0 = b0.y - a0.y;
        const wL = Math.hypot(dx0, dy0);
        if (wL > 0) {
          const nx0 = dx0 / wL, ny0 = dy0 / wL;
          const px0 = -ny0, py0 = nx0;
          const wallThreshold = Math.max(5, wallCm * 0.03);
          for (const f of elements) {
            if (f.type !== "furniture" || f.ceilingMode !== "to-ceiling") continue;
            const corners = getFurnitureCorners(f);
            if (!corners) continue;
            // Углы furniture, прилегающие к стене (d ≈ 0): берём min/max их t — это занятый отрезок
            const tsAtWall: number[] = [];
            for (const c of corners) {
              const t = (c.x - a0.x) * nx0 + (c.y - a0.y) * ny0;
              const d = (c.x - a0.x) * px0 + (c.y - a0.y) * py0;
              if (d >= -1 && d <= wallThreshold) tsAtWall.push(t);
            }
            if (tsAtWall.length >= 2) {
              const tStart = Math.max(0, Math.min(...tsAtWall));
              const tEnd = Math.min(wallCm, Math.max(...tsAtWall));
              if (tEnd - tStart > 1) occupiedCm.push([tStart, tEnd]);
            }
          }
        }
      }
      occupiedCm.sort((p, q) => p[0] - q[0]);
      let gapStart = 0, gapEnd = wallCm;
      for (const [s, e] of occupiedCm) {
        if (e <= tapCm) gapStart = Math.max(gapStart, e);
        if (s >= tapCm) { gapEnd = Math.min(gapEnd, s); break; }
      }
      if (tapCm < gapStart || tapCm > gapEnd) return;
      const fLen = gapEnd - gapStart;
      const fPos = (gapStart + fLen / 2) / wallCm;
      setElements(prev => {
        const existing = prev.find(el => {
          if (el.type !== "floating" || el.wallIndex !== nearest.wallIndex || !el.length) return false;
          const ePos = el.wallPosition ?? 0.5;
          const eStart = ePos * wallCm - el.length / 2;
          const eEnd = eStart + el.length;
          return tapCm >= eStart && tapCm <= eEnd;
        });
        if (existing) return prev.filter(el => el.id !== existing.id);
        return [...prev, {
          id: crypto.randomUUID(),
          type: "floating",
          wallIndex: nearest.wallIndex,
          wallPosition: fPos,
          length: fLen,
        }];
      });
    }
  }

  function getElPos(el: RoomElement): { x: number; y: number } {
    if (dragId === el.id && dragPos && dragStartRef.current?.moved) {
      return dragPos;
    }
    // Если двигают одного из группы — тащим всю группу с тем же delta.
    if (
      dragId &&
      el.groupId &&
      dragPos &&
      dragStartRef.current?.moved &&
      el.id !== dragId
    ) {
      const dragged = elements.find((e) => e.id === dragId);
      if (
        dragged &&
        dragged.groupId === el.groupId &&
        dragged.x !== undefined &&
        dragged.y !== undefined
      ) {
        const dx = dragPos.x - dragged.x;
        const dy = dragPos.y - dragged.y;
        return { x: (el.x ?? 0) + dx, y: (el.y ?? 0) + dy };
      }
    }
    return { x: el.x ?? 0, y: el.y ?? 0 };
  }

  function confirmLength() {
    if (!lengthInput) return;
    const len = parseFloat(lengthValue);
    if (!len || len <= 0) { setLengthInput(null); setEditingWallElId(null); return; }
    const wallLen = editableWalls[lengthInput.wallIndex] || 0;
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

      // Свет.линия и трек теперь идут через lightShapeChoice → lightSpecInput
      // (см. confirmLightSpec), а не через lengthInput. Этот блок больше не используется
      // для них, но если бы — резервная заглушка чтобы не упасть.
      if (activeType === "lightline" || activeType === "track") {
        setLengthInput(null);
        return;
      }

      const hasVariant = activeType === "spot";
      const extraDepth = activeType === "subcurtain" && lengthInput.extraDepth !== undefined
        ? parseFloat(lengthDepthValue)
        : undefined;
      setElements(prev => [...prev, {
        id: newId,
        type: activeType as ElementType,
        wallIndex: lengthInput.wallIndex,
        wallPosition: pos,
        length: clampedLen,
        shape: "straight",
        ...(hasVariant && { variant: activeVariant }),
        ...(extraDepth && extraDepth > 0 && { depth: extraDepth }),
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
    const wallLen = editableWalls[nicheInput.wallIndex] || 0;
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

  /** Создание свет.линии или трека выбранной формы. Точки вычисляются от
   *  центра комнаты и пользователь потом перетаскивает куда нужно. */
  function confirmLightSpec() {
    if (!lightSpecInput) return;
    const s = lightSpecInput.shape;
    const W = parseFloat(lightSpecInput.width);
    const D = parseFloat(lightSpecInput.depth);
    const L = parseFloat(lightSpecInput.length);

    // Центр комнаты в SVG-координатах
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let points: { x: number; y: number }[] = [];
    let closed = false;
    let totalLen = 0;

    if (s === "straight") {
      if (!L || L <= 0) return;
      // Горизонтальная линия с центром в (cx, cy)
      points = [{ x: cx - L / 2, y: cy }, { x: cx + L / 2, y: cy }];
      totalLen = L;
    } else if (s === "l") {
      if (!W || W <= 0 || !D || D <= 0) return;
      // Г-форма: горизонтальный сегмент W + вертикальный D
      // Сторона: left → загиб слева, right → загиб справа
      const x0 = cx - W / 2, x1 = cx + W / 2;
      const y0 = cy - D / 2, y1 = cy + D / 2;
      if (lightSpecInput.side === "left") {
        // Г: вертикаль слева вниз, потом горизонталь вправо
        points = [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }];
      } else {
        // зеркально: вертикаль справа, горизонталь влево
        points = [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
      }
      totalLen = W + D;
    } else if (s === "u") {
      if (!W || W <= 0 || !D || D <= 0) return;
      // П-форма: 4 точки, основа + 2 боковины
      const x0 = cx - W / 2, x1 = cx + W / 2;
      const y0 = cy - D / 2, y1 = cy + D / 2;
      points = [
        { x: x0, y: y0 },
        { x: x0, y: y1 },
        { x: x1, y: y1 },
        { x: x1, y: y0 },
      ];
      totalLen = W + 2 * D;
    } else if (s === "square") {
      if (!W || W <= 0) return;
      const half = W / 2;
      points = [
        { x: cx - half, y: cy - half },
        { x: cx - half, y: cy + half },
        { x: cx + half, y: cy + half },
        { x: cx + half, y: cy - half },
      ];
      closed = true;
      totalLen = W * 4;
    }

    if (points.length < 2) return;
    const newId = crypto.randomUUID();
    setElements(prev => [...prev, {
      id: newId,
      type: lightSpecInput.type,
      shape: "freeform",
      points,
      length: Math.round(totalLen),
      ...(closed && { closed: true }),
    }]);
    setSelectedId(newId);
    setLightSpecInput(null);
    setLightShapeChoice(null);
    setActiveType(null);
  }

  function confirmFurniture() {
    if (!furnitureMenu) return;
    const t = furnitureMenu.furnitureType;
    const canCeil = canBeToCeiling(t);
    const mode: CeilingMode = canCeil ? furnCeilingMode : "decor";
    const w = parseFloat(furnW), h = parseFloat(furnH);
    if (!w || !h) { setFurnitureMenu(null); return; }
    // Создаём базовый элемент и применяем snap к стене + соседям
    const base: RoomElement = {
      id: crypto.randomUUID(),
      type: "furniture",
      x: furnitureMenu.x,
      y: furnitureMenu.y,
      furnitureType: t,
      width: w,
      height: h,
      rotation: 0,
      ...(mode !== "decor" && { ceilingMode: mode }),
    };
    const snapped = snapFurnitureToWallAndNeighbors(base, vertices, elements);
    const finalEl = snapped ? { ...base, x: snapped.x, y: snapped.y, rotation: snapped.rotation } : base;
    setElements(prev => [...prev, finalEl]);
    setFurnitureMenu(null);
    setFurnCeilingMode("decor");
  }

  function rotateSelected() {
    if (!selectedId) return;
    setElements(prev => prev.map(el => {
      if (el.id !== selectedId) return el;
      // Для freeform-линий (свет.линия, трек) — поворот всех точек на 90° вокруг центроида.
      // Не используем el.rotation, т.к. render идёт по сырым points.
      if (el.shape === "freeform" && el.points && el.points.length >= 2) {
        const cx = el.points.reduce((s, p) => s + p.x, 0) / el.points.length;
        const cy = el.points.reduce((s, p) => s + p.y, 0) / el.points.length;
        // Поворот на 90° против часовой: (x,y) → (cx - (y-cy), cy + (x-cx))
        const newPoints = el.points.map(p => ({
          x: cx - (p.y - cy),
          y: cy + (p.x - cx),
        }));
        return { ...el, points: newPoints };
      }
      // Стандартный путь — для furniture (использует el.rotation в transform).
      return { ...el, rotation: ((el.rotation || 0) + 90) % 360 };
    }));
  }

  function removeSelected() {
    if (!selectedId) return;
    setElements(prev => prev.filter(el =>
      el.id !== selectedId
      // Каскад: удаляя шкаф, удаляем привязанные к нему парящие
      && el.furnitureId !== selectedId
    ));
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
      && !lengthInput && !nicheInput && !subcurtainShapeChoice
      && !lightShapeChoice && !lightSpecInput;
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

    // Группируем софиты: каждая группа (groupId) — одна "точка-центр",
    // одиночные спoты — сами себе группа. При выравнивании двигаем центры,
    // а внутренние смещения софитов в группе сохраняем — двойные/тройные
    // не разваливаются.
    type Cluster = { ids: string[]; cx: number; cy: number };
    const clusters: Cluster[] = [];
    const groupMap = new Map<string, Cluster>();
    for (const e of spotEls) {
      if (e.groupId) {
        let c = groupMap.get(e.groupId);
        if (!c) {
          c = { ids: [], cx: 0, cy: 0 };
          groupMap.set(e.groupId, c);
          clusters.push(c);
        }
        c.ids.push(e.id);
      } else {
        clusters.push({ ids: [e.id], cx: e.x!, cy: e.y! });
      }
    }
    // Считаем центры групп.
    for (const c of clusters) {
      if (c.ids.length === 1) continue; // одиночка — центр уже выставлен
      let sx = 0, sy = 0;
      for (const id of c.ids) {
        const el = elements.find(x => x.id === id)!;
        sx += el.x || 0; sy += el.y || 0;
      }
      c.cx = sx / c.ids.length;
      c.cy = sy / c.ids.length;
    }
    if (clusters.length < 2) return;

    let newCenters: { id: string; cx: number; cy: number }[] = [];
    if (axis === "row") {
      const avgY = clusters.reduce((s, c) => s + c.cy, 0) / clusters.length;
      const sorted = [...clusters].sort((a, b) => a.cx - b.cx);
      const minX = sorted[0].cx, maxX = sorted[sorted.length - 1].cx;
      const step = (maxX - minX) / (clusters.length - 1);
      newCenters = sorted.map((c, i) => ({ id: c.ids[0], cx: minX + step * i, cy: avgY }));
      // Сопоставим обратно с кластерами по первой id.
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].cx = minX + step * i;
        sorted[i].cy = avgY;
      }
    } else {
      const avgX = clusters.reduce((s, c) => s + c.cx, 0) / clusters.length;
      const sorted = [...clusters].sort((a, b) => a.cy - b.cy);
      const minY = sorted[0].cy, maxY = sorted[sorted.length - 1].cy;
      const step = (maxY - minY) / (clusters.length - 1);
      newCenters = sorted.map((c, i) => ({ id: c.ids[0], cx: avgX, cy: minY + step * i }));
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].cx = avgX;
        sorted[i].cy = minY + step * i;
      }
    }
    void newCenters;

    // Применяем: для каждого софита вычисляем его новые координаты как
    // (новый центр группы) + (исходное смещение от старого центра).
    setElements(prev => prev.map(el => {
      if (el.type !== "spot" || el.x === undefined || el.y === undefined) return el;
      // Найдём кластер этого spot.
      const cluster = clusters.find(c => c.ids.includes(el.id));
      if (!cluster) return el;
      // Сохранённый исходный центр для одиночек — это сам spot, оффсет = 0.
      // Для групп — пересчитываем оффсет с прежнего центра.
      const origin = cluster.ids.length === 1
        ? { x: el.x, y: el.y } // одиночка — старая позиция = центр
        : (() => {
            // Восстанавливаем старый центр группы из исходного elements.
            let sx = 0, sy = 0;
            for (const id of cluster.ids) {
              const orig = elements.find(x => x.id === id)!;
              sx += orig.x || 0; sy += orig.y || 0;
            }
            return { x: sx / cluster.ids.length, y: sy / cluster.ids.length };
          })();
      const offX = el.x - origin.x;
      const offY = el.y - origin.y;
      return { ...el, x: cluster.cx + offX, y: cluster.cy + offY };
    }));
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
    if (!isFreeformLine && (el.x === undefined || el.y === undefined)) return;
    const isFurn = el.type === "furniture" && el.width && el.height;

    // Ортогональные расстояния по 4 осям (как на технических чертежах) —
    // строго горизонтальные и вертикальные линии, без диагоналей.
    // Точка отсчёта — центр элемента (или центр freeform-линии).
    let cx: number, cy: number;
    if (isFreeformLine) {
      cx = el.points!.reduce((s, p) => s + p.x, 0) / el.points!.length;
      cy = el.points!.reduce((s, p) => s + p.y, 0) / el.points!.length;
    } else {
      cx = el.x!;
      cy = el.y!;
    }

    // Для мебели — крайние точки прямоугольника по горизонтали/вертикали.
    let halfW = 0, halfH = 0;
    if (isFurn) {
      const rot = ((el.rotation || 0) * Math.PI) / 180;
      const w = el.width! / 2, h = el.height! / 2;
      // Bounding box после поворота
      halfW = Math.abs(w * Math.cos(rot)) + Math.abs(h * Math.sin(rot));
      halfH = Math.abs(w * Math.sin(rot)) + Math.abs(h * Math.cos(rot));
    }

    // Лучи по 4 направлениям. Для каждого — ближайшее пересечение со стеной.
    let leftX = -Infinity, rightX = Infinity, topY = -Infinity, bottomY = Infinity;
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      // Горизонтальный луч y=cy, ищем пересечение с отрезком ab по x.
      if ((a.y - cy) * (b.y - cy) <= 0 && a.y !== b.y) {
        const t = (cy - a.y) / (b.y - a.y);
        const xi = a.x + t * (b.x - a.x);
        if (xi < cx - 0.01 && xi > leftX) leftX = xi;
        if (xi > cx + 0.01 && xi < rightX) rightX = xi;
      }
      // Вертикальный луч x=cx, ищем пересечение с отрезком ab по y.
      if ((a.x - cx) * (b.x - cx) <= 0 && a.x !== b.x) {
        const t = (cx - a.x) / (b.x - a.x);
        const yi = a.y + t * (b.y - a.y);
        if (yi < cy - 0.01 && yi > topY) topY = yi;
        if (yi > cy + 0.01 && yi < bottomY) bottomY = yi;
      }
    }

    // Точка элемента (с учётом размера для мебели) — откуда рисуем линию.
    const fromLeft = isFurn ? cx - halfW : cx;
    const fromRight = isFurn ? cx + halfW : cx;
    const fromTop = isFurn ? cy - halfH : cy;
    const fromBottom = isFurn ? cy + halfH : cy;

    const push = (x1: number, y1: number, x2: number, y2: number, value: number) => {
      const v = Math.round(value);
      if (v <= 5) return;
      dims.push({ x1, y1, x2, y2, label: `${v}`, color: "#94A3B8" });
    };
    if (Number.isFinite(leftX)) push(leftX, cy, fromLeft, cy, fromLeft - leftX);
    if (Number.isFinite(rightX)) push(fromRight, cy, rightX, cy, rightX - fromRight);
    if (Number.isFinite(topY)) push(cx, topY, cx, fromTop, fromTop - topY);
    if (Number.isFinite(bottomY)) push(cx, fromBottom, cx, bottomY, bottomY - fromBottom);
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
    const offset = el.type === "subcurtain"
        ? (el.shape === "u-niche" || el.shape === "l-bend"
            ? wallOffset * 0.15
            : ((el.depth ?? 20) * wallLen / (editableWalls[el.wallIndex] || 1)))
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
    // Парящий привязан к ребру шкафа
    if (el.furnitureId && el.edgeIndex !== undefined) {
      const f = elements.find(e => e.id === el.furnitureId);
      if (!f) return null;
      const corners = getFurnitureCorners(f);
      if (!corners || !corners[el.edgeIndex]) return null;
      const p0 = corners[el.edgeIndex], p1 = corners[(el.edgeIndex + 1) % corners.length];
      // f.x, f.y нужны для shift outward
      if (f.x === undefined || f.y === undefined) return null;
      // Сдвиг наружу от центра шкафа — чтобы линия не накладывалась на стенку шкафа
      const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
      const outDx = midX - f.x!, outDy = midY - f.y!;
      const outL = Math.hypot(outDx, outDy) || 1;
      const shift = 8; // см от ребра наружу
      const ox = (outDx / outL) * shift, oy = (outDy / outL) * shift;
      const sx0 = p0.x + ox, sy0 = p0.y + oy;
      const sx1 = p1.x + ox, sy1 = p1.y + oy;
      return (
        <g key={el.id} onPointerDown={(e) => handleElementPointerDown(el.id, e)} className="cursor-pointer">
          {/* Тёмная подложка — даёт чёткий контур поверх контура шкафа */}
          <line x1={sx0} y1={sy0} x2={sx1} y2={sy1}
            stroke="#0F172A" strokeWidth={strokeW * 2.4} strokeLinecap="butt" opacity={1} />
          {/* Оранжевая полоса парящего */}
          <line x1={sx0} y1={sy0} x2={sx1} y2={sy1}
            stroke="#F97316" strokeWidth={strokeW * 1.6} strokeLinecap="butt" opacity={1} />
        </g>
      );
    }
    if (el.wallIndex === undefined) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const wLen = Math.sqrt(dx * dx + dy * dy);
    if (wLen === 0) return null;
    const nx = dx / wLen, ny = dy / wLen;
    const wallCm = editableWalls[el.wallIndex] || 0;
    const n = vertices.length - 1;

    // Подшторник «съедает» край потолка — на этих участках парящий не рисуем.
    // Г-ниша на соседней стене также откусывает depth у нашей стены через общий угол.
    const occupied: Array<[number, number]> = [];
    for (const sub of elements) {
      if (sub.type !== "subcurtain" || !sub.length || sub.wallIndex === undefined) continue;
      if (sub.wallIndex === el.wallIndex) {
        const subLenSvg = wallCm > 0 ? Math.min(sub.length, wallCm) * wLen / wallCm : 0;
        const subPos = sub.wallPosition ?? 0.5;
        const subStartT = Math.max(0, Math.min(wLen - subLenSvg, subPos * wLen - subLenSvg / 2));
        occupied.push([subStartT, subStartT + subLenSvg]);
        continue;
      }
      if (sub.shape === "l-bend" && sub.depth) {
        const subWallCm = editableWalls[sub.wallIndex] || 0;
        if (subWallCm === 0) continue;
        const depthSvg = sub.depth * wLen / wallCm;
        if (sub.side === "left" && (sub.wallIndex - 1 + n) % n === el.wallIndex) {
          occupied.push([Math.max(0, wLen - depthSvg), wLen]);
        }
        if (sub.side === "right" && (sub.wallIndex + 1) % n === el.wallIndex) {
          occupied.push([0, Math.min(wLen, depthSvg)]);
        }
      }
    }
    // Мебель «до потолка», прилегающая к этой стене — закрывает свой кусок потолка
    {
      const ny = dy / wLen;
      const nxV = dx / wLen;
      const pxV = -ny, pyV = nxV;
      const wallThreshold = Math.max(5, wallCm * 0.03);
      for (const f of elements) {
        if (f.type !== "furniture" || f.ceilingMode !== "to-ceiling") continue;
        const corners = getFurnitureCorners(f);
        if (!corners) continue;
        const tsAtWall: number[] = [];
        for (const c of corners) {
          const t = (c.x - a.x) * nxV + (c.y - a.y) * ny;
          const d = (c.x - a.x) * pxV + (c.y - a.y) * pyV;
          if (d >= -1 && d <= wallThreshold) tsAtWall.push(t);
        }
        if (tsAtWall.length >= 2) {
          const tStart = Math.max(0, Math.min(...tsAtWall));
          const tEnd = Math.min(wLen, Math.max(...tsAtWall));
          if (tEnd - tStart > 1) occupied.push([tStart, tEnd]);
        }
      }
    }
    occupied.sort((p, q) => p[0] - q[0]);
    let gaps: Array<[number, number]> = [];
    let cursor = 0;
    for (const [s, e] of occupied) {
      if (s > cursor) gaps.push([cursor, Math.min(s, wLen)]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < wLen) gaps.push([cursor, wLen]);
    // Если у floating задан конкретный интервал — обрезаем gaps по нему
    if (el.wallPosition !== undefined && el.length && wallCm > 0) {
      const fLenSvg = el.length * wLen / wallCm;
      const fStart = Math.max(0, Math.min(wLen - fLenSvg, el.wallPosition * wLen - fLenSvg / 2));
      const fEnd = fStart + fLenSvg;
      gaps = gaps
        .map(([s, e]): [number, number] => [Math.max(s, fStart), Math.min(e, fEnd)])
        .filter(([s, e]) => e - s > 0.5);
    }

    return (
      <g key={el.id} onPointerDown={(e) => handleElementPointerDown(el.id, e)} className="cursor-pointer">
        {gaps.map(([s, e], gi) => {
          if (e - s < 0.5) return null;
          const x1 = a.x + nx * s, y1 = a.y + ny * s;
          const x2 = a.x + nx * e, y2 = a.y + ny * e;
          return (
            <g key={gi}>
              {/* Лёгкое мягкое свечение */}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#FDBA74" strokeWidth={strokeW * 1.4} strokeLinecap="round" opacity={0.18} />
              {/* Сама светящаяся LED-полоска — тонкая, аккуратная */}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#F97316" strokeWidth={strokeW * 0.55} strokeLinecap="round" opacity={0.95} />
            </g>
          );
        })}
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
    const wallLenCm = editableWalls[el.wallIndex] || 0;

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
      const cxRaw = el.points.reduce((s, p) => s + p.x, 0) / el.points.length;
      const cyRaw = el.points.reduce((s, p) => s + p.y, 0) / el.points.length;
      const offX = dragPos.x - cxRaw, offY = dragPos.y - cyRaw;
      drawPoints = el.points.map(p => ({ x: p.x + offX, y: p.y + offY }));
    }

    const isClosed = !!el.closed;
    const isSel = selectedId === el.id;
    const isStraight = !isClosed && drawPoints.length === 2;
    const cx = drawPoints.reduce((s, p) => s + p.x, 0) / drawPoints.length;
    const cy = drawPoints.reduce((s, p) => s + p.y, 0) / drawPoints.length;

    // Узкий прямоугольный профиль — как реальный трек/свет.линия 2-3 см
    const halfW = strokeW * 0.65;
    const dashArr = el.type === "track" ? `${strokeW * 2} ${strokeW * 1}` : undefined;

    // Прямоугольный outline шириной 2*halfW. Для прямой — 4 угла, для multi-segment —
    // offset polygon с miter joins (две параллельные обводки на каждом сегменте).
    let lineNode: React.ReactNode;
    let hitNode: React.ReactNode;
    {
      const n = drawPoints.length;
      const outer: Array<{ x: number; y: number }> = [];
      const inner: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < n; i++) {
        if (i === 0 || i === n - 1) {
          const j = i === 0 ? 0 : i - 1;
          const k = i === 0 ? 1 : i;
          const dxs = drawPoints[k].x - drawPoints[j].x, dys = drawPoints[k].y - drawPoints[j].y;
          const L = Math.hypot(dxs, dys) || 1;
          const px = -dys / L, py = dxs / L;
          outer.push({ x: drawPoints[i].x + px * halfW, y: drawPoints[i].y + py * halfW });
          inner.push({ x: drawPoints[i].x - px * halfW, y: drawPoints[i].y - py * halfW });
        } else {
          const dx1 = drawPoints[i].x - drawPoints[i - 1].x, dy1 = drawPoints[i].y - drawPoints[i - 1].y;
          const L1 = Math.hypot(dx1, dy1) || 1;
          const n1x = -dy1 / L1, n1y = dx1 / L1;
          const dx2 = drawPoints[i + 1].x - drawPoints[i].x, dy2 = drawPoints[i + 1].y - drawPoints[i].y;
          const L2 = Math.hypot(dx2, dy2) || 1;
          const n2x = -dy2 / L2, n2y = dx2 / L2;
          const sx = n1x + n2x, sy = n1y + n2y;
          const sL = Math.hypot(sx, sy) || 1;
          const ux = sx / sL, uy = sy / sL;
          const cosA = ux * n1x + uy * n1y;
          const limit = halfW * 4;
          const m = Math.min(halfW / Math.max(Math.abs(cosA), 0.2), limit);
          outer.push({ x: drawPoints[i].x + ux * m, y: drawPoints[i].y + uy * m });
          inner.push({ x: drawPoints[i].x - ux * m, y: drawPoints[i].y - uy * m });
        }
      }
      const polyPts = [...outer, ...inner.reverse()].map(p => `${p.x},${p.y}`).join(" ");
      lineNode = (
        <polygon points={polyPts} fill="none" stroke={config.color}
          strokeWidth={strokeW * 0.55} strokeLinejoin="miter"
          strokeDasharray={dashArr} opacity={0.95} />
      );
      // Расширенная зона тапа — толстая прозрачная линия/полилиния по центру
      if (isStraight) {
        const [p0, p1] = drawPoints;
        hitNode = (
          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
            stroke="transparent" strokeWidth={strokeW * 12} strokeLinecap="round" />
        );
      } else {
        const Shape = isClosed ? "polygon" : "polyline";
        const pointsStr = drawPoints.map(p => `${p.x},${p.y}`).join(" ");
        hitNode = (
          <Shape points={pointsStr} fill="none" stroke="transparent"
            strokeWidth={strokeW * 12} strokeLinecap="round" strokeLinejoin="round" />
        );
      }
    }

    // Размеры от стен — лучи: вдоль линии (от концов) + перпендикулярно (от середины)
    type Ray = { pt: { x: number; y: number }; ux: number; uy: number; key: string };
    const rays: Ray[] = [];
    if (isSel && (el.type === "track" || el.type === "lightline") && drawPoints.length >= 2) {
      const a0 = { x: drawPoints[0].x - drawPoints[1].x, y: drawPoints[0].y - drawPoints[1].y };
      const a0L = Math.hypot(a0.x, a0.y);
      if (a0L > 0.001) rays.push({ pt: drawPoints[0], ux: a0.x / a0L, uy: a0.y / a0L, key: "along0" });

      const lastIdx = drawPoints.length - 1;
      const aN = { x: drawPoints[lastIdx].x - drawPoints[lastIdx - 1].x, y: drawPoints[lastIdx].y - drawPoints[lastIdx - 1].y };
      const aNL = Math.hypot(aN.x, aN.y);
      if (aNL > 0.001) rays.push({ pt: drawPoints[lastIdx], ux: aN.x / aNL, uy: aN.y / aNL, key: "alongN" });

      if (isStraight) {
        const mx = (drawPoints[0].x + drawPoints[1].x) / 2;
        const my = (drawPoints[0].y + drawPoints[1].y) / 2;
        const ldx = drawPoints[1].x - drawPoints[0].x, ldy = drawPoints[1].y - drawPoints[0].y;
        const lLen = Math.hypot(ldx, ldy);
        if (lLen > 0.001) {
          const lux = ldx / lLen, luy = ldy / lLen;
          rays.push({ pt: { x: mx, y: my }, ux: -luy, uy: lux, key: "perpA" });
          rays.push({ pt: { x: mx, y: my }, ux: luy, uy: -lux, key: "perpB" });
        }
      } else {
        // Многосегментная (П/Г-форма): для каждого сегмента — perp-луч НАРУЖУ от центра формы.
        const cxF = drawPoints.reduce((s, p) => s + p.x, 0) / drawPoints.length;
        const cyF = drawPoints.reduce((s, p) => s + p.y, 0) / drawPoints.length;
        for (let i = 0; i < drawPoints.length - 1; i++) {
          const p0 = drawPoints[i], p1 = drawPoints[i + 1];
          const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (segLen < 0.001) continue;
          const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
          const lux = (p1.x - p0.x) / segLen, luy = (p1.y - p0.y) / segLen;
          const vx = mx - cxF, vy = my - cyF;
          const dot = vx * (-luy) + vy * lux;
          if (dot >= 0) {
            rays.push({ pt: { x: mx, y: my }, ux: -luy, uy: lux, key: `perp${i}` });
          } else {
            rays.push({ pt: { x: mx, y: my }, ux: luy, uy: -lux, key: `perp${i}` });
          }
        }
      }
    }

    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        {hitNode}
        {/* Подсветка выделения — пунктирная обводка чуть шире прямоугольника */}
        {isSel && isStraight && (() => {
          const [p0, p1] = drawPoints;
          const sdx = p1.x - p0.x, sdy = p1.y - p0.y;
          const slen = Math.hypot(sdx, sdy) || 1;
          const sux = sdx / slen, suy = sdy / slen;
          const spx = -suy, spy = sux;
          const selW = halfW * 1.7;
          const sc = [
            `${p0.x + spx * selW},${p0.y + spy * selW}`,
            `${p1.x + spx * selW},${p1.y + spy * selW}`,
            `${p1.x - spx * selW},${p1.y - spy * selW}`,
            `${p0.x - spx * selW},${p0.y - spy * selW}`,
          ].join(" ");
          return <polygon points={sc} fill="none" stroke={config.color}
            strokeWidth={strokeW * 0.4} opacity={0.45}
            strokeDasharray={`${strokeW * 0.8} ${strokeW * 0.6}`} />;
        })()}
        {lineNode}
        {/* Подпись длины — для multi-segment над центроидом */}
        {!isStraight && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={labelSize * 0.7} fill={config.color} fontWeight="500" opacity={0.7}>
            {el.length} см
          </text>
        )}
        {/* Размеры от стен */}
        {rays.map(({ pt, ux, uy, key }) => {
          let bestT = Infinity, bestScale = 1;
          for (let w = 0; w < vertices.length - 1; w++) {
            const va = vertices[w], vb = vertices[w + 1];
            const wdx = vb.x - va.x, wdy = vb.y - va.y;
            const det = uy * wdx - ux * wdy;
            if (Math.abs(det) < 0.001) continue;
            const t = (-(va.x - pt.x) * wdy + (va.y - pt.y) * wdx) / det;
            const s = (ux * (va.y - pt.y) - uy * (va.x - pt.x)) / det;
            if (t > 0.001 && s >= -0.001 && s <= 1.001 && t < bestT) {
              bestT = t;
              const wallLenSvg = Math.hypot(wdx, wdy);
              const wallLenCm = editableWalls[w] || wallLenSvg;
              bestScale = wallLenCm / wallLenSvg;
            }
          }
          if (bestT === Infinity) return null;
          const hitX = pt.x + ux * bestT;
          const hitY = pt.y + uy * bestT;
          const distCm = Math.round(bestT * bestScale);
          if (distCm < 1) return null;
          const lblX = (pt.x + hitX) / 2 - uy * labelSize * 0.7;
          const lblY = (pt.y + hitY) / 2 + ux * labelSize * 0.7;
          return (
            <g key={key}>
              <line x1={pt.x} y1={pt.y} x2={hitX} y2={hitY}
                stroke={config.color} strokeWidth={strokeW * 0.4}
                strokeDasharray={`${strokeW * 0.8} ${strokeW * 0.5}`} opacity={0.7} />
              <text x={lblX} y={lblY} textAnchor="middle" dominantBaseline="central"
                fontSize={labelSize * 0.6} fill={config.color} fontWeight="700">
                {distCm}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  function spotCircle(el: RoomElement) {
    const pos = getElPos(el);
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const isClient = el.variant === "client";
    const fillColor = isClient ? "#6B7280" : "#F59E0B";
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

  function pendantCircle(el: RoomElement) {
    const pos = getElPos(el);
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    const fillColor = "#3B82F6";
    const isSel = selectedId === el.id;
    // Подвесной светильник — кружок поменьше софита (~60% от софита).
    const r = spotR * 0.45;
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        <circle cx={pos.x} cy={pos.y} r={spotR * 3} fill="transparent" />
        {isSel && <circle cx={pos.x} cy={pos.y} r={r * 1.8} fill="none" stroke={fillColor} strokeWidth={spotR * 0.2} strokeDasharray={`${spotR * 0.4},${spotR * 0.25}`} />}
        <circle cx={pos.x} cy={pos.y} r={r} fill={fillColor} />
        <circle cx={pos.x} cy={pos.y} r={r * 0.4} fill="#fff" />
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
    const ceilingMode: CeilingMode = el.ceilingMode || "decor";
    const isToCeil = ceilingMode === "to-ceiling";
    const isPlanned = ceilingMode === "planned";

    // Грани мебели «в комнату» (где идёт профиль) — для подсветки. Только если to-ceiling/planned.
    let inRoomEdges: boolean[] = [false, false, false, false];
    if (isToCeil || isPlanned) {
      const atWall = classifyEdges(
        { type: "furniture", x: pos.x, y: pos.y, width: w, height: h, rotation: rot, ceilingMode },
        vertices,
        elements,
      );
      inRoomEdges = atWall.map(a => !a);
    }

    // In light tab, furniture should not intercept pointer events
    const pointerEvents = toolbarTab === "light" ? "none" as const : undefined;

    // Стиль обводки и заливки в зависимости от режима
    const strokeColor = isToCeil || isPlanned ? "#0F172A" : clr;
    const strokeW2 = isToCeil ? strokeW * 0.7 : isPlanned ? strokeW * 0.5 : strokeW * 0.4;
    const dashArr = isPlanned ? `${strokeW * 1.5} ${strokeW * 0.8}` : undefined;
    const fillOpacity = isToCeil ? 0.25 : isPlanned ? 0.12 : 0.12;
    // Подсветка in-room граней — цветом профиля, тоньше для чёткости
    const profileColor = "#06B6D4";
    const profileWidth = strokeW * 1.0;
    // Локальные точки полигона: custom — из polygonPoints, иначе rect 4 угла.
    const localPoints: { x: number; y: number }[] = (el.polygonPoints && el.polygonPoints.length >= 3)
      ? el.polygonPoints
      : [
          { x: -w / 2, y: -h / 2 },
          { x:  w / 2, y: -h / 2 },
          { x:  w / 2, y:  h / 2 },
          { x: -w / 2, y:  h / 2 },
        ];
    const localEdges = localPoints.map((p, i) => {
      const next = localPoints[(i + 1) % localPoints.length];
      return { x1: p.x, y1: p.y, x2: next.x, y2: next.y };
    });
    const polygonPath = localPoints.map(p => `${p.x},${p.y}`).join(" ");
    // BBox для outline-рамки выбора и hit-bg
    const xs = localPoints.map(p => p.x), ys = localPoints.map(p => p.y);
    const bbMinX = Math.min(...xs), bbMaxX = Math.max(...xs);
    const bbMinY = Math.min(...ys), bbMaxY = Math.max(...ys);
    const bbW = bbMaxX - bbMinX, bbH = bbMaxY - bbMinY;

    return (
      <g key={el.id} transform={`translate(${pos.x}, ${pos.y}) rotate(${rot})`}
        onPointerDown={toolbarTab !== "light" ? (e) => handleElementPointerDown(el.id, e) : undefined}
        className={toolbarTab !== "light" ? "cursor-grab active:cursor-grabbing" : ""}
        opacity={isDragging ? 0.7 : 1}
        pointerEvents={pointerEvents}
      >
        {isSel && (
          <rect x={bbMinX - roomSize * 0.01} y={bbMinY - roomSize * 0.01}
            width={bbW + roomSize * 0.02} height={bbH + roomSize * 0.02}
            rx={roomSize * 0.01} fill="none" stroke={clr}
            strokeWidth={spotR * 0.25} strokeDasharray={`${spotR * 0.5},${spotR * 0.3}`} />
        )}
        <polygon points={polygonPath} fill={clr} opacity={fillOpacity}
          stroke={strokeColor} strokeWidth={strokeW2} strokeDasharray={dashArr}
          strokeLinejoin="miter" strokeLinecap="butt" vectorEffect="non-scaling-stroke" />
        {/* Подсветка in-room граней (где идёт профиль натяжного потолка) */}
        {(isToCeil || isPlanned) && localEdges.map((e, i) => inRoomEdges[i] && (
          <line key={`pe-${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={profileColor} strokeWidth={profileWidth} strokeLinecap="butt"
            strokeDasharray={isPlanned ? `${strokeW * 2} ${strokeW * 1}` : undefined} />
        ))}
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
        {/* Бейдж режима — для to-ceiling/planned */}
        {(isToCeil || isPlanned) && (
          <text x={0} y={-h / 2 - labelSize * 0.6} textAnchor="middle" dominantBaseline="central"
            fontSize={labelSize * 0.5} fill={isToCeil ? "#0891B2" : "#7C3AED"} fontWeight="700">
            {isToCeil ? "📐 ДО ПОТОЛКА" : "💭 ПОД БУДУЩУЮ"}
          </text>
        )}
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
    // Площадь натяжного потолка минус мебель «до потолка» (она съедает площадь)
    const fcStats = furnitureCeilingStats(
      elements as { type: string; x?: number; y?: number; width?: number; height?: number; rotation?: number; ceilingMode?: "decor" | "to-ceiling" | "planned" }[],
      vertices,
    );
    const furnAreaM2 = fcStats.areaToSubtractCm2 / 10000;
    const effectiveArea = Math.max(0, room.area - furnAreaM2);
    cost += effectiveArea * (p.canvas_320 || 2000);
    // Багет/вставка идут только по стенам, НЕ под подшторником.
    // + Учитываем обход мебели до потолка (in-room грани добавляются, at-wall вычитаются).
    const podOnWallM = subcurtainOnWallLengthCm(elements) / 100;
    const furnPerimDeltaM = fcStats.perimeterDeltaCm / 100;
    const profilePerim = Math.max(0, room.perimeter - podOnWallM + furnPerimDeltaM);
    cost += profilePerim * (p.profile_plastic || 500);
    cost += profilePerim * (p.insert || 1000);
    cost += editableWalls.length * (p.corner_plastic || 1000);
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
    // Скруглённые углы — отдельная позиция в КП (сложнее в монтаже)
    const roundedCount = (room.cornerRadii || []).filter(r => r > 0).length;
    if (roundedCount > 0) cost += roundedCount * (p.corner_rounded || 5000);
    // Уголки обхода мебели до потолка
    if (fcStats.bypassPerimeterCm > 0) cost += (fcStats.bypassPerimeterCm / 100) * (p.corner_furniture_bypass || 2000);
    if (fcStats.plannedCorners > 0) cost += fcStats.plannedCorners * (p.corner_furniture_planned || 1500);
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
    lines.push(`Стены: ${editableWalls.join(" · ")} см`);
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
        <button
          onClick={() => setNameEdit(editableName)}
          className="text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted active:bg-muted"
          title="Тап — переименовать"
        >
          {editableName} · {computedArea.toFixed(2)} м²
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        <button onClick={() => onDone(elements, { walls: editableWalls, area: computedArea, perimeter: computedPerimeter, name: editableName })}
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
              || elements.find(e => e.id === selectedId)?.type === "chandelier"
              || elements.find(e => e.id === selectedId)?.type === "lightline"
              || elements.find(e => e.id === selectedId)?.type === "track") && (
              <button onClick={rotateSelected}
                className="p-2.5 rounded-xl bg-violet-100 text-violet-700 hover:bg-violet-200 active:scale-95 shadow-sm"
                title="Повернуть на 90°">
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
                    const wallLen = editableWalls[selEl.wallIndex] || 1;
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
        {/* View mode + Zoom controls — в 2D слева, в 3D справа сверху, чтобы не конфликтовать со Scene3D */}
        <div className={`absolute top-2 z-30 flex flex-col gap-1 ${viewMode === "3d" ? "right-2" : "left-2"}`}>
          <button
            onClick={() => setViewMode(m => m === "2d" ? "3d" : "2d")}
            className={`h-9 px-3 rounded-lg shadow-md border flex items-center justify-center gap-1 text-xs font-bold active:scale-95 ${
              viewMode === "3d"
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white/70 text-gray-700 hover:bg-white"
            }`}
            title={viewMode === "2d" ? "Показать 3D" : "Вернуться в 2D"}
          >
            {viewMode === "2d" ? <Box className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {viewMode === "2d" ? "3D" : "← 2D"}
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
              walls={editableWalls}
              ceilingHeight={room.ceilingHeight ?? DEFAULT_CEILING_HEIGHT_CM}
              elements={elements}
              onScreenshot={onPreviewSaved}
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
          {/* Room fill — path с дугами на скруглённых углах (если есть) */}
          {(() => {
            const roomPath = getRoomPath(vertices, room.cornerRadii);
            return (
              <>
                <defs>
                  <clipPath id="room-clip">
                    <path d={roomPath} />
                  </clipPath>
                </defs>
                <path d={roomPath}
                  fill="#F8FAFC" stroke="#94A3B8" strokeWidth={strokeW * 0.6} strokeLinejoin="round" />
              </>
            );
          })()}

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

          {/* Wall dimension labels — архитектурный стиль:
              - подложка-плашка под текстом (читаемо на любом фоне)
              - короткие стены: больший отступ + линия-выноска от середины стены к подписи
              - длинные: подпись прямо у стены без выноски */}
          {vertices.slice(0, -1).map((a, i) => {
            const b = vertices[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const wLen = Math.sqrt(dx * dx + dy * dy);
            if (wLen === 0) return null;
            const realLen = editableWalls[i] || 0;
            const isShort = realLen < 100;
            const isVeryShort = realLen < 60;
            const fontScale = isVeryShort ? 0.55 : isShort ? 0.65 : 0.75;
            const offsetMul = isVeryShort ? 3.6 : isShort ? 2.8 : 1.8;
            const nx = dx / wLen, ny = dy / wLen;
            const outX = ny, outY = -nx;
            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;
            const mx = cx + outX * labelSize * offsetMul;
            const my = cy + outY * labelSize * offsetMul;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle > 90 || angle <= -90) angle += 180;
            // Скругления концов стены
            const rA = room.cornerRadii?.[i] || 0;
            const nextIdx = (i + 1) % (vertices.length - 1);
            const rB = room.cornerRadii?.[nextIdx] || 0;
            const straightLen = realLen - rA - rB;
            const hasRounding = rA > 0 || rB > 0;
            // Размер плашки под текст
            const fs = labelSize * fontScale;
            const lenStr = String(realLen);
            const padX = fs * 0.5;
            const bgW = lenStr.length * fs * 0.55 + padX * 2;
            const bgH = fs * 1.15;
            return (
              <g key={`dim-${i}`}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  // Тап на цифру — открыть редактирование размера стены.
                  e.stopPropagation();
                  setWallSizeEdit({ index: i, value: String(realLen) });
                }}
              >
                {/* Линия-выноска для коротких стен (от середины стены к подписи) */}
                {isShort && (
                  <line x1={cx} y1={cy} x2={mx} y2={my}
                    stroke="#cbd5e1" strokeWidth={strokeW * 0.15} strokeDasharray={`${strokeW * 0.4} ${strokeW * 0.3}`} />
                )}
                {/* Засечки на концах стены — где она реально начинается/кончается */}
                {isShort && (
                  <>
                    <line x1={a.x - outX * labelSize * 0.2} y1={a.y - outY * labelSize * 0.2}
                      x2={a.x + outX * labelSize * 0.6} y2={a.y + outY * labelSize * 0.6}
                      stroke="#cbd5e1" strokeWidth={strokeW * 0.2} />
                    <line x1={b.x - outX * labelSize * 0.2} y1={b.y - outY * labelSize * 0.2}
                      x2={b.x + outX * labelSize * 0.6} y2={b.y + outY * labelSize * 0.6}
                      stroke="#cbd5e1" strokeWidth={strokeW * 0.2} />
                  </>
                )}
                {/* Подложка-плашка под текстом */}
                <rect x={mx - bgW / 2} y={my - bgH / 2} width={bgW} height={bgH}
                  rx={bgH * 0.25} fill="#ffffff" stroke="#1e3a5f" strokeWidth={strokeW * 0.18}
                  opacity={0.95}
                  transform={`rotate(${angle}, ${mx}, ${my})`} />
                <text x={mx} y={my} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fill="#475569" fontWeight="600"
                  transform={`rotate(${angle}, ${mx}, ${my})`}>
                  {realLen}
                </text>
                {/* Прямая часть стены (если есть скругления концов) — ниже подложки */}
                {hasRounding && straightLen > 0 && (() => {
                  const sx2 = mx + outX * fs * 1.4;
                  const sy2 = my + outY * fs * 1.4;
                  const sStr = `пр. ${Math.round(straightLen)}`;
                  const sBgW = sStr.length * fs * 0.45 + padX * 1.6;
                  const sBgH = fs * 0.95;
                  return (
                    <g>
                      <rect x={sx2 - sBgW / 2} y={sy2 - sBgH / 2} width={sBgW} height={sBgH}
                        rx={sBgH * 0.25} fill="#ecfdf5" stroke="#10b981" strokeWidth={strokeW * 0.12}
                        opacity={0.95}
                        transform={`rotate(${angle}, ${sx2}, ${sy2})`} />
                      <text x={sx2} y={sy2} textAnchor="middle" dominantBaseline="central"
                        fontSize={fs * 0.75} fill="#047857" fontWeight="700"
                        transform={`rotate(${angle}, ${sx2}, ${sy2})`}>
                        {sStr}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Подписи скруглённых углов: R и длина дуги (πR/2 для угла 90°).
              Размещаем рядом с дугой, внутри комнаты (по биссектрисе угла). */}
          {room.cornerRadii && vertices.slice(0, -1).map((v, i) => {
            const r = room.cornerRadii?.[i] || 0;
            if (r <= 0) return null;
            const n = vertices.length - 1;
            const prev = vertices[(i - 1 + n) % n];
            const next = vertices[i + 1];
            const dxP = prev.x - v.x, dyP = prev.y - v.y;
            const dxN = next.x - v.x, dyN = next.y - v.y;
            const lenP = Math.hypot(dxP, dyP) || 1;
            const lenN = Math.hypot(dxN, dyN) || 1;
            // Биссектриса (внутрь угла) = нормированная сумма направлений к prev и next
            let bx = dxP / lenP + dxN / lenN;
            let by = dyP / lenP + dyN / lenN;
            const blen = Math.hypot(bx, by) || 1;
            bx /= blen; by /= blen;
            // Размещаем подпись на расстоянии R от вершины по биссектрисе (примерно центр зоны дуги)
            const labelX = v.x + bx * (r + labelSize * 1.5);
            const labelY = v.y + by * (r + labelSize * 1.5);
            const arcLen = Math.round(Math.PI * r / 2);
            return (
              <g key={`rc-label-${i}`}>
                <rect x={labelX - labelSize * 1.6} y={labelY - labelSize * 0.5}
                  width={labelSize * 3.2} height={labelSize * 1.0}
                  rx={labelSize * 0.2} fill="#ecfdf5" stroke="#10b981" strokeWidth={strokeW * 0.2} opacity={0.95} />
                <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central"
                  fontSize={labelSize * 0.55} fill="#047857" fontWeight="700">
                  R{r}·дуга {arcLen}
                </text>
              </g>
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

          {/* Pendant lights (подвесной / бра) — меньше софита */}
          {elements.filter(e => e.type === "pendant").map(pendantCircle)}

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
        {/* Popup редактирования названия комнаты. */}
        {nameEdit !== null && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 z-30"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setNameEdit(null);
            }}
          >
            <div className="bg-white rounded-xl shadow-2xl p-4 w-72 space-y-3">
              <p className="text-sm font-semibold">Название комнаты</p>
              <input
                type="text"
                autoFocus
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                placeholder="Кухня, гостиная, спальня…"
                className="w-full px-3 py-2 border rounded-lg text-base"
              />
              <div className="flex flex-wrap gap-1.5">
                {["Кухня", "Гостиная", "Спальня", "Прихожая", "Ванная", "Детская", "Кабинет"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setNameEdit(preset)}
                    className="px-2 py-1 text-xs rounded-full border hover:bg-muted"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setNameEdit(null)}
                  className="flex-1 py-2 rounded-lg border text-sm font-medium hover:bg-muted"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    const name = (nameEdit ?? "").trim() || "Помещение";
                    setEditableName(name);
                    setNameEdit(null);
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:bg-[#152d4a]"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Popup редактирования размера стены — поверх SVG. */}
        {wallSizeEdit && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 z-30"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setWallSizeEdit(null);
            }}
          >
            <div className="bg-white rounded-xl shadow-2xl p-4 w-72 space-y-3">
              <p className="text-sm font-semibold">
                Стена #{wallSizeEdit.index + 1}
              </p>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Длина (см)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  min="1"
                  step="1"
                  value={wallSizeEdit.value}
                  onChange={(e) =>
                    setWallSizeEdit({ ...wallSizeEdit, value: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg text-base"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setWallSizeEdit(null)}
                  className="flex-1 py-2 rounded-lg border text-sm font-medium hover:bg-muted"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    if (!wallSizeEdit) return;
                    const v = parseFloat(wallSizeEdit.value);
                    if (!isFinite(v) || v <= 0) {
                      setWallSizeEdit(null);
                      return;
                    }
                    setEditableWalls((prev) =>
                      prev.map((w, j) => (j === wallSizeEdit.index ? Math.round(v) : w))
                    );
                    setWallSizeEdit(null);
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:bg-[#152d4a]"
                >
                  Сохранить
                </button>
              </div>
              {editableWalls.length > 4 && editableWalls[wallSizeEdit.index] < 100 && (
                <button
                  onClick={() => {
                    if (!wallSizeEdit) return;
                    // Удаление выступа: убираем эту короткую стену из массива.
                    // Это упрощает форму комнаты на одну сторону.
                    setEditableWalls((prev) =>
                      prev.filter((_, j) => j !== wallSizeEdit.index)
                    );
                    setWallSizeEdit(null);
                  }}
                  className="w-full py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50"
                >
                  Удалить эту стенку (выступ)
                </button>
              )}
            </div>
          </div>
        )}
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
        <div className="shrink-0 px-3 py-1.5 border-t bg-amber-50 flex flex-col gap-1.5">
          <div className="flex items-center justify-center gap-2">
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
          {/* Группа: ставит сразу 2-3 софита одним кликом */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            <span className="text-[10px] text-amber-800/80">Группа:</span>
            {([
              ["1", "1", null],
              ["2h", "●●", "горизонт"],
              ["2v", "●\n●", "верт"],
              ["3h", "●●●", "горизонт"],
              ["3v", "●\n●\n●", "верт"],
            ] as const).map(([key, glyph, hint]) => (
              <button
                key={key}
                onClick={() => setSpotGroup(key)}
                title={hint || "Одиночный"}
                className={`min-w-[36px] px-2 py-0.5 rounded text-[11px] font-semibold transition-all whitespace-pre leading-tight ${
                  spotGroup === key
                    ? "bg-amber-600 text-white"
                    : "bg-white border border-amber-300 text-amber-700"
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
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
        const wallLen = editableWalls[wallIdx] || 0;
        const close = () => setSubcurtainShapeChoice(null);
        const pickStraight = () => {
          setSubcurtainShapeChoice(null);
          setLengthInput({ wallIndex: wallIdx, extraDepth: "20" });
          setLengthValue(String(Math.round(wallLen)));
          setLengthSide("center");
          setLengthDepthValue("20");
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
        const wallLen = editableWalls[nicheInput.wallIndex] || 0;
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

      {/* Свет.линия / трек — выбор формы (Прямая / Г / П / Квадрат) */}
      {lightShapeChoice && (() => {
        const t = lightShapeChoice.type;
        const close = () => setLightShapeChoice(null);
        const pick = (shape: "straight" | "l" | "u" | "square") => {
          setLightShapeChoice(null);
          setLightSpecInput({
            type: t,
            shape,
            length: shape === "straight" ? "200" : "",
            width: shape === "square" ? "100" : (shape === "l" || shape === "u") ? "200" : "",
            depth: (shape === "l" || shape === "u") ? "100" : "",
            side: "left",
          });
        };
        const label = t === "lightline" ? "✨ Свет.линия — форма" : "🔲 Трек — форма";
        return (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">{label}</span>
                <button onClick={close} className="p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => pick("straight")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">━</span>
                  <span className="text-xs font-semibold">Прямая</span>
                </button>
                <button onClick={() => pick("l")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">⌐</span>
                  <span className="text-xs font-semibold">Г-форма</span>
                </button>
                <button onClick={() => pick("u")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">⊓</span>
                  <span className="text-xs font-semibold">П-форма</span>
                </button>
                <button onClick={() => pick("square")}
                  className="flex flex-col items-center gap-1 py-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] active:scale-95">
                  <span className="text-2xl">□</span>
                  <span className="text-xs font-semibold">Квадрат</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Свет.линия / трек — ввод размеров для выбранной формы */}
      {lightSpecInput && (() => {
        const s = lightSpecInput.shape;
        const close = () => setLightSpecInput(null);
        const isStraight = s === "straight";
        const isL = s === "l";
        const isU = s === "u";
        const isSquare = s === "square";
        const title = lightSpecInput.type === "lightline" ? "✨ Свет.линия" : "🔲 Трек";
        const shapeLabel = isStraight ? "Прямая" : isL ? "Г-форма" : isU ? "П-форма" : "Квадрат";
        const validStraight = isStraight && parseFloat(lightSpecInput.length) > 0;
        const validLU = (isL || isU) && parseFloat(lightSpecInput.width) > 0 && parseFloat(lightSpecInput.depth) > 0;
        const validSquare = isSquare && parseFloat(lightSpecInput.width) > 0;
        const valid = validStraight || validLU || validSquare;
        return (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">{title} — {shapeLabel}</span>
                <button onClick={close} className="p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-3">
                {isStraight && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Длина (см)</label>
                    <input type="number" inputMode="numeric" autoFocus
                      value={lightSpecInput.length}
                      onChange={(e) => setLightSpecInput(prev => prev ? { ...prev, length: e.target.value } : null)}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                  </div>
                )}
                {(isL || isU) && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Ширина (см)</label>
                      <input type="number" inputMode="numeric" autoFocus
                        value={lightSpecInput.width}
                        onChange={(e) => setLightSpecInput(prev => prev ? { ...prev, width: e.target.value } : null)}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Глубина (см)</label>
                      <input type="number" inputMode="numeric"
                        value={lightSpecInput.depth}
                        onChange={(e) => setLightSpecInput(prev => prev ? { ...prev, depth: e.target.value } : null)}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                    </div>
                  </>
                )}
                {isL && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Сторона выпуска</label>
                    <div className="flex gap-2 mt-1">
                      {(["left", "right"] as const).map(sd => (
                        <button key={sd}
                          onClick={() => setLightSpecInput(prev => prev ? { ...prev, side: sd } : null)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${
                            lightSpecInput.side === sd ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-gray-300"
                          }`}>
                          {sd === "left" ? "← Слева" : "Справа →"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isSquare && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Сторона квадрата (см)</label>
                    <input type="number" inputMode="numeric" autoFocus
                      value={lightSpecInput.width}
                      onChange={(e) => setLightSpecInput(prev => prev ? { ...prev, width: e.target.value } : null)}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-base" />
                  </div>
                )}
              </div>
              <button onClick={confirmLightSpec}
                disabled={!valid}
                className="w-full mt-5 py-3 rounded-xl bg-[#1e3a5f] text-white font-semibold disabled:opacity-30 active:scale-95">
                Добавить
              </button>
            </div>
          </div>
        );
      })()}

      {/* Length input with numpad */}
      {lengthInput && (() => {
        const wallLen = editableWalls[lengthInput.wallIndex] || 0;
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
              <div className="flex justify-center mt-2">
                <button
                  onClick={() => {
                    setLengthValue(String(Math.round(wallLen)));
                    setLengthSide("center");
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold active:scale-95"
                >
                  По всей стене ({Math.round(wallLen)} см)
                </button>
              </div>
              {lengthInput.extraDepth !== undefined && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground text-center mb-1.5">Отступ от стены</p>
                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                    {[10, 15, 20, 25, 30].map(d => (
                      <button key={d} onClick={() => setLengthDepthValue(String(d))}
                        className={`px-3 py-1.5 text-xs rounded-lg border active:scale-95 transition-colors ${
                          parseInt(lengthDepthValue) === d
                            ? "bg-[#1e3a5f] text-white border-[#1e3a5f] font-semibold"
                            : "border-gray-300 text-gray-600"
                        }`}>
                        {d} см
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
      {furnitureMenu && (() => {
        const showCeilingPicker = canBeToCeiling(furnitureMenu.furnitureType);
        return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setFurnitureMenu(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-2xl max-h-[100dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center mb-1">
              {FURNITURE.find(f => f.furnitureType === furnitureMenu.furnitureType)?.icon}{" "}
              {FURNITURE.find(f => f.furnitureType === furnitureMenu.furnitureType)?.label}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4">Укажите размеры (см)</p>
            {/* Тип взаимодействия с потолком — только для шкафа/кухни/стенки */}
            {showCeilingPicker && (
              <div className="mb-4">
                <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: "decor", emoji: "🪑", label: "Декор" },
                    { v: "to-ceiling", emoji: "📐", label: "До потолка" },
                    { v: "planned", emoji: "💭", label: "План" },
                  ] as const).map(opt => (
                    <button key={opt.v}
                      onClick={() => setFurnCeilingMode(opt.v)}
                      className={`py-2 rounded-lg border text-[11px] font-semibold leading-tight active:scale-95 ${
                        furnCeilingMode === opt.v ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-gray-300 text-gray-700"
                      }`}>
                      <div className="text-base">{opt.emoji}</div>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {furnCeilingMode === "to-ceiling" && (
                  <p className="text-[10px] text-cyan-700 mt-1.5 text-center">Профиль обойдёт мебель — углы доп. в КП</p>
                )}
                {furnCeilingMode === "planned" && (
                  <p className="text-[10px] text-cyan-700 mt-1.5 text-center">Уголки под будущую мебель — пунктиром</p>
                )}
              </div>
            )}
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
        );
      })()}
    </div>
  );
}
