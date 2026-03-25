"use client";

import { useState, useRef } from "react";
import { X, Undo2, Check, Share2 } from "lucide-react";
import { DEFAULT_PRICES } from "@/lib/constants";

// ── Types ──

export type ElementType = "spot" | "chandelier" | "curtain" | "subcurtain" | "track" | "lightline" | "floating";

export interface RoomElement {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  wallIndex?: number;
  wallPosition?: number; // 0-1, position along the wall (0.5 = centered)
  length?: number; // cm
  variant?: "ours" | "client"; // for spots and tracks: ours = с материалом, client = клиентские
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
}

// ── Element config ──

const ELEMENTS: { type: ElementType; label: string; icon: string; color: string; category: "point" | "wall" | "perimeter" }[] = [
  { type: "spot",        label: "Софит",       icon: "💡", color: "#F59E0B", category: "point" },
  { type: "chandelier",  label: "Люстра",      icon: "🔆", color: "#8B5CF6", category: "point" },
  { type: "curtain",     label: "Гардина",     icon: "📏", color: "#10B981", category: "wall" },
  { type: "subcurtain",  label: "Подшторник",   icon: "📐", color: "#06B6D4", category: "wall" },
  { type: "track",       label: "Трек",        icon: "🔲", color: "#EF4444", category: "wall" },
  { type: "lightline",   label: "Свет.линия",  icon: "✨", color: "#F97316", category: "wall" },
  { type: "floating",    label: "Парящий",     icon: "〰️", color: "#3B82F6", category: "perimeter" },
];

