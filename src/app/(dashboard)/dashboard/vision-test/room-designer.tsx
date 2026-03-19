"use client";

import { useState, useRef } from "react";
import { X, Undo2, Check } from "lucide-react";

// ── Types ──

export type ElementType = "spot" | "chandelier" | "curtain" | "subcurtain" | "track" | "lightline" | "floating";

export interface RoomElement {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  wallIndex?: number;
  length?: number; // cm
}

interface Room {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[];
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

function getVertices(walls: number[], normalCorners: boolean[]): Vertex[] {
  const n = walls.length;
  const reflex = new Set<number>();
  normalCorners.forEach((normal, i) => { if (!normal) reflex.add((i + 1) % n); });
  let x = 0, y = 0, dir = 0;
  const vertices: Vertex[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < n; i++) {
    x += DX[dir] * walls[i];
    y += DY[dir] * walls[i];
    vertices.push({ x, y });
    dir = reflex.has((i + 1) % n) ? (dir + 3) % 4 : (dir + 1) % 4;
  }
  return vertices;
}

function nearestWall(px: number, py: number, vertices: Vertex[]): { wallIndex: number; dist: number; wallLength: number } {
  let best = { wallIndex: 0, dist: Infinity, wallLength: 0 };
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
      best = { wallIndex: i, dist, wallLength: Math.sqrt(len2) };
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
  const [lengthInput, setLengthInput] = useState<{ wallIndex: number } | null>(null);
  const [lengthValue, setLengthValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerHandled = useRef(false);
  const dragStartRef = useRef<{ id: string; cx: number; cy: number; moved: boolean } | null>(null);

  const vertices = getVertices(room.walls, room.normalCorners);

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
            // Wall element: snap to nearest wall, keep length
            const nearest = nearestWall(dragPos.x, dragPos.y, vertices);
            setElements(prev => prev.map(e =>
              e.id === ds.id ? { ...e, wallIndex: nearest.wallIndex } : e
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
      setElements(prev => [...prev, {
        id: crypto.randomUUID(),
        type: activeType,
        x: coords.x,
        y: coords.y,
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
    setElements(prev => [...prev, {
      id: crypto.randomUUID(),
      type: activeType,
      wallIndex: lengthInput.wallIndex,
      length: len,
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
    const startT = (wallLen - elLen) / 2;
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

    if (isDragging && dragPos) {
      const nearest = nearestWall(dragPos.x, dragPos.y, vertices);
      const da = vertices[nearest.wallIndex], db = vertices[nearest.wallIndex + 1];
      if (da && db) {
        const ddx = db.x - da.x, ddy = db.y - da.y;
        const dwLen = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dwLen > 0) {
          const dnx = ddx / dwLen, dny = ddy / dwLen;
          drawPerpX = -dny; drawPerpY = dnx;
          const dElLen = Math.min(el.length!, dwLen);
          const dStartT = (dwLen - dElLen) / 2;
          drawX1 = da.x + dnx * dStartT + drawPerpX * offset;
          drawY1 = da.y + dny * dStartT + drawPerpY * offset;
          drawX2 = da.x + dnx * (dStartT + dElLen) + drawPerpX * offset;
          drawY2 = da.y + dny * (dStartT + dElLen) + drawPerpY * offset;
          drawMidX = (drawX1 + drawX2) / 2;
          drawMidY = (drawY1 + drawY2) / 2;
        }
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
    return (
      <g key={el.id}
        onPointerDown={(e) => handleElementPointerDown(el.id, e)}
        className="cursor-grab active:cursor-grabbing"
        opacity={isDragging ? 0.7 : 1}
      >
        {/* Larger invisible hit area for easier grab */}
        <circle cx={pos.x} cy={pos.y} r={spotR * 4} fill="transparent" />
        <circle cx={pos.x} cy={pos.y} r={spotR * 2.2} fill="#FEF3C7" opacity={0.6} />
        <circle cx={pos.x} cy={pos.y} r={spotR} fill="#F59E0B" stroke="#D97706" strokeWidth={spotR * 0.25} />
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
  const chands = elements.filter(e => e.type === "chandelier").length;
  if (spots > 0) summary.push({ icon: "💡", label: `${spots} шт`, color: "bg-amber-50 text-amber-700" });
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
  if (floatingCount > 0) summary.push({ icon: "〰️", label: `${floatingCount} стен`, color: "bg-blue-50 text-blue-700" });

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

      {/* Summary + Undo */}
      {elements.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 flex items-center justify-between border-t bg-white">
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
      )}

      {/* Element toolbar */}
      <div className="shrink-0 border-t bg-gray-50 px-2 py-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {ELEMENTS.map(el => (
            <button
              key={el.type}
              onClick={() => setActiveType(activeType === el.type ? null : el.type)}
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