const HINTS: Record<string, string> = {
  point: "Нажмите на комнату чтобы разместить",
  wall: "Нажмите на стену чтобы разместить",
  perimeter: "Нажмите на стену чтобы включить/выключить",
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

// ── Component ──

export default function RoomDesigner({ room, onDone, onCancel }: {
  room: Room;
  onDone: (elements: RoomElement[]) => void;
  onCancel: () => void;
}) {
  const [elements, setElements] = useState<RoomElement[]>(room.elements || []);
  const [activeType, setActiveType] = useState<ElementType | null>(null);
  const [activeVariant, setActiveVariant] = useState<"ours" | "client">("ours");
  const [lengthInput, setLengthInput] = useState<{ wallIndex: number } | null>(null);
  const [lengthValue, setLengthValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
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
  const pad = roomSize * 0.18;
  const vbX = minX - pad, vbY = minY - pad;
  const vbW = roomW + pad * 2, vbH = roomH + pad * 2;

  // Scale factors for element sizes
  const spotR = roomSize * 0.022;
  const chandelierR = roomSize * 0.045;
  const strokeW = roomSize * 0.012;
  const wallOffset = roomSize * 0.05;
  const labelSize = roomSize * 0.028;

  function svgCoords(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = new DOMPoint(clientX, clientY).matrixTransform(inv);
    return { x: pt.x, y: pt.y };
  }

  // ── Drag & Drop ──

  const DRAG_THRESHOLD = 8; // px on screen before considered a drag

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
    setDragPos(coords);
  }

  function handleSVGPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const ds = dragStartRef.current;

    if (ds) {
      if (ds.moved && dragPos) {
        // Finish drag — move element to new position
        const el = elements.find(el => el.id === ds.id);
        if (el) {
          const config = ELEMENTS.find(c => c.type === el.type);
          if (config?.category === "point") {
            // Point element: set new x,y
            setElements(prev => prev.map(e =>
              e.id === ds.id ? { ...e, x: dragPos.x, y: dragPos.y } : e
            ));
          } else if (config?.category === "wall") {
            // Wall element: snap to nearest wall at drag position
            const nearest = nearestWall(dragPos.x, dragPos.y, vertices);
            setElements(prev => prev.map(e =>
              e.id === ds.id ? { ...e, wallIndex: nearest.wallIndex, wallPosition: nearest.t } : e
            ));
          }
        }
      } else {
        // Short tap — remove element
        setElements(prev => prev.filter(el => el.id !== ds.id));
      }
      dragStartRef.current = null;
      setDragId(null);
      setDragPos(null);
      pointerHandled.current = true;
      return;
    }

    // Not dragging — place new element
    if (pointerHandled.current) { pointerHandled.current = false; return; }
    if (!activeType) return;

    const coords = svgCoords(e.clientX, e.clientY);
    if (!coords) return;

    const config = ELEMENTS.find(el => el.type === activeType)!;

    if (config.category === "point") {
      const hasVariant = activeType === "spot";
      setElements(prev => [...prev, {
        id: crypto.randomUUID(),
        type: activeType,
        x: coords.x,
        y: coords.y,
        ...(hasVariant && { variant: activeVariant }),
      }]);
    } else if (config.category === "wall") {
      const nearest = nearestWall(coords.x, coords.y, vertices);
      setLengthInput({ wallIndex: nearest.wallIndex });
      setLengthValue(String(Math.round(nearest.wallLength)));
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

  // Get element position (real or dragging)
  function getElPos(el: RoomElement): { x: number; y: number } {
    if (dragId === el.id && dragPos && dragStartRef.current?.moved) {
      return dragPos;
    }
    return { x: el.x ?? 0, y: el.y ?? 0 };
  }

  function confirmLength() {
    if (!lengthInput || !activeType) return;
    const len = parseFloat(lengthValue);
    if (!len || len <= 0) { setLengthInput(null); return; }
    const hasVariant = activeType === "track";
    setElements(prev => [...prev, {
      id: crypto.randomUUID(),
      type: activeType,
      wallIndex: lengthInput.wallIndex,
      length: len,
      ...(hasVariant && { variant: activeVariant }),
    }]);
    setLengthInput(null);
    setLengthValue("");
  }

  function undo() { setElements(prev => prev.slice(0, -1)); }

  function removeElement(id: string, e?: React.PointerEvent) {
    if (e) { e.stopPropagation(); pointerHandled.current = true; }
    setElements(prev => prev.filter(el => el.id !== id));
  }

  // ── Render helpers ──

  function wallLine(el: RoomElement) {
    if (el.wallIndex === undefined || !el.length) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;

    const dx = b.x - a.x, dy = b.y - a.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return null;

    const nx = dx / wallLen, ny = dy / wallLen;
    // Inward normal (left of clockwise direction)
    const perpX = -ny, perpY = nx;

    const elLen = Math.min(el.length, wallLen);
    // Position along wall: wallPosition 0-1, default 0.5 (centered)
    const pos = el.wallPosition ?? 0.5;
    const startT = Math.max(0, Math.min(wallLen - elLen, (pos * wallLen) - elLen / 2));
    const offset = el.type === "curtain" || el.type === "subcurtain" ? wallOffset * 1.5 : wallOffset;

    const x1 = a.x + nx * startT + perpX * offset;
    const y1 = a.y + ny * startT + perpY * offset;
    const x2 = a.x + nx * (startT + elLen) + perpX * offset;
    const y2 = a.y + ny * (startT + elLen) + perpY * offset;

    const config = ELEMENTS.find(c => c.type === el.type)!;
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

    const isDragging = dragId === el.id && dragStartRef.current?.moved;

    // If being dragged, show on the nearest wall to drag position
    let drawX1 = x1, drawY1 = y1, drawX2 = x2, drawY2 = y2;
    let drawMidX = midX, drawMidY = midY;
    let drawPerpX = perpX, drawPerpY = perpY;

    // During drag: element follows finger freely (centered on drag pos)
    if (isDragging && dragPos) {
      const halfLen = (el.length || 0) / 2;
      // Use wall direction from nearest wall for orientation
      const nearest = nearestWall(dragPos.x, dragPos.y, vertices);
      const da = vertices[nearest.wallIndex], db = vertices[nearest.wallIndex + 1];
      if (da && db) {
        const ddx = db.x - da.x, ddy = db.y - da.y;
        const dwLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const dnx = ddx / dwLen, dny = ddy / dwLen;
        drawPerpX = -dny; drawPerpY = dnx;
        // Center element on drag position, oriented along nearest wall
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
        {/* Invisible hit area for easier grab */}
        <line x1={drawX1} y1={drawY1} x2={drawX2} y2={drawY2}
          stroke="transparent" strokeWidth={strokeW * 6} strokeLinecap="round" />
        {/* Glow for light line */}
        {el.type === "lightline" && (
          <line x1={drawX1} y1={drawY1} x2={drawX2} y2={drawY2}
            stroke={config.color} strokeWidth={strokeW * 4} strokeLinecap="round" opacity={0.15} />
        )}
        <line x1={drawX1} y1={drawY1} x2={drawX2} y2={drawY2}
          stroke={config.color}
          strokeWidth={el.type === "lightline" ? strokeW * 1.5 : strokeW}
          strokeLinecap="round"
          strokeDasharray={el.type === "track" ? `${strokeW * 2.5} ${strokeW * 1.2}` : undefined}
          opacity={0.9}
        />
        {/* End caps for track */}
        {el.type === "track" && (
          <>
            <circle cx={drawX1} cy={drawY1} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
            <circle cx={drawX2} cy={drawY2} r={strokeW * 0.8} fill={config.color} opacity={0.9} />
          </>
        )}
        {/* Length label */}
        <text
          x={drawMidX + drawPerpX * labelSize * 1.5} y={drawMidY + drawPerpY * labelSize * 1.5}
          textAnchor="middle" dominantBaseline="central"
          fontSize={labelSize * 0.85} fill={config.color} fontWeight="600"
        >
          {el.length} см
        </text>
      </g>
    );
  }

  function floatingGlow(el: RoomElement) {
    if (el.wallIndex === undefined) return null;
    const a = vertices[el.wallIndex], b = vertices[el.wallIndex + 1];
    if (!a || !b) return null;

    return (
      <g key={el.id} onPointerUp={(e) => removeElement(el.id, e)} className="cursor-pointer">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#60A5FA" strokeWidth={strokeW * 4} strokeLinecap="round" opacity={0.2} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#3B82F6" strokeWidth={strokeW * 2} strokeLinecap="round" opacity={0.5} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#93C5FD" strokeWidth={strokeW * 0.8} strokeLinecap="round" opacity={0.9} />
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
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        <circle cx={pos.x} cy={pos.y} r={spotR * 4} fill="transparent" />
        <circle cx={pos.x} cy={pos.y} r={spotR * 2.2} fill={glowColor} opacity={0.6} />
        <circle cx={pos.x} cy={pos.y} r={spotR} fill={fillColor} stroke={strokeColor} strokeWidth={spotR * 0.25} />
        {isClient && (
          <text x={pos.x} y={pos.y + spotR * 3.5} textAnchor="middle" fontSize={labelSize * 0.6} fill="#6B7280">кл.</text>
        )}
      </g>
    );
  }

  function chandelierIcon(el: RoomElement) {
    const pos = getElPos(el);
    const r = chandelierR;
    const isDragging = dragId === el.id && dragStartRef.current?.moved;
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        <circle cx={pos.x} cy={pos.y} r={r * 2} fill="transparent" />
        <circle cx={pos.x} cy={pos.y} r={r * 1.6} fill="#EDE9FE" opacity={0.5} />
        <circle cx={pos.x} cy={pos.y} r={r} fill="none" stroke="#8B5CF6" strokeWidth={spotR * 0.35} />
        <circle cx={pos.x} cy={pos.y} r={spotR * 0.7} fill="#8B5CF6" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line key={angle}
              x1={pos.x + Math.cos(rad) * r * 0.45}
              y1={pos.y + Math.sin(rad) * r * 0.45}
              x2={pos.x + Math.cos(rad) * r * 0.85}
              y2={pos.y + Math.sin(rad) * r * 0.85}
              stroke="#8B5CF6" strokeWidth={spotR * 0.22} strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  }

  // ── Summary badges ──
  const summary: { icon: string; label: string; color: string }[] = [];
  const spots = elements.filter(e => e.type === "spot").length;
  const spotsOursCount = elements.filter(e => e.type === "spot" && e.variant !== "client").length;
  const spotsClientCount = elements.filter(e => e.type === "spot" && e.variant === "client").length;
  const chands = elements.filter(e => e.type === "chandelier").length;
  if (spotsOursCount > 0) summary.push({ icon: "💡", label: `${spotsOursCount} наши`, color: "bg-amber-50 text-amber-700" });
  if (spotsClientCount > 0) summary.push({ icon: "💡", label: `${spotsClientCount} кл.`, color: "bg-gray-100 text-gray-600" });
  if (chands > 0) summary.push({ icon: "🔆", label: `${chands} шт`, color: "bg-purple-50 text-purple-700" });
  for (const type of ["curtain", "subcurtain", "track", "lightline"] as ElementType[]) {
    const items = elements.filter(e => e.type === type);
    if (items.length > 0) {
      const totalLen = items.reduce((s, e) => s + (e.length || 0), 0);
      const cfg = ELEMENTS.find(c => c.type === type)!;
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
    // Canvas (area × price)
    cost += room.area * (p.canvas_320 || 2000);
    // Profile (perimeter × price)
    cost += room.perimeter * (p.profile_plastic || 500);
    // Insert (perimeter)
    cost += room.perimeter * (p.insert || 1000);
    // Corners
    cost += room.walls.length * (p.corner_plastic || 1000);
    // Spots — client's = installation only, ours = with material
    const spotsOurs = elements.filter(e => e.type === "spot" && e.variant !== "client").length;
    const spotsClient = elements.filter(e => e.type === "spot" && e.variant === "client").length;
    cost += spotsOurs * (p.spot_ours || 5000);
    cost += spotsClient * (p.spot_client || 2500);
    // Chandeliers
    cost += chands * ((p.chandelier || 2000) + (p.chandelier_install || 5000));
    // Tracks — client's = installation only (half price), ours = full
    const trackOursM = elements.filter(e => e.type === "track" && e.variant !== "client").reduce((s, e) => s + (e.length || 0), 0) / 100;
    const trackClientM = elements.filter(e => e.type === "track" && e.variant === "client").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += trackOursM * (p.track_magnetic || 27000);
    cost += trackClientM * Math.round((p.track_magnetic || 27000) * 0.4); // only installation
    // Light lines (cm → m)
    const lightM = elements.filter(e => e.type === "lightline").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += lightM * (p.light_line || 15000);
    // Curtain/gardina (cm → m)
    const gardinaM = elements.filter(e => e.type === "curtain").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += gardinaM * (p.gardina_plastic || 5000);
    // Subcurtain/podshtornik (cm → m)
    const podM = elements.filter(e => e.type === "subcurtain").reduce((s, e) => s + (e.length || 0), 0) / 100;
    cost += podM * (p.podshtornik_plastic || 2500);
    // Floating profile (cm → m)
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
    const trackCm = elements.filter(e => e.type === "track").reduce((s, e) => s + (e.length || 0), 0);
    if (trackCm > 0) lines.push(`🔲 Магнитный трек: ${trackCm} см`);
    const lightCm = elements.filter(e => e.type === "lightline").reduce((s, e) => s + (e.length || 0), 0);
    if (lightCm > 0) lines.push(`✨ Световая линия: ${lightCm} см`);
    const gardinaCm = elements.filter(e => e.type === "curtain").reduce((s, e) => s + (e.length || 0), 0);
    if (gardinaCm > 0) lines.push(`📏 Гардина: ${gardinaCm} см`);
    const podCm = elements.filter(e => e.type === "subcurtain").reduce((s, e) => s + (e.length || 0), 0);
    if (podCm > 0) lines.push(`📐 Подшторник: ${podCm} см`);
    if (floatingCount > 0) lines.push(`〰️ Парящий: ${floatingCount} стен`);
    if (liveCost > 0) lines.push(`\n💰 Ориентировочно: ${formatPrice(liveCost)} ₸`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  const activeConfig = activeType ? ELEMENTS.find(e => e.type === activeType) : null;

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
          className="flex items-center gap-1 text-sm font-semibold text-[#1e3a5f] px-1">
          <Check className="h-4 w-4" /> Готово
        </button>
      </div>

      {/* Hint */}
      <div className="shrink-0 px-4 py-1.5 text-center border-b bg-gray-50">
        <p className="text-xs text-muted-foreground">
          {activeConfig
            ? `${activeConfig.icon} ${activeConfig.label}: ${HINTS[activeConfig.category]}`
            : "Выберите элемент из панели внизу ↓"}
        </p>
      </div>

      {/* Interactive SVG */}
      <div className="flex-1 min-h-0 px-2 py-1">
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="w-full h-full"
          onPointerMove={handleSVGPointerMove}
          onPointerUp={handleSVGPointerUp}
          style={{ touchAction: "none" }}
        >
          {/* Room fill */}
          <polygon
            points={vertices.map(v => `${v.x},${v.y}`).join(" ")}
            fill="#F8FAFC" stroke="#94A3B8" strokeWidth={strokeW * 0.6} strokeLinejoin="round"
          />

          {/* Wall dimension labels */}
          {vertices.slice(0, -1).map((a, i) => {
            const b = vertices[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const wLen = Math.sqrt(dx * dx + dy * dy);
            if (wLen === 0) return null;
            const nx = dx / wLen, ny = dy / wLen;
            // Outward normal (opposite to inward)
            const outX = ny, outY = -nx;
            const mx = (a.x + b.x) / 2 + outX * labelSize * 1.8;
            const my = (a.y + b.y) / 2 + outY * labelSize * 1.8;
            return (
              <text key={`dim-${i}`} x={mx} y={my} textAnchor="middle" dominantBaseline="central"
                fontSize={labelSize * 0.75} fill="#94A3B8" fontWeight="500">
                {room.walls[i]}
              </text>
            );
          })}

          {/* Floating elements (rendered first, behind others) */}
          {elements.filter(e => e.type === "floating").map(floatingGlow)}

          {/* Wall elements */}
          {elements.filter(e => e.wallIndex !== undefined && e.type !== "floating").map(wallLine)}

          {/* Spots */}
          {elements.filter(e => e.type === "spot").map(spotCircle)}

          {/* Chandeliers */}
          {elements.filter(e => e.type === "chandelier").map(chandelierIcon)}

          {/* Active type indicator */}
          {activeType && (
            <rect x={vbX} y={vbY} width={vbW} height={vbH}
              fill="none" stroke={activeConfig?.color || "#999"}
              strokeWidth={strokeW * 0.4} strokeDasharray={`${strokeW * 2} ${strokeW}`}
              opacity={0.3} rx={roomSize * 0.02}
            />
          )}
        </svg>
      </div>

      {/* Summary + Cost + Actions */}
      {elements.length > 0 && (
        <div className="shrink-0 border-t bg-white">
          {/* Badges row */}
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
          {/* Live cost + WhatsApp */}
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

      {/* Variant toggle — shows when spot or track is selected */}
      {(activeType === "spot" || activeType === "track") && (
        <div className="shrink-0 px-3 py-1.5 border-t bg-amber-50 flex items-center justify-center gap-2">
          <span className="text-xs text-amber-800 font-medium">
            {activeType === "spot" ? "Софиты:" : "Трек:"}
          </span>
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

      {/* Element toolbar */}
      <div className="shrink-0 border-t bg-gray-50 px-2 py-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {ELEMENTS.map(el => (
            <button
              key={el.type}
              onClick={() => {
                if (activeType === el.type) { setActiveType(null); }
                else { setActiveType(el.type); setActiveVariant("ours"); }
              }}
              className={`flex flex-col items-center min-w-[60px] px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                activeType === el.type
                  ? "bg-[#1e3a5f] text-white shadow-lg scale-105"
                  : "bg-white border border-gray-200 text-gray-600 active:scale-95"
              }`}
            >
              <span className="text-lg leading-none">{el.icon}</span>
              <span className="mt-0.5 whitespace-nowrap text-[10px] font-medium">{el.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Length input modal */}
      {lengthInput && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setLengthInput(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center mb-1">
              {activeConfig?.icon} {activeConfig?.label}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4">
              Стена {(lengthInput.wallIndex + 1)}: {room.walls[lengthInput.wallIndex]} см
            </p>
            <div className="relative">
              <input
                type="number"
                value={lengthValue}
                onChange={e => setLengthValue(e.target.value)}
                className="w-full border-2 border-gray-200 focus:border-[#1e3a5f] rounded-xl px-4 py-3 text-center text-2xl font-bold outline-none transition-colors"
                autoFocus
                inputMode="numeric"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">см</span>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setLengthInput(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium active:bg-gray-50">
                Отмена
              </button>
              <button onClick={confirmLength}
                className="flex-1 rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold active:bg-[#152d4a]">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
