"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, X, Camera, Loader2, Upload, History, ChevronRight, ImageIcon } from "lucide-react";
import { PinchZoom } from "@/components/ui/pinch-zoom";
import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";
import type { MultiAgentResult } from "@/lib/vision-agents";
import RoomDesigner from "./room-designer";
import type { RoomElement } from "./room-designer";

// ─────────────────────────────────────────────────────
// Geometry (supports arbitrary angles)
// ─────────────────────────────────────────────────────

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

/** Check if all angles are ±90° (legacy rectilinear mode) */
function isRectilinearAngles(angles: number[]): boolean {
  return angles.every(a => a === 90 || a === -90);
}

/** Area of a circular segment given chord length and bulge (sagitta) in cm.
 *  Positive = adds area (outward), negative = subtracts (inward). */
function arcSegmentArea(chordLen: number, bulge: number): number {
  if (!bulge || bulge === 0) return 0;
  const h = Math.abs(bulge);
  const c = chordLen;
  // radius from chord and sagitta: r = (c²/4 + h²) / (2h)
  const r = (c * c / 4 + h * h) / (2 * h);
  // angle: θ = 2 * asin(c / (2r))
  const theta = 2 * Math.asin(Math.min(c / (2 * r), 1));
  // segment area = r²/2 * (θ - sin(θ))
  const segArea = (r * r / 2) * (theta - Math.sin(theta));
  return bulge > 0 ? segArea : -segArea;
}

/** Area of a column in cm² */
function columnArea(col: RoomColumn): number {
  if (col.type === "circle") {
    const r = (col.diameter || 0) / 2;
    return Math.PI * r * r;
  }
  return (col.width || 0) * (col.height || 0);
}

function calcWithTurns(
  lengths: number[],
  angles: number[],
  arcBulges?: number[],
  columns?: RoomColumn[],
  cutoutsArr?: RoomCutout[]
): { area: number; perimeter: number } {
  const n = lengths.length;
  if (n < 3) return { area: 0, perimeter: 0 };

  // Perimeter: for arcs, use arc length instead of chord
  let perimeterCm = 0;
  for (let i = 0; i < n; i++) {
    const bulge = arcBulges?.[i] || 0;
    if (bulge !== 0) {
      const h = Math.abs(bulge), c = lengths[i];
      const r = (c * c / 4 + h * h) / (2 * h);
      const theta = 2 * Math.asin(Math.min(c / (2 * r), 1));
      perimeterCm += r * theta; // arc length
    } else {
      perimeterCm += lengths[i];
    }
  }
  const perimeter = Math.round(perimeterCm) / 100;

  const v: { x: number; y: number }[] = [];

  if (isRectilinearAngles(angles) && !arcBulges?.some(b => b !== 0)) {
    // Fast path: exact integer math for 90° rooms
    let x = 0, y = 0, dir = 0;
    for (let i = 0; i < n; i++) {
      v.push({ x, y });
      x += DX[dir] * lengths[i];
      y += DY[dir] * lengths[i];
      dir = angles[i] > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
    // Shoelace handles small gaps fine — always compute area
  } else {
    // Trig path: arbitrary angles
    let x = 0, y = 0, dirRad = 0;
    for (let i = 0; i < n; i++) {
      v.push({ x, y });
      x += Math.cos(dirRad) * lengths[i];
      y += Math.sin(dirRad) * lengths[i];
      dirRad += angles[i] * Math.PI / 180;
    }
  }

  // Base polygon area (Shoelace)
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += v[i].x * v[j].y - v[j].x * v[i].y;
  }
  let areaCm2 = Math.abs(sum) / 2;

  // Add/subtract arc segments
  if (arcBulges) {
    for (let i = 0; i < n; i++) {
      areaCm2 += arcSegmentArea(lengths[i], arcBulges[i] || 0);
    }
  }

  // Subtract columns
  if (columns) {
    for (const col of columns) {
      areaCm2 -= columnArea(col);
    }
  }

  // Subtract cutouts
  if (cutoutsArr) {
    for (const cut of cutoutsArr) {
      areaCm2 -= cut.width * cut.height;
    }
  }

  return { area: Math.round(Math.max(areaCm2, 0) / 100) / 100, perimeter };
}

// ─────────────────────────────────────────────────────
// SVG Preview
// ─────────────────────────────────────────────────────

interface Vertex { x: number; y: number }

function buildVertices(walls: { length: string; angle: number }[]): {
  vertices: Vertex[];
  closed: boolean;
  gapX: number;
  gapY: number;
} {
  const n = walls.length;
  const allRectilinear = walls.every(w => w.angle === 90 || w.angle === -90);
  const vertices: Vertex[] = [{ x: 0, y: 0 }];

  if (allRectilinear) {
    // Fast path: exact integer math for 90° rooms
    let x = 0, y = 0, dir = 0;
    for (let i = 0; i < n; i++) {
      const len = parseFloat(walls[i].length);
      if (!len || len <= 0) break;
      x += DX[dir] * len;
      y += DY[dir] * len;
      vertices.push({ x, y });
      dir = walls[i].angle > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
    const closed = vertices.length === n + 1 && Math.abs(x) < 2 && Math.abs(y) < 2;
    return { vertices, closed, gapX: x, gapY: y };
  }

  // Trig path: arbitrary angles
  let x = 0, y = 0, dirRad = 0;
  for (let i = 0; i < n; i++) {
    const len = parseFloat(walls[i].length);
    if (!len || len <= 0) break;
    x += Math.cos(dirRad) * len;
    y += Math.sin(dirRad) * len;
    vertices.push({ x, y });
    dirRad += walls[i].angle * Math.PI / 180;
  }
  const closed = vertices.length === n + 1 && Math.abs(x) < 2 && Math.abs(y) < 2;
  return { vertices, closed, gapX: x, gapY: y };
}

function RoomPreview({
  walls,
  committedCount,
  nextDirDeg,
  onWallClick,
  onCornerClick,
  activeWallIdx,
  forceClose,
  roomColumns,
  roomCutouts,
}: {
  walls: { length: string; angle: number; bulge?: number; cornerRadius?: number }[];
  committedCount?: number;
  nextDirDeg?: number;
  onWallClick?: (i: number) => void;
  onCornerClick?: (i: number) => void;
  activeWallIdx?: number;
  forceClose?: boolean;
  roomColumns?: RoomColumn[];
  roomCutouts?: RoomCutout[];
}) {
  const { vertices, closed: _closed } = buildVertices(walls);
  const closed = _closed || !!forceClose;
  const committed = committedCount ?? walls.length;

  if (vertices.length < 2) {
    return (
      <div className="w-full h-full rounded-xl border bg-gray-50 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Введите первую стену</p>
      </div>
    );
  }

  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = maxX - minX || 1, H = maxY - minY || 1;
  const PAD = 40, SVG_W = 400, SVG_H = 400;
  const scale = Math.min((SVG_W - PAD * 2) / W, (SVG_H - PAD * 2) / H);
  const sx = (x: number) => PAD + (x - minX) * scale;
  const sy = (y: number) => PAD + (y - minY) * scale;

  return (
    <div className="w-full h-full rounded-xl border bg-gray-50 overflow-hidden">
      <svg width="100%" height="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
        {/* Closing fill when done */}
        {closed && (
          <polygon
            points={vertices.map(v => `${sx(v.x)},${sy(v.y)}`).join(" ")}
            fill="#1e3a5f28" stroke="none"
          />
        )}

        {/* Wall segments (lines or arcs) */}
        {vertices.slice(0, -1).map((v, i) => {
          const next = vertices[i + 1];
          const isCommitted = i < committed;
          const isCurrent = i === committed;
          const isActive = activeWallIdx === i;
          const color = isActive ? "#f59e0b" : closed ? "#1e3a5f" : isCommitted ? "#1e3a5f" : isCurrent ? "#f59e0b" : "#94a3b8";
          const sw = isActive ? 5 : isCurrent ? 5 : isCommitted || closed ? 2.5 : 1.5;
          const dash = (!isCommitted && !isCurrent && !closed) ? "5,3" : undefined;
          const bulge = walls[i]?.bulge || 0;

          // SVG arc for curved walls
          if (bulge !== 0) {
            const p1x = sx(v.x), p1y = sy(v.y), p2x = sx(next.x), p2y = sy(next.y);
            const chordLen = Math.sqrt((next.x - v.x) ** 2 + (next.y - v.y) ** 2);
            const h = Math.abs(bulge);
            const r = ((chordLen * chordLen / 4) + h * h) / (2 * h) * scale;
            const sweep = bulge > 0 ? 1 : 0;
            const arcPath = `M ${p1x} ${p1y} A ${r} ${r} 0 0 ${sweep} ${p2x} ${p2y}`;
            return (
              <g key={i}>
                <path d={arcPath} fill="none" stroke={bulge !== 0 ? "#3b82f6" : color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />
                {onWallClick && (
                  <path d={arcPath} fill="none" stroke="transparent" strokeWidth={24}
                    style={{ cursor: "pointer" }} onClick={() => onWallClick(i)} />
                )}
              </g>
            );
          }

          return (
            <g key={i}>
              <line
                x1={sx(v.x)} y1={sy(v.y)} x2={sx(next.x)} y2={sy(next.y)}
                stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round"
              />
              {onWallClick && (
                <line
                  x1={sx(v.x)} y1={sy(v.y)} x2={sx(next.x)} y2={sy(next.y)}
                  stroke="transparent" strokeWidth={24} strokeLinecap="round"
                  style={{ cursor: "pointer" }} onClick={() => onWallClick(i)}
                />
              )}
            </g>
          );
        })}

        {/* Wall length labels */}
        {vertices.slice(0, -1).map((v, i) => {
          const next = vertices[i + 1];
          const mx = sx((v.x + next.x) / 2);
          const my = sy((v.y + next.y) / 2);
          const len = parseFloat(walls[i]?.length) || 0;
          const isCurrent = i === committed;
          const isActive = activeWallIdx === i;

          // Pixel length of wall segment
          const pdx = sx(next.x) - sx(v.x);
          const pdy = sy(next.y) - sy(v.y);
          const pixelLen = Math.sqrt(pdx * pdx + pdy * pdy);

          // Outward offset for short walls (< 50px)
          const plen = pixelLen || 1;
          const pnx = pdy / plen;
          const pny = -pdx / plen;
          const labelOffset = pixelLen < 50 ? 24 : 0;
          const lx = mx + pnx * labelOffset;
          const ly = my + pny * labelOffset;

          // Dynamic label width
          const text = len > 0 ? String(len) : "?";
          const textW = text.length * 10 + 14;

          return (
            <g key={i}>
              {labelOffset > 0 && (
                <line x1={mx} y1={my} x2={lx} y2={ly}
                  stroke="#94a3b8" strokeWidth={0.7} strokeDasharray="2,2" />
              )}
              <rect x={lx - textW / 2} y={ly - 12} width={textW} height={24} rx={5}
                fill={isCurrent ? "#fef3c7" : isActive ? "#fff7ed" : "white"}
                stroke={isCurrent ? "#f59e0b" : isActive ? "#f97316" : "#cbd5e1"} strokeWidth={1} />
              <text x={lx} y={ly + 1} textAnchor="middle" dominantBaseline="central"
                fontSize={14} fontFamily="system-ui, -apple-system, sans-serif"
                fill={closed ? "#1e3a5f" : isCurrent ? "#92400e" : "#1e293b"} fontWeight="700">
                {text}
              </text>
            </g>
          );
        })}


        {/* Direction stub — always yellow, grows when user types */}
        {nextDirDeg !== undefined && !closed && (() => {
          const lastV = vertices[vertices.length - 1];
          const stubLen = 28 / scale;
          const dirRad = nextDirDeg * Math.PI / 180;
          const gx = lastV.x + Math.cos(dirRad) * stubLen;
          const gy = lastV.y + Math.sin(dirRad) * stubLen;
          return (
            <g>
              <line x1={sx(lastV.x)} y1={sy(lastV.y)} x2={sx(gx)} y2={sy(gy)}
                stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" strokeDasharray="6,3" />
              <circle cx={sx(gx)} cy={sy(gy)} r={5} fill="#f59e0b" />
            </g>
          );
        })()}

        {/* Columns */}
        {roomColumns?.map(col => {
          const cx = sx(col.x), cy = sy(col.y);
          if (col.type === "circle") {
            const r = ((col.diameter || 0) / 2) * scale;
            return <circle key={col.id} cx={cx} cy={cy} r={r} fill="#ef444440" stroke="#ef4444" strokeWidth={1.5} />;
          }
          const w = (col.width || 0) * scale, h = (col.height || 0) * scale;
          return <rect key={col.id} x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="#ef444440" stroke="#ef4444" strokeWidth={1.5} />;
        })}

        {/* Cutouts — rectangular holes with diagonals from room corners */}
        {closed && roomCutouts?.map(cut => {
          // Cutout position relative to first vertex (origin)
          const v0 = vertices[0];
          // For rectilinear rooms: x = along first wall direction, y = perpendicular (down)
          const cx1 = v0.x + cut.fromWallA;
          const cy1 = v0.y + cut.fromWallB;
          const cx2 = cx1 + cut.width;
          const cy2 = cy1 + cut.height;
          // Cutout corners
          const cutCorners = [
            { x: cx1, y: cy1 }, { x: cx2, y: cy1 },
            { x: cx2, y: cy2 }, { x: cx1, y: cy2 },
          ];
          // Room corners (all vertices except last duplicate)
          const roomCorners = vertices.slice(0, -1);
          return (
            <g key={cut.id}>
              {/* Cutout rectangle */}
              <rect
                x={sx(cx1)} y={sy(cy1)}
                width={(cx2 - cx1) * scale} height={(cy2 - cy1) * scale}
                fill="#ef444420" stroke="#ef4444" strokeWidth={2} strokeDasharray="6,3"
              />
              {/* Diagonals from room corners to cutout corners */}
              {roomCorners.map((rc, ri) => {
                // Find nearest cutout corner for this room corner
                let nearest = cutCorners[0], minDist = Infinity;
                for (const cc of cutCorners) {
                  const d = Math.hypot(rc.x - cc.x, rc.y - cc.y);
                  if (d < minDist) { minDist = d; nearest = cc; }
                }
                const diagLen = Math.round(minDist);
                if (diagLen < 5) return null;
                const mx = (sx(rc.x) + sx(nearest.x)) / 2;
                const my = (sy(rc.y) + sy(nearest.y)) / 2;
                return (
                  <g key={`diag-${ri}`}>
                    <line
                      x1={sx(rc.x)} y1={sy(rc.y)} x2={sx(nearest.x)} y2={sy(nearest.y)}
                      stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}
                    />
                    <rect x={mx - 14} y={my - 8} width={28} height={14} rx={3}
                      fill="white" fillOpacity={0.9} />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize={8} fontFamily="monospace"
                      fill="#ef4444" fontWeight="600">
                      {diagLen}
                    </text>
                  </g>
                );
              })}
              {/* Cutout dimension labels */}
              <text x={(sx(cx1) + sx(cx2)) / 2} y={sy(cy1) - 5} textAnchor="middle" fontSize={9} fill="#ef4444" fontWeight="600">
                {cut.width}
              </text>
              <text x={sx(cx2) + 5} y={(sy(cy1) + sy(cy2)) / 2 + 3} textAnchor="start" fontSize={9} fill="#ef4444" fontWeight="600">
                {cut.height}
              </text>
            </g>
          );
        })}

        {/* Rounded corner arcs — visual arc where corner is rounded */}
        {closed && vertices.slice(0, -1).map((v, i) => {
          const wallData = walls[i];
          const cr = wallData?.cornerRadius;
          if (!cr || cr <= 0) return null;
          const n = vertices.length - 1; // number of walls
          const prevIdx = (i - 1 + n) % n;
          const prev = vertices[prevIdx];
          const next = vertices[(i + 1) % n];
          // Directions from vertex to neighbors
          const toPrevX = prev.x - v.x, toPrevY = prev.y - v.y;
          const toNextX = next.x - v.x, toNextY = next.y - v.y;
          const toPrevLen = Math.hypot(toPrevX, toPrevY) || 1;
          const toNextLen = Math.hypot(toNextX, toNextY) || 1;
          // Arc points: offset along each wall direction by cornerRadius (in cm)
          const offset = Math.min(cr, toPrevLen / 2, toNextLen / 2);
          const ax = v.x + (toPrevX / toPrevLen) * offset;
          const ay = v.y + (toPrevY / toPrevLen) * offset;
          const bx = v.x + (toNextX / toNextLen) * offset;
          const by = v.y + (toNextY / toNextLen) * offset;
          const arcPath = `M ${sx(ax)} ${sy(ay)} Q ${sx(v.x)} ${sy(v.y)} ${sx(bx)} ${sy(by)}`;
          return (
            <path key={`rc-${i}`} d={arcPath} fill="none" stroke="#10b981" strokeWidth={3} strokeLinecap="round" />
          );
        })}

        {/* Vertices dots — tappable for rounded corners */}
        {vertices.map((v, i) => {
          const wallData = walls[i];
          const isRounded = !!wallData?.cornerRadius && wallData.cornerRadius > 0;
          const canTap = onCornerClick && closed && i < vertices.length - 1;
          const fill = isRounded ? "#10b981" : i === 0 ? "#1e3a5f" : closed ? "#1e3a5f" : i <= committed ? "#1e3a5f" : "#94a3b8";
          return (
            <g key={i}>
              {/* Invisible hit area for tapping */}
              {canTap && (
                <circle cx={sx(v.x)} cy={sy(v.y)} r={18} fill="transparent"
                  style={{ cursor: "pointer" }} onClick={() => onCornerClick(i)} />
              )}
              <circle cx={sx(v.x)} cy={sy(v.y)} r={isRounded ? 6 : (i === 0 ? 5 : 3)}
                fill={fill} stroke={isRounded ? "#10b981" : "none"} strokeWidth={isRounded ? 2 : 0} />
              {/* Small "◠" label for rounded */}
              {isRounded && (
                <text x={sx(v.x)} y={sx(v.y) ? sy(v.y) - 10 : 0} textAnchor="middle" fontSize={10} fill="#10b981" fontWeight="700">◠</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface RoomColumn {
  id: string;
  type: "circle" | "rect";
  x: number;         // position in cm from room origin (for SVG placement)
  y: number;
  diameter?: number;  // cm, for circle
  width?: number;     // cm, for rect
  height?: number;    // cm, for rect
}

/** Internal cutout — rectangular hole in the ceiling for factory cutting.
 *  Diagonals from room corners to cutout corners are shown for measurement. */
interface RoomCutout {
  id: string;
  // Position: distance from first vertex along first wall (x) and perpendicular (y)
  fromWallA: number; // cm — distance from left wall
  fromWallB: number; // cm — distance from top wall
  width: number;     // cm
  height: number;    // cm
}

interface Room {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[]; // legacy compat
  angles: number[];         // turn angles in degrees (+90, -90, or any custom)
  arcBulges?: number[];     // bulge per wall (cm). 0 = straight, >0 = outward arc, <0 = inward arc
  columns?: RoomColumn[];   // columns/pillars inside room (area subtracted)
  cutouts?: RoomCutout[];   // internal rectangular cutouts (area subtracted)
  area: number;
  perimeter: number;
  elements?: RoomElement[];
  photoUrls?: string[];     // Фото потолка комнаты
}

interface SavedObject {
  id: string;
  address: string;
  rooms: Room[];
  totalArea: number;
  savedAt: number; // kept for localStorage compat
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────
// Wall Wizard — full-screen numpad
// ─────────────────────────────────────────────────────

function WallWizard({ onDone, onCancel }: {
  onDone: (room: Room) => void;
  onCancel: () => void;
}) {
  const [committed, setCommitted] = useState<{ length: number; angle: number; bulge: number; cornerRadius: number }[]>([]);
  const [input, setInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const [showAngleInput, setShowAngleInput] = useState(false);
  const [arcWallIdx, setArcWallIdx] = useState<number | null>(null);
  const [showShapeEdit, setShowShapeEdit] = useState(false);
  const [columns, setColumns] = useState<RoomColumn[]>([]);
  const [showColumnInput, setShowColumnInput] = useState(false);
  const [columnType, setColumnType] = useState<"circle" | "rect">("circle");
  const [columnSize, setColumnSize] = useState("");
  const [cutouts, setCutouts] = useState<RoomCutout[]>([]);
  const [showCutoutInput, setShowCutoutInput] = useState(false);
  const [cutoutForm, setCutoutForm] = useState({ fromWallA: "", fromWallB: "", width: "", height: "" });

  const previewWalls = [
    ...committed.map(w => ({ length: String(w.length), angle: w.angle, bulge: w.bulge, cornerRadius: w.cornerRadius })),
    ...(input ? [{ length: input, angle: 90, bulge: 0, cornerRadius: 0 }] : []),
  ];

  const committedPreview = committed.map(w => ({ length: String(w.length), angle: w.angle }));
  const { closed: isDone, vertices: committedVerts, gapX, gapY } = buildVertices(committedPreview);
  const gap = Math.sqrt(gapX * gapX + gapY * gapY);

  const bulges = committed.map(w => w.bulge);
  const hasBulges = bulges.some(b => b !== 0);
  const hasColumns = columns.length > 0;
  const hasCutouts = cutouts.length > 0;

  const doneResult = isDone && committed.length >= 3
    ? calcWithTurns(
        committed.map(w => w.length),
        committed.map(w => w.angle),
        hasBulges ? bulges : undefined,
        hasColumns ? columns : undefined,
        hasCutouts ? cutouts : undefined,
      )
    : null;
  const isValid = !!doneResult && doneResult.area > 0;

  const gapParts: string[] = [];
  if (committed.length >= 4 && !isDone && gap >= 5) {
    if (Math.abs(gapX) > 2) gapParts.push(`${Math.abs(Math.round(gapX))} см ${gapX > 0 ? "влево" : "вправо"}`);
    if (Math.abs(gapY) > 2) gapParts.push(`${Math.abs(Math.round(gapY))} см ${gapY > 0 ? "вверх" : "вниз"}`);
  }

  // Direction tracking
  const currentDirDeg = committed.reduce((dir, w) => dir + w.angle, 0);
  const lastAngle = committed.length > 0 ? committed[committed.length - 1].angle : 90;
  const lastIsCustomAngle = lastAngle !== 90 && lastAngle !== -90;

  function digit(d: string) {
    if (isValid) return;
    setInput(p => p.length < 5 ? p + d : p);
  }

  function confirm() {
    const len = parseFloat(input);
    if (!len || len <= 0) return;
    setCommitted(prev => [...prev, { length: len, angle: 90, bulge: 0, cornerRadius: 0 }]);
    setInput("");
  }

  // Set custom angle on last committed wall
  function setLastAngle(angle: number) {
    if (committed.length === 0 || isValid) return;
    setCommitted(prev => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, angle }];
    });
  }

  // Add a column
  function addColumn() {
    const size = parseFloat(columnSize);
    if (!size || size <= 0) return;
    const col: RoomColumn = {
      id: crypto.randomUUID(),
      type: columnType,
      x: 0, y: 0, // position set later via SVG tap
      ...(columnType === "circle" ? { diameter: size } : { width: size, height: size }),
    };
    setColumns(prev => [...prev, col]);
    setColumnSize("");
    setShowColumnInput(false);
  }

  function removeColumn(id: string) {
    setColumns(prev => prev.filter(c => c.id !== id));
  }

  // Total column area for display
  const totalColumnArea = columns.reduce((sum, c) => sum + columnArea(c), 0);

  function handleBack() {
    if (input) {
      setInput(p => p.slice(0, -1));
    } else if (committed.length > 0) {
      setCommitted(prev => prev.slice(0, -1));
    }
  }

  function buildRoom(area: number, perimeter: number): Room {
    return {
      id: crypto.randomUUID(),
      name: roomName,
      walls: committed.map(w => w.length),
      normalCorners: committed.map(w => w.angle >= 0),
      angles: committed.map(w => w.angle),
      ...(hasBulges ? { arcBulges: bulges } : {}),
      ...(hasColumns ? { columns } : {}),
      ...(hasCutouts ? { cutouts } : {}),
      area,
      perimeter,
    };
  }

  function handleForceFinish() {
    if (committed.length < 4) return;
    let sum = 0;
    for (let i = 0; i < committedVerts.length; i++) {
      const j = (i + 1) % committedVerts.length;
      sum += committedVerts[i].x * committedVerts[j].y - committedVerts[j].x * committedVerts[i].y;
    }
    let areaCm2 = Math.abs(sum) / 2;
    if (hasBulges) bulges.forEach((b, i) => { areaCm2 += arcSegmentArea(committed[i].length, b); });
    if (hasColumns) columns.forEach(c => { areaCm2 -= columnArea(c); });
    if (hasCutouts) cutouts.forEach(c => { areaCm2 -= c.width * c.height; });
    const area = Math.round(Math.max(areaCm2, 0) / 100) / 100;
    const perimeter = Math.round(committed.reduce((s, w) => s + w.length, 0)) / 100;
    if (area <= 0) return;
    onDone(buildRoom(area, perimeter));
  }

  function handleAdd() {
    if (!doneResult) return;
    onDone(buildRoom(doneResult.area, doneResult.perimeter));
  }

  const headerText = isValid ? "✓ Готово" : `Стена ${committed.length + 1}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div
        className="bg-white flex flex-col overflow-hidden w-full sm:max-w-sm sm:rounded-2xl sm:shadow-2xl"
        style={{ height: "100dvh", maxHeight: "100dvh", paddingBottom: "env(safe-area-inset-bottom)", touchAction: "manipulation" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button onClick={onCancel} className="p-1 -ml-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">{headerText}</span>
          <button
            onClick={() => {
              // Always allow going back if there are committed walls
              if (input) setInput(p => p.slice(0, -1));
              else if (committed.length > 0) {
                setCommitted(prev => prev.slice(0, -1));
                setShowAngleInput(false);
                setShowColumnInput(false);
              }
            }}
            disabled={committed.length === 0 && !input}
            className="text-xs text-muted-foreground disabled:opacity-30 px-2 py-1 active:bg-gray-100 rounded"
          >
            ← Назад
          </button>
        </div>

        {isValid && doneResult ? (
          /* ── Done: всё скроллится ── */
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Room preview */}
            <div className="px-3 pt-2 pb-2" style={{ height: "36svh" }}>
              <PinchZoom className="w-full h-full">
                <RoomPreview
                  walls={previewWalls}
                  committedCount={committed.length}
                  nextDirDeg={undefined}
                  forceClose={false}
                  roomColumns={columns.length > 0 ? columns : undefined}
                  roomCutouts={cutouts.length > 0 ? cutouts : undefined}
                  onCornerClick={(i) => {
                    setCommitted(prev => prev.map((wall, idx) =>
                      idx === i ? { ...wall, cornerRadius: wall.cornerRadius > 0 ? 0 : 15 } : wall
                    ));
                  }}
                />
              </PinchZoom>
            </div>
            {/* Results + modifications */}
            <div className="p-4 pb-20 space-y-3 border-t">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 p-4 text-center">
                <div className="text-4xl font-bold text-blue-600">{doneResult.area}</div>
                <div className="text-xs text-muted-foreground mt-1">м² площадь</div>
              </div>
              <div className="rounded-xl bg-purple-50 p-4 text-center">
                <div className="text-4xl font-bold text-purple-600">{doneResult.perimeter}</div>
                <div className="text-xs text-muted-foreground mt-1">м периметр</div>
              </div>
            </div>
            <input
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Название: зал, спальня, кухня..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
            />

            {/* ── Rounded corners hint + radius slider ── */}
            {committed.some(w => w.cornerRadius > 0) && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-green-700">
                    Скруглено: {committed.filter(w => w.cornerRadius > 0).length} угл.
                  </span>
                  <button
                    onClick={() => setCommitted(prev => prev.map(w => ({ ...w, cornerRadius: 0 })))}
                    className="text-[10px] text-red-400 active:text-red-600"
                  >
                    Убрать все
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-green-600 font-medium">R:</span>
                  <input type="range" min={5} max={50} step={5}
                    value={committed.find(w => w.cornerRadius > 0)?.cornerRadius || 15}
                    onChange={e => setCommitted(prev => prev.map(w => w.cornerRadius > 0 ? { ...w, cornerRadius: parseInt(e.target.value) } : w))}
                    className="flex-1 h-1 accent-green-500" />
                  <span className="text-xs text-green-700 font-bold w-10 text-right">{committed.find(w => w.cornerRadius > 0)?.cornerRadius || 15} см</span>
                </div>
              </div>
            )}
            {!committed.some(w => w.cornerRadius > 0) && (
              <p className="text-[10px] text-center text-gray-400">
                Тапните на угол на чертеже чтобы скруглить
              </p>
            )}

            {/* ── Optional: arcs & columns (collapsed) ── */}
            {!showShapeEdit ? (
              <button onClick={() => setShowShapeEdit(true)}
                className="w-full text-xs py-2 text-gray-400 active:text-gray-600">
                Дуги, колонны, вырезы ▼
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Дуги, колонны, вырезы</span>
                  <button onClick={() => setShowShapeEdit(false)} className="text-xs text-gray-400">Скрыть ▲</button>
                </div>

                {/* Arc walls */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Дуга на стене:</p>
                  <div className="flex flex-wrap gap-1">
                    {committed.map((w, i) => (
                      <button key={i} onClick={() => setArcWallIdx(arcWallIdx === i ? null : i)}
                        className={`text-[11px] py-1 px-2.5 rounded-full border active:scale-95 ${
                          w.bulge !== 0 ? "bg-blue-100 border-blue-400 text-blue-700" :
                          arcWallIdx === i ? "bg-gray-100 border-gray-300" : "border-gray-200 text-gray-400"
                        }`}>
                        {i + 1} {w.bulge !== 0 ? "~" : ""}
                      </button>
                    ))}
                  </div>
                  {arcWallIdx !== null && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">-</span>
                      <input type="range" min={-60} max={60} step={5}
                        value={committed[arcWallIdx].bulge}
                        onChange={e => setCommitted(prev => prev.map((w, i) => i === arcWallIdx ? { ...w, bulge: parseInt(e.target.value) } : w))}
                        className="flex-1 h-1 accent-blue-500" />
                      <span className="text-[10px] text-gray-400">+</span>
                      <span className="text-[10px] text-blue-600 font-bold w-8">{committed[arcWallIdx].bulge}</span>
                    </div>
                  )}
                </div>

                {/* Columns */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Колонны:</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setColumns(prev => [...prev, { id: crypto.randomUUID(), type: "circle", x: 0, y: 0, diameter: 30 }]); }}
                      className="text-[11px] py-1 px-3 rounded-full border border-gray-200 text-gray-500 active:scale-95">+ Круглая</button>
                    <button onClick={() => { setColumns(prev => [...prev, { id: crypto.randomUUID(), type: "rect", x: 0, y: 0, width: 30, height: 30 }]); }}
                      className="text-[11px] py-1 px-3 rounded-full border border-gray-200 text-gray-500 active:scale-95">+ Квадратная</button>
                  </div>
                  {columns.map(col => (
                    <div key={col.id} className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-gray-500">{col.type === "circle" ? `⌀${col.diameter}см` : `${col.width}x${col.height}см`}</span>
                      <button onClick={() => removeColumn(col.id)} className="text-red-400 px-1">x</button>
                    </div>
                  ))}
                </div>

                {/* Cutouts (вырезы) */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Вырез внутри (для цеха):</p>
                  {!showCutoutInput ? (
                    <button
                      onClick={() => setShowCutoutInput(true)}
                      className="text-[11px] py-1 px-3 rounded-full border border-gray-200 text-gray-500 active:scale-95"
                    >
                      + Добавить вырез
                    </button>
                  ) : (
                    <div className="space-y-1.5 mt-1">
                      <div className="grid grid-cols-2 gap-1.5">
                        <input type="number" inputMode="numeric" placeholder="От стены A (см)"
                          value={cutoutForm.fromWallA} onChange={e => setCutoutForm(f => ({ ...f, fromWallA: e.target.value }))}
                          className="border rounded-lg px-2 py-1.5 text-[11px]" />
                        <input type="number" inputMode="numeric" placeholder="От стены B (см)"
                          value={cutoutForm.fromWallB} onChange={e => setCutoutForm(f => ({ ...f, fromWallB: e.target.value }))}
                          className="border rounded-lg px-2 py-1.5 text-[11px]" />
                        <input type="number" inputMode="numeric" placeholder="Ширина (см)"
                          value={cutoutForm.width} onChange={e => setCutoutForm(f => ({ ...f, width: e.target.value }))}
                          className="border rounded-lg px-2 py-1.5 text-[11px]" />
                        <input type="number" inputMode="numeric" placeholder="Высота (см)"
                          value={cutoutForm.height} onChange={e => setCutoutForm(f => ({ ...f, height: e.target.value }))}
                          className="border rounded-lg px-2 py-1.5 text-[11px]" />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setShowCutoutInput(false)}
                          className="flex-1 text-[11px] py-1.5 rounded-lg border text-gray-500 active:bg-gray-50">Отмена</button>
                        <button onClick={() => {
                          const a = parseFloat(cutoutForm.fromWallA);
                          const b = parseFloat(cutoutForm.fromWallB);
                          const w = parseFloat(cutoutForm.width);
                          const h = parseFloat(cutoutForm.height);
                          if (!w || !h || w <= 0 || h <= 0) return;
                          setCutouts(prev => [...prev, {
                            id: crypto.randomUUID(),
                            fromWallA: a || 0,
                            fromWallB: b || 0,
                            width: w,
                            height: h,
                          }]);
                          setCutoutForm({ fromWallA: "", fromWallB: "", width: "", height: "" });
                          setShowCutoutInput(false);
                        }}
                          className="flex-1 text-[11px] py-1.5 rounded-lg bg-[#1e3a5f] text-white font-medium active:opacity-80">Добавить</button>
                      </div>
                    </div>
                  )}
                  {cutouts.map(cut => (
                    <div key={cut.id} className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-gray-500">
                        {cut.width}x{cut.height}см (от стен: {cut.fromWallA}, {cut.fromWallB})
                      </span>
                      <button onClick={() => setCutouts(prev => prev.filter(c => c.id !== cut.id))} className="text-red-400 px-1">x</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleAdd}
              className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 bg-[#1e3a5f]">
              Добавить помещение
            </button>
          </div>
          </div>

        ) : (
          /* ── Numpad ── */
          <>
          {/* Превью комнаты — заполняет всё свободное место */}
          <div className="flex-1 min-h-0 px-3 pt-2 pb-2">
            <PinchZoom className="w-full h-full">
              <RoomPreview
                walls={previewWalls}
                committedCount={committed.length}
                nextDirDeg={currentDirDeg}
                forceClose={false}
              />
            </PinchZoom>
          </div>
          <div className="shrink-0 border-t">
            {/* Direction controls — intuitive */}
            {committed.length > 0 && (
              <div className="border-b bg-gray-50">
                {/* Quick angle buttons */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button onClick={() => setLastAngle(90)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border active:scale-95 transition-colors ${
                      lastAngle === 90 ? "bg-[#1e3a5f] text-white border-[#1e3a5f] font-semibold" : "border-gray-300 text-gray-600"
                    }`}>
                    ↱ Направо
                  </button>
                  <button onClick={() => setLastAngle(-90)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border active:scale-95 transition-colors ${
                      lastAngle === -90 ? "bg-amber-500 text-white border-amber-500 font-semibold" : "border-gray-300 text-gray-600"
                    }`}>
                    ↰ Налево
                  </button>
                  <button onClick={() => setShowAngleInput(!showAngleInput)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border active:scale-95 transition-colors ${
                      lastIsCustomAngle ? "bg-blue-500 text-white border-blue-500 font-semibold" : "border-gray-300 text-gray-600"
                    }`}>
                    {lastIsCustomAngle ? `${lastAngle}°` : "📐 Угол"}
                  </button>
                </div>
                {/* Angle slider — drag to set angle */}
                {showAngleInput && (
                  <div className="px-3 pb-2 space-y-2">
                    {/* Mini compass preview */}
                    <div className="flex items-center justify-center gap-4">
                      <svg width="56" height="56" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="26" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                        {/* Tick marks every 45° */}
                        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                          const r1 = 22, r2 = 26;
                          const rad = (deg - 90) * Math.PI / 180;
                          return <line key={deg} x1={28 + Math.cos(rad) * r1} y1={28 + Math.sin(rad) * r1}
                            x2={28 + Math.cos(rad) * r2} y2={28 + Math.sin(rad) * r2}
                            stroke="#94a3b8" strokeWidth={deg % 90 === 0 ? 2 : 1} />;
                        })}
                        {/* Direction arrow */}
                        {(() => {
                          const rad = (lastAngle - 90) * Math.PI / 180;
                          const ex = 28 + Math.cos(rad) * 20;
                          const ey = 28 + Math.sin(rad) * 20;
                          return <line x1="28" y1="28" x2={ex} y2={ey} stroke="#F97316" strokeWidth="3" strokeLinecap="round" />;
                        })()}
                        <circle cx="28" cy="28" r="3" fill="#1e3a5f" />
                      </svg>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#1e3a5f]">{lastAngle}°</div>
                        <div className="text-xs text-gray-500">
                          {lastAngle > 0 ? "направо" : lastAngle < 0 ? "налево" : "прямо"}
                        </div>
                      </div>
                    </div>
                    {/* Slider */}
                    <div className="relative">
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={5}
                        value={lastAngle}
                        onChange={e => setLastAngle(parseInt(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${(lastAngle + 180) / 360 * 100}%, #e2e8f0 ${(lastAngle + 180) / 360 * 100}%, #e2e8f0 100%)`,
                        }}
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-0.5">
                        <span>-180°</span>
                        <span>-90°</span>
                        <span>0°</span>
                        <span>+90°</span>
                        <span>+180°</span>
                      </div>
                    </div>
                    {/* Quick presets */}
                    <div className="flex gap-1 flex-wrap justify-center">
                      {[-135, -90, -45, 0, 45, 90, 135].map(a => (
                        <button key={a} onClick={() => setLastAngle(a)}
                          className={`text-xs px-2 py-1 rounded-full border active:scale-95 ${
                            lastAngle === a ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-gray-300 text-gray-500"
                          }`}>
                          {a}°
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Number display */}
            <div className="flex items-baseline justify-center gap-2 py-1.5 border-b">
              <span className="text-4xl font-bold tabular-nums text-[#1e3a5f]">
                {input || "0"}
              </span>
              <span className="text-base text-muted-foreground">см</span>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 select-none">
              {(["1","2","3","4","5","6","7","8","9"] as const).map(d => (
                <button key={d} onClick={() => digit(d)}
                  className="py-2.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                  {d}
                </button>
              ))}
              <button
                onClick={() => {
                  if (input) setInput(p => p.slice(0, -1));
                  else if (committed.length > 0) setCommitted(prev => prev.slice(0, -1));
                }}
                className="py-2.5 text-xl text-center border-b border-r border-gray-100 active:bg-red-50 text-muted-foreground">
                ⌫
              </button>
              <button onClick={() => digit("0")}
                className="py-2.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                0
              </button>
              <button onClick={confirm}
                disabled={!input || parseFloat(input) <= 0}
                className="py-2.5 text-2xl font-bold bg-[#1e3a5f] text-white border-b active:bg-[#152d4a] disabled:opacity-30">
                ✓
              </button>
            </div>

            {committed.length >= 4 && !isValid && (
              <div className="border-t">
                {gap > 0 && gap < 30 && (
                  <p className="text-[10px] text-center text-amber-600 pt-1.5 px-2">
                    Погрешность {Math.round(gap)} см — можно принять
                  </p>
                )}
                {gapParts.length > 0 && gap >= 30 && (
                  <p className="text-[10px] text-center text-muted-foreground pt-1.5 px-2">
                    Не замкнуто: {gapParts.join(" и ")}
                  </p>
                )}
                <button onClick={handleForceFinish}
                  className={`w-full py-3 text-sm font-semibold active:opacity-80 ${
                    gap < 30 ? "text-amber-600 bg-amber-50" : "text-[#1e3a5f] active:bg-blue-50"
                  }`}>
                  {gap < 30 ? `Принять приблизительно (${committed.length} стен) →` : `Завершить комнату (${committed.length} стен) →`}
                </button>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Room Card
// ─────────────────────────────────────────────────────

function RoomCard({ room, index, onRemove, onView, onDesign, activeObjectId, onPhotosChange }: {
  room: Room;
  index: number;
  onRemove: () => void;
  onView: () => void;
  onDesign: () => void;
  activeObjectId: string | null;
  onPhotosChange: (roomId: string, photoUrls: string[]) => void;
}) {
  const elCount = room.elements?.length || 0;
  const photoCount = room.photoUrls?.length || 0;
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !activeObjectId) return;
    setUploading(true);
    try {
      let currentUrls = [...(room.photoUrls || [])];
      for (const file of Array.from(files)) {
        if (currentUrls.length >= 10) break;
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/measurements/${activeObjectId}/rooms/${room.id}/photos`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          currentUrls = data.photoUrls;
        }
      }
      onPhotosChange(room.id, currentUrls);
    } catch {
      alert("Не удалось загрузить фото. Проверьте интернет.");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeletePhoto(url: string) {
    if (!activeObjectId || !confirm("Удалить фото?")) return;
    try {
      const res = await fetch(`/api/measurements/${activeObjectId}/rooms/${room.id}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        onPhotosChange(room.id, data.photoUrls);
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-lg border p-4 cursor-pointer active:bg-gray-50" onClick={onView}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">#{index + 1}</span>
            <span className="font-medium">{room.name || `Помещение ${index + 1}`}</span>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {room.walls.length} стен
            </span>
            {photoCount > 0 && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> {photoCount}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="text-2xl font-bold text-blue-600">{room.area} м²</span>
            <span className="text-sm font-medium text-purple-600">P = {room.perimeter} м</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono">
            {room.walls.join(" · ")} см
          </div>
          {elCount > 0 && (
            <div className="mt-1.5 text-xs text-emerald-600 font-medium">
              ✓ {elCount} элементов размещено
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDesign(); }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium bg-[#1e3a5f] text-white active:bg-[#152d4a]">
            {elCount > 0 ? "Дизайн ✎" : "Дизайн +"}
          </button>
          <button
            onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium border border-blue-200 text-blue-600 active:bg-blue-50 flex items-center gap-1"
            disabled={uploading || !activeObjectId}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            Фото
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors self-center">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Photo gallery */}
      {photoCount > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
          {room.photoUrls!.map((url, i) => (
            <div key={i} className="relative shrink-0 group">
              <img
                src={url}
                alt={`Фото ${i + 1}`}
                className="w-16 h-16 rounded-lg object-cover cursor-pointer border"
                onClick={() => setPreviewUrl(url)}
              />
              <button
                onClick={() => handleDeletePhoto(url)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Full-screen preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}>
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 text-white z-10">
            <X className="h-7 w-7" />
          </button>
          <img src={previewUrl} alt="Preview" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Room Detail / Edit
// ─────────────────────────────────────────────────────

function RoomDetail({ room, onUpdate, onClose }: {
  room: Room;
  onUpdate: (updated: Room) => void;
  onClose: () => void;
}) {
  const [walls, setWalls] = useState<number[]>(room.walls);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const angles = room.angles ?? room.normalCorners.map(nc => nc ? 90 : -90);
  const previewWalls = walls.map((l, i) => ({
    length: String(l),
    angle: angles[i] ?? 90,
  }));

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditValue(String(walls[i]));
  }

  function confirmEdit() {
    if (editingIdx === null) return;
    const val = parseFloat(editValue);
    if (val > 0) {
      const next = [...walls];
      next[editingIdx] = val;
      setWalls(next);
    }
    setEditingIdx(null);
  }

  function recalc(w: number[]) {
    const { vertices } = buildVertices(w.map((l, i) => ({ length: String(l), angle: angles[i] ?? 90 })));
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return {
      area: Math.round(Math.abs(sum) / 2 / 100) / 100,
      perimeter: Math.round(w.reduce((s, v) => s + v, 0)) / 100,
    };
  }

  function handleSave() {
    const res = recalc(walls);
    onUpdate({ ...room, walls, angles, area: res.area, perimeter: res.perimeter });
    onClose();
  }

  const result = recalc(walls);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white" style={{ height: "100svh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <button onClick={onClose} className="p-1 -ml-1 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">{room.name || "Помещение"}</span>
        <button
          onClick={handleSave}
          className="text-sm font-semibold text-[#1e3a5f] px-1">
          Сохранить
        </button>
      </div>

      {/* SVG Preview */}
      <div className="shrink-0 px-4 py-3" style={{ height: 240 }}>
        <PinchZoom className="w-full h-full">
          <RoomPreview
            walls={previewWalls}
            onWallClick={i => startEdit(i)}
            activeWallIdx={editingIdx ?? undefined}
          />
        </PinchZoom>
      </div>

      {/* Stats */}
      <div className="shrink-0 flex gap-3 px-4 pb-3">
        <div className="flex-1 rounded-xl bg-blue-50 p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{result.area}</div>
          <div className="text-xs text-muted-foreground">м² площадь</div>
        </div>
        <div className="flex-1 rounded-xl bg-purple-50 p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{result.perimeter}</div>
          <div className="text-xs text-muted-foreground">м периметр</div>
        </div>
      </div>

      {/* Walls list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6 border-t pt-3">
        <p className="text-xs text-muted-foreground mb-1">Нажмите на стену чтобы изменить длину</p>
        {walls.map((len, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Стена {i + 1}</span>
            {editingIdx === i ? (
              <div className="flex items-center gap-2">
                <input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={confirmEdit}
                  onKeyDown={e => e.key === "Enter" && confirmEdit()}
                  className="w-20 border rounded-lg px-2 py-1 text-right text-sm font-mono"
                  autoFocus
                  inputMode="numeric"
                />
                <span className="text-sm text-muted-foreground">см</span>
              </div>
            ) : (
              <button
                onClick={() => startEdit(i)}
                className="font-mono font-bold text-[#1e3a5f] text-sm bg-blue-50 px-3 py-1 rounded-lg active:bg-blue-100">
                {len} см
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// History Drawer
// ─────────────────────────────────────────────────────

function HistoryDrawer({ saved, onResume, onDelete, onClose }: {
  saved: SavedObject[];
  onResume: (obj: SavedObject) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white" style={{ height: "100svh" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <button onClick={onClose} className="p-1 -ml-1 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">История объектов</span>
        <div className="w-8" />
      </div>

      {saved.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Сохранённых объектов нет
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {saved.slice().reverse().map(obj => {
            const date = new Date(obj.savedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            const isExpanded = expandedId === obj.id;
            const totalPhotos = obj.rooms.reduce((s, r) => s + (r.photoUrls?.length || 0), 0);
            return (
              <div key={obj.id} className="rounded-xl border overflow-hidden">
                <div className="p-4 flex items-center gap-3">
                  <button className="flex-1 min-w-0 text-left" onClick={() => onResume(obj)}>
                    <div className="font-medium truncate">{obj.address || "Без адреса"}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {obj.rooms.length} помещ. · <span className="font-semibold text-blue-600">{obj.totalArea} м²</span> · {date}
                      {totalPhotos > 0 && (
                        <span className="ml-1.5 text-blue-500">
                          · <ImageIcon className="h-3 w-3 inline" /> {totalPhotos}
                        </span>
                      )}
                    </div>
                  </button>
                  {totalPhotos > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : obj.id)}
                      className="shrink-0 p-1.5 rounded-lg text-blue-500 hover:bg-blue-50">
                      <Camera className="h-4 w-4" />
                    </button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 cursor-pointer" onClick={() => onResume(obj)} />
                  <button
                    onClick={() => onDelete(obj.id)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Expanded: rooms with photos */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t pt-3 bg-gray-50/50">
                    {obj.rooms.map((r) => {
                      const photos = r.photoUrls || [];
                      return (
                        <div key={r.id}>
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium">{r.name}</span>
                            <span className="text-xs text-muted-foreground">{r.area} м²</span>
                          </div>
                          {photos.length > 0 ? (
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                              {photos.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`${r.name} фото ${i + 1}`}
                                  className="w-20 h-20 rounded-lg object-cover cursor-pointer border shrink-0"
                                  onClick={() => setPreviewUrl(url)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-1">Нет фото</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full-screen preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center"
          onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 p-2 text-white z-10">
            <X className="h-7 w-7" />
          </button>
          <img src={previewUrl} alt="Preview" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Photo Upload
// ─────────────────────────────────────────────────────

function PhotoUpload({ onRoomsLoaded }: { onRoomsLoaded: (rooms: Room[]) => void }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Выберите изображение"); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Url = e.target?.result as string;
      setPreview(base64Url);
      setScanning(true);
      try {
        const res = await fetch("/api/vision-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64Url: base64Url }),
        });
        const data: MultiAgentResult & { error?: string } = await res.json();
        if (!res.ok || data.error) { setError(data.error || "Ошибка распознавания"); return; }
        if (data.rooms.length === 0) { setError("Комнаты не найдены. Добавьте вручную."); return; }
        onRoomsLoaded(data.rooms.map(r => ({
          id: crypto.randomUUID(),
          name: r.name,
          walls: r.walls_cm,
          normalCorners: r.walls_cm.map(() => true),
          angles: r.walls_cm.map(() => 90),
          area: r.area,
          perimeter: r.perimeter,
        })));
        setPreview(null);
      } catch { setError("Ошибка соединения"); }
      finally { setScanning(false); }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-blue-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">Сканировать фото замеров</p>
          <p className="text-xs text-blue-600">AI прочитает цифры и заполнит комнаты автоматически</p>
        </div>
      </div>
      {preview && <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border" />}
      {scanning ? (
        <div className="flex items-center justify-center gap-2 py-1 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Распознаём комнаты...
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors">
          <Upload className="h-4 w-4" />
          Загрузить фото
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────

export default function ZameryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCalculatorMode = searchParams.get("mode") === "calculator" || searchParams.get("mode") === "calculator-edit";
  const isCalculatorEditMode = searchParams.get("mode") === "calculator-edit";
  const [rooms, setRooms] = useState<Room[]>([]);
  const [objectName, setObjectName] = useState("");
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null);
  const [savedObjects, setSavedObjects] = useState<SavedObject[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [designingRoom, setDesigningRoom] = useState<Room | null>(null);
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const calcModeInitRef = useRef(false);
  const addressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeObjectIdRef = useRef<string | null>(null);

  // Keep ref in sync with state (avoids stale closure in async functions)
  useEffect(() => { activeObjectIdRef.current = activeObjectId; }, [activeObjectId]);

  // ── Persist rooms to localStorage as backup ──
  useEffect(() => {
    if (loading) return; // don't overwrite before initial load
    try {
      localStorage.setItem("zamery-rooms", JSON.stringify(rooms));
      localStorage.setItem("zamery-object", objectName);
      if (activeObjectId) localStorage.setItem("zamery-objectId", activeObjectId);
    } catch { /* quota exceeded — ignore */ }
  }, [rooms, objectName, activeObjectId, loading]);

  // Calculator mode: auto-open wizard on mount
  useEffect(() => {
    if (isCalculatorMode && !calcModeInitRef.current) {
      calcModeInitRef.current = true;

      // Edit mode: load room from localStorage and open designer directly
      if (isCalculatorEditMode) {
        try {
          const stored = localStorage.getItem("vision-edit-room");
          if (stored) {
            const data = JSON.parse(stored);
            const room: Room = {
              id: data.id || crypto.randomUUID(),
              name: data.name || "Помещение",
              walls: data.walls,
              angles: data.angles,
              normalCorners: data.normalCorners,
              area: data.area,
              perimeter: data.perimeter,
              elements: data.elements || [],
              arcBulges: data.arcBulges,
              columns: data.columns,
            };
            setDesigningRoom(room);
          }
        } catch { /* ignore */ }
        setLoading(false);
        return;
      }

      // Add mode: open wall wizard
      setShowWizard(true);
      setLoading(false);
    }
  }, [isCalculatorMode, isCalculatorEditMode]);

  // ── Load from server on mount ──
  useEffect(() => {
    async function load() {
      try {
        const [activeRes, savedRes] = await Promise.all([
          fetch("/api/measurements?status=active"),
          fetch("/api/measurements?status=saved"),
        ]);
        let loadedFromServer = false;
        if (activeRes.ok) {
          const activeList = await activeRes.json();
          if (activeList.length > 0) {
            const obj = activeList[0];
            setActiveObjectId(obj.id);
            setObjectName(obj.address || "");
            setRooms(obj.rooms.map((r: Room & { objectId?: string; arcBulges?: number[]; columns?: RoomColumn[] }) => ({
              id: r.id,
              name: r.name,
              walls: r.walls as number[],
              normalCorners: r.normalCorners as boolean[],
              angles: (r.angles as number[]) ?? (r.normalCorners as boolean[]).map(nc => nc ? 90 : -90),
              arcBulges: (r.arcBulges as number[]) ?? (r.walls as number[]).map(() => 0),
              columns: (r.columns as RoomColumn[]) ?? [],
              area: r.area,
              perimeter: r.perimeter,
              elements: (r.elements as RoomElement[]) || [],
              photoUrls: (r.photoUrls as string[]) || [],
            })));
            loadedFromServer = true;
          }
        }
        // If server has no active object, restore from localStorage backup
        if (!loadedFromServer) {
          try {
            const lr = localStorage.getItem("zamery-rooms");
            const lo = localStorage.getItem("zamery-object");
            const loid = localStorage.getItem("zamery-objectId");
            if (lr) {
              const parsed = JSON.parse(lr) as Room[];
              if (parsed.length > 0) {
                setRooms(parsed);
                if (lo) setObjectName(lo);
                if (loid) setActiveObjectId(loid);
              }
            }
          } catch { /* ignore */ }
        }
        if (savedRes.ok) {
          const savedList = await savedRes.json();
          setSavedObjects(savedList.map((o: SavedObject & { createdAt?: string; updatedAt?: string }) => ({
            id: o.id,
            address: o.address,
            totalArea: o.totalArea,
            savedAt: o.updatedAt ? new Date(o.updatedAt).getTime() : Date.now(),
            rooms: (o.rooms || []).map((r: Room & { arcBulges?: number[]; columns?: RoomColumn[] }) => ({
              id: r.id,
              name: r.name,
              walls: r.walls as number[],
              normalCorners: r.normalCorners as boolean[],
              angles: (r.angles as number[]) ?? (r.normalCorners as boolean[]).map(nc => nc ? 90 : -90),
              arcBulges: (r.arcBulges as number[]) ?? (r.walls as number[]).map(() => 0),
              columns: (r.columns as RoomColumn[]) ?? [],
              area: r.area,
              perimeter: r.perimeter,
              photoUrls: (r.photoUrls as string[]) || [],
            })),
          })));
        }
      } catch {
        // Fallback to localStorage if offline
        try {
          const lr = localStorage.getItem("zamery-rooms");
          const lo = localStorage.getItem("zamery-object");
          const ls = localStorage.getItem("zamery-saved");
          if (lr) setRooms(JSON.parse(lr));
          if (lo) setObjectName(lo);
          if (ls) setSavedObjects(JSON.parse(ls));
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Helper: ensure active object exists on server ──
  async function ensureActiveObject(): Promise<string> {
    // Use ref to get latest value (avoids stale closure in rapid async calls)
    if (activeObjectIdRef.current) return activeObjectIdRef.current;
    const res = await fetch("/api/measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: objectName, status: "active" }),
    });
    if (!res.ok) throw new Error("Не удалось создать объект замера");
    const obj = await res.json();
    setActiveObjectId(obj.id);
    activeObjectIdRef.current = obj.id; // update ref immediately (no wait for re-render)
    return obj.id;
  }

  // ── Add room (from WallWizard or PhotoUpload) ──
  async function addRooms(newRooms: Room[]) {
    setRooms(prev => [...prev, ...newRooms]);
    try {
      const objId = await ensureActiveObject();
      const res = await fetch(`/api/measurements/${objId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRooms.map(r => ({
          name: r.name,
          walls: r.walls,
          normalCorners: r.normalCorners,
          angles: r.angles,
          arcBulges: r.arcBulges,
          columns: r.columns,
          area: r.area,
          perimeter: r.perimeter,
          elements: r.elements || [],
        }))),
      });
      if (res.ok) {
        const created = await res.json();
        const arr = Array.isArray(created) ? created : [created];
        // Update local room IDs to match server IDs
        setRooms(prev => {
          const updated = [...prev];
          for (let i = 0; i < arr.length; i++) {
            const idx = updated.findIndex(r => r.id === newRooms[i]?.id);
            if (idx >= 0) updated[idx] = { ...updated[idx], id: arr[i].id };
          }
          return updated;
        });
      }
    } catch {
      alert("Не удалось сохранить комнату на сервер. Данные сохранены локально.");
    }
  }

  // ── Remove room ──
  async function removeRoom(roomId: string) {
    setRooms(prev => prev.filter(r => r.id !== roomId));
    const objId = activeObjectIdRef.current;
    if (objId) {
      try {
        const res = await fetch(`/api/measurements/${objId}/rooms/${roomId}`, { method: "DELETE" });
        if (!res.ok) alert("Не удалось удалить комнату с сервера.");
      } catch {
        alert("Ошибка при удалении комнаты. Проверьте интернет.");
      }
    }
  }

  // ── Update room (from RoomDetail editor or RoomDesigner) ──
  async function updateRoom(updated: Room) {
    setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
    setViewingRoom(null);
    const objId = activeObjectIdRef.current;
    if (objId) {
      try {
        const res = await fetch(`/api/measurements/${objId}/rooms/${updated.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: updated.name,
            walls: updated.walls,
            normalCorners: updated.normalCorners,
            angles: updated.angles,
            arcBulges: updated.arcBulges,
            columns: updated.columns,
            area: updated.area,
            perimeter: updated.perimeter,
            elements: updated.elements || [],
          }),
        });
        if (!res.ok) {
          alert("Не удалось сохранить изменения комнаты. Попробуйте ещё раз.");
        }
      } catch {
        alert("Ошибка сохранения. Проверьте интернет.");
      }
    }
  }

  // ── Address change (debounced) ──
  function handleAddressChange(value: string) {
    setObjectName(value);
    if (addressTimer.current) clearTimeout(addressTimer.current);
    addressTimer.current = setTimeout(() => {
      const objId = activeObjectIdRef.current;
      if (objId) {
        fetch(`/api/measurements/${objId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: value }),
        }).catch(() => {
          console.error("Не удалось обновить адрес объекта");
        });
      }
    }, 500);
  }

  // ── Save to history ──
  async function handleSaveObject() {
    if (rooms.length === 0) return;
    const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;

    // Save to server FIRST, then clear local state
    const currentRooms = [...rooms];
    const currentName = objectName;
    const currentId = activeObjectId;

    try {
      let savedId = currentId;

      if (currentId) {
        const res = await fetch(`/api/measurements/${currentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "saved", totalArea }),
        });
        if (!res.ok) throw new Error("Ошибка сохранения");
      } else {
        const res = await fetch("/api/measurements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: currentName,
            status: "saved",
            rooms: currentRooms.map(r => ({ name: r.name, walls: r.walls, normalCorners: r.normalCorners, angles: r.angles, arcBulges: r.arcBulges, columns: r.columns, area: r.area, perimeter: r.perimeter })),
          }),
        });
        if (!res.ok) throw new Error("Ошибка сохранения");
        const obj = await res.json();
        savedId = obj.id;
      }

      // Server save succeeded — now clear local state
      const savedObj: SavedObject = {
        id: savedId || crypto.randomUUID(),
        address: currentName,
        rooms: currentRooms,
        totalArea,
        savedAt: Date.now(),
      };
      setSavedObjects(prev => [...prev, savedObj]);
      setRooms([]);
      setObjectName("");
      setActiveObjectId(null);
      activeObjectIdRef.current = null;
      try {
        localStorage.removeItem("zamery-rooms");
        localStorage.removeItem("zamery-object");
        localStorage.removeItem("zamery-objectId");
      } catch { /* ignore */ }
    } catch {
      alert("Не удалось сохранить замеры. Проверьте интернет и попробуйте ещё раз.");
    }
  }

  // ── Resume from history ──
  async function handleResume(obj: SavedObject) {
    if (rooms.length > 0) {
      if (!confirm("Заменить текущие замеры на этот объект?")) return;
    }

    // Delete current active on server
    const currentObjId = activeObjectIdRef.current;
    if (currentObjId) {
      try {
        await fetch(`/api/measurements/${currentObjId}`, { method: "DELETE" });
      } catch { /* non-critical */ }
    }

    setRooms(obj.rooms);
    setObjectName(obj.address);
    setSavedObjects(prev => prev.filter(o => o.id !== obj.id));
    setShowHistory(false);

    // Change resumed object status to active
    try {
      const res = await fetch(`/api/measurements/${obj.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) setActiveObjectId(obj.id);
      else alert("Не удалось возобновить объект. Попробуйте ещё раз.");
    } catch {
      alert("Ошибка сети при возобновлении замера.");
    }
  }

  // ── Delete from history ──
  async function handleDeleteSaved(id: string) {
    setSavedObjects(prev => prev.filter(o => o.id !== id));
    try {
      const res = await fetch(`/api/measurements/${id}`, { method: "DELETE" });
      if (!res.ok) console.error("Не удалось удалить замер с сервера");
    } catch {
      console.error("Ошибка при удалении замера");
    }
  }

  const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const totalPerimeter = Math.round(rooms.reduce((s, r) => s + r.perimeter, 0) * 100) / 100;

  function handleShare() {
    const header = objectName
      ? `📐 Замеры: ${objectName}`
      : `📐 Замеры потолков`;
    const lines = rooms.map((r, i) => {
      const name = r.name || `Помещение ${i + 1}`;
      return `${i + 1}. ${name}: ${r.area} м², P = ${r.perimeter} м\n   Стены: ${r.walls.join(" · ")} см`;
    });
    const footer = `\nИТОГО: ${totalArea} м², P = ${totalPerimeter} м`;
    const text = [header, "", ...lines, footer].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // ── Share factory image (PNG with room drawings) ──
  async function handleShareToFactory() {
    if (rooms.length === 0) return;

    const cols = rooms.length === 1 ? 1 : Math.min(rooms.length, 2);
    const rowCount = Math.ceil(rooms.length / cols);
    const CELL = 600;
    const HEADER = 100;
    const FOOTER = 50;
    const W = CELL * cols;
    const H = HEADER + CELL * rowCount + FOOTER;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = "#1e3a5f";
    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(objectName || "Замеры потолков", 28, 18);

    ctx.fillStyle = "#6b7280";
    ctx.font = "20px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      `${totalArea} м² | ${rooms.length} помещ. | ${new Date().toLocaleDateString("ru-RU")}`,
      28, 58,
    );

    // Separator
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, HEADER - 6);
    ctx.lineTo(W - 28, HEADER - 6);
    ctx.stroke();

    // Draw rooms
    rooms.forEach((room, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = col * CELL;
      const oy = HEADER + row * CELL;

      // Title
      ctx.fillStyle = "#1e3a5f";
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(room.name || `Помещение ${i + 1}`, ox + 20, oy + 10);
      ctx.fillStyle = "#6b7280";
      ctx.font = "17px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${room.area} м²  P = ${room.perimeter} м`, ox + 20, oy + 36);

      // Vertices
      const angles = room.angles || room.normalCorners.map(nc => nc ? 90 : -90);
      const allRect = angles.every(a => a === 90 || a === -90);
      const verts: { x: number; y: number }[] = [{ x: 0, y: 0 }];

      if (allRect) {
        let cx = 0, cy = 0, dir = 0;
        for (let j = 0; j < room.walls.length; j++) {
          cx += DX[dir] * room.walls[j];
          cy += DY[dir] * room.walls[j];
          verts.push({ x: cx, y: cy });
          dir = angles[j] > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
        }
      } else {
        let cx = 0, cy = 0, dirRad = 0;
        for (let j = 0; j < room.walls.length; j++) {
          cx += Math.cos(dirRad) * room.walls[j];
          cy += Math.sin(dirRad) * room.walls[j];
          verts.push({ x: cx, y: cy });
          dirRad += angles[j] * Math.PI / 180;
        }
      }

      if (verts.length < 3) return;

      // Bounds + scale
      const xs = verts.map(v => v.x);
      const ys = verts.map(v => v.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rW = maxX - minX || 1;
      const rH = maxY - minY || 1;
      const PAD = 80;
      const TITLE_H = 55;
      const drawW = CELL - PAD * 2;
      const drawH = CELL - PAD * 2 - TITLE_H;
      const sc = Math.min(drawW / rW, drawH / rH);
      const baseX = ox + PAD + (drawW - rW * sc) / 2;
      const baseY = oy + TITLE_H + PAD + (drawH - rH * sc) / 2;
      const toX = (x: number) => baseX + (x - minX) * sc;
      const toY = (y: number) => baseY + (y - minY) * sc;

      // Fill polygon
      ctx.beginPath();
      ctx.moveTo(toX(verts[0].x), toY(verts[0].y));
      for (let j = 1; j < verts.length; j++) ctx.lineTo(toX(verts[j].x), toY(verts[j].y));
      ctx.closePath();
      ctx.fillStyle = "#eef2ff";
      ctx.fill();
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Dimension labels
      for (let j = 0; j < room.walls.length; j++) {
        const v1 = verts[j];
        const v2 = verts[j + 1] || verts[0];
        const p1x = toX(v1.x), p1y = toY(v1.y);
        const p2x = toX(v2.x), p2y = toY(v2.y);
        const mx = (p1x + p2x) / 2;
        const my = (p1y + p2y) / 2;

        // Outward normal
        const edx = v2.x - v1.x, edy = v2.y - v1.y;
        const elen = Math.sqrt(edx * edx + edy * edy) || 1;
        const nx = edy / elen, ny = -edx / elen;
        const off = 28;
        const lx = mx + nx * off;
        const ly = my + ny * off;

        // Extension lines
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p1x + nx * (off - 6), p1y + ny * (off - 6));
        ctx.moveTo(p2x, p2y);
        ctx.lineTo(p2x + nx * (off - 6), p2y + ny * (off - 6));
        ctx.stroke();

        // Label text
        const text = String(room.walls[j]);
        ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(text).width;

        // Pill background
        const pillW = tw + 18;
        const pillH = 28;
        const rx = lx - pillW / 2, ry = ly - pillH / 2, r = 7;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + pillW - r, ry);
        ctx.quadraticCurveTo(rx + pillW, ry, rx + pillW, ry + r);
        ctx.lineTo(rx + pillW, ry + pillH - r);
        ctx.quadraticCurveTo(rx + pillW, ry + pillH, rx + pillW - r, ry + pillH);
        ctx.lineTo(rx + r, ry + pillH);
        ctx.quadraticCurveTo(rx, ry + pillH, rx, ry + pillH - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = "#1e3a5f";
        ctx.fillText(text, lx, ly);
      }
    });

    // Footer
    ctx.fillStyle = "#9ca3af";
    ctx.font = "15px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("potolok.ai", W / 2, H - 16);

    // Export to blob and share
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) { alert("Не удалось создать изображение"); return; }

    const fileName = `zamery-${(objectName || "potolok").replace(/\s+/g, "-")}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `Замеры: ${objectName || "потолки"} — ${totalArea} м²`,
        });
      } else {
        // Desktop fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // User cancelled share
    }
  }

  function handleCreateEstimate() {
    const roomInputs: RoomInput[] = rooms.map(room => {
      const l = room.walls.length === 4 ? room.walls[0] / 100 : Math.sqrt(room.area);
      const w = room.walls.length === 4
        ? room.walls[1] / 100
        : Math.round((room.area / Math.max(l, 0.1)) * 100) / 100;

      // Auto-fill from designer elements
      const els = room.elements || [];
      const spotsOurs = els.filter(e => e.type === "spot" && e.variant !== "client").length;
      const spotsClient = els.filter(e => e.type === "spot" && e.variant === "client").length;
      const spotsCount = spotsOurs + spotsClient;
      const chandelierCount = els.filter(e => e.type === "chandelier").length;
      const trackMagneticLength = Math.round(
        els.filter(e => e.type === "track").reduce((s, e) => s + (e.length || 0), 0)
      ) / 100;
      const lightLineLength = Math.round(
        els.filter(e => e.type === "lightline").reduce((s, e) => s + (e.length || 0), 0)
      ) / 100;
      const gardinaLength = Math.round(
        els.filter(e => e.type === "curtain").reduce((s, e) => s + (e.length || 0), 0)
      ) / 100;
      const podshtornikLength = Math.round(
        els.filter(e => e.type === "subcurtain").reduce((s, e) => s + (e.length || 0), 0)
      ) / 100;

      return {
        id: crypto.randomUUID(),
        name: room.name || "Помещение",
        length: Math.round(l * 100) / 100,
        width: Math.round(w * 100) / 100,
        ceilingHeight: 2.7,
        canvasType: "matte" as CanvasType,
        spotsCount,
        spotType: spotsClient > 0 && spotsOurs === 0 ? "spot_client" : spotsOurs > 0 ? "spot_ours" : undefined,
        chandelierCount,
        chandelierInstallCount: chandelierCount,
        trackMagneticLength,
        lightLineLength,
        curtainRodLength: 0,
        pipeBypasses: 0,
        cornersCount: room.walls.length,
        eurobrusCount: 0,
        gardinaLength,
        podshtornikLength,
        shape: room.walls.length === 4 ? "rectangle" : undefined,
      } satisfies RoomInput;
    });
    localStorage.setItem("vision-rooms", JSON.stringify(roomInputs));
    router.push("/dashboard/calculator?from=vision");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {showWizard && (
        <WallWizard
          onDone={room => { setDesigningRoom(room); setShowWizard(false); }}
          onCancel={() => {
            if (isCalculatorMode) { router.push("/dashboard/calculator"); return; }
            setShowWizard(false);
          }}
        />
      )}
      {designingRoom && (
        <RoomDesigner
          room={designingRoom}
          onDone={elements => {
            const roomWithElements = { ...designingRoom, elements };

            // Calculator mode: save room and redirect to calculator
            if (isCalculatorMode) {
              const room = roomWithElements;
              const spotsOurs = elements.filter(e => e.type === "spot" && e.variant !== "client").length;
              const spotsClient = elements.filter(e => e.type === "spot" && e.variant === "client").length;
              const chandelierCount = elements.filter(e => e.type === "chandelier").length;
              const trackEls = elements.filter(e => e.type === "track");
              const trackMagneticLength = Math.round(trackEls.reduce((s, e) => s + (e.length || 0), 0)) / 100;
              const lightLineEls = elements.filter(e => e.type === "lightline");
              const lightLineLength = Math.round(lightLineEls.reduce((s, e) => s + (e.length || 0), 0)) / 100;
              const gardinaEls = elements.filter(e => e.type === "curtain");
              const gardinaLength = Math.round(gardinaEls.reduce((s, e) => s + (e.length || 0), 0)) / 100;
              const podshtornikEls = elements.filter(e => e.type === "subcurtain");
              const podshtornikLength = Math.round(podshtornikEls.reduce((s, e) => s + (e.length || 0), 0)) / 100;

              const roomInput: RoomInput = {
                id: crypto.randomUUID(),
                name: room.name || "Помещение",
                length: Math.max(...room.walls) / 100 || room.area / (Math.min(...room.walls) / 100) || 5,
                width: Math.min(...room.walls) / 100 || 4,
                ceilingHeight: 3,
                canvasType: "mat" as CanvasType,
                spotsCount: spotsOurs + spotsClient,
                spotType: spotsClient > 0 && spotsOurs === 0 ? "spot_client" : "spot_ours",
                chandelierCount,
                chandelierInstallCount: chandelierCount,
                trackMagneticLength,
                lightLineLength,
                curtainRodLength: 0,
                pipeBypasses: 0,
                cornersCount: room.walls.length,
                eurobrusCount: 0,
                gardinaLength,
                podshtornikLength,
                shape: room.walls.length === 4 && room.angles?.every(a => a === 90) ? "rectangle" : "custom" as any,
                customDims: room.walls.length !== 4 || !room.angles?.every(a => a === 90) ? {
                  walls: room.walls.map((w, i) => ({
                    length: w / 100,
                    turnRight: (room.angles?.[i] ?? 90) > 0,
                  })),
                } : undefined,
                // Raw data for editing in Room Designer later
                designerData: {
                  walls: room.walls,
                  angles: room.angles || room.normalCorners.map(nc => nc ? 90 : -90),
                  normalCorners: room.normalCorners,
                  area: room.area,
                  perimeter: room.perimeter,
                  elements: elements || [],
                  arcBulges: room.arcBulges,
                  columns: room.columns,
                },
              };
              localStorage.setItem("vision-rooms", JSON.stringify([roomInput]));
              setDesigningRoom(null);
              calcModeInitRef.current = false;
              // Edit mode: return with edit flag so calculator updates instead of adding
              const editId = isCalculatorEditMode ? searchParams.get("roomId") : null;
              router.push(editId
                ? `/dashboard/calculator?from=vision-edit&roomId=${editId}`
                : "/dashboard/calculator?from=vision"
              );
              return;
            }

            // Normal mode
            const exists = rooms.some(r => r.id === designingRoom.id);
            if (exists) {
              updateRoom(roomWithElements);
            } else {
              addRooms([roomWithElements]);
            }
            setDesigningRoom(null);
          }}
          onCancel={() => {
            if (isCalculatorMode) {
              setDesigningRoom(null);
              calcModeInitRef.current = false;
              router.push("/dashboard/calculator");
              return;
            }
            // If new room, add without elements; if existing, just close
            const exists = rooms.some(r => r.id === designingRoom.id);
            if (!exists) addRooms([designingRoom]);
            setDesigningRoom(null);
          }}
        />
      )}
      {viewingRoom && (
        <RoomDetail
          room={viewingRoom}
          onUpdate={updateRoom}
          onClose={() => setViewingRoom(null)}
        />
      )}
      {showHistory && (
        <HistoryDrawer
          saved={savedObjects}
          onResume={handleResume}
          onDelete={handleDeleteSaved}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="space-y-5">
        {/* Header with history button */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Замеры</h1>
          <button
            onClick={() => setShowHistory(true)}
            className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors">
            <History className="h-3.5 w-3.5" />
            {savedObjects.length > 0 ? `Сохранённые (${savedObjects.length})` : "Сохранённые"}
          </button>
        </div>

        {/* Address */}
        <input
          value={objectName}
          onChange={e => handleAddressChange(e.target.value)}
          placeholder="Адрес объекта (необязательно)"
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        {/* ADD ROOM BUTTONS — always visible at top */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowWizard(true)}
            className="flex-1 rounded-xl bg-[#1e3a5f] py-4 text-sm font-semibold text-white active:opacity-80 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Добавить помещение
          </button>
        </div>

        {/* Photo upload — compact */}
        <PhotoUpload onRoomsLoaded={loaded => addRooms(loaded)} />

        {/* Rooms list */}
        {rooms.length > 0 && (
          <div className="space-y-3">
            {rooms.map((room, i) => (
              <RoomCard
                key={room.id}
                room={room}
                index={i}
                onRemove={() => removeRoom(room.id)}
                onView={() => setViewingRoom(room)}
                onDesign={() => setDesigningRoom(room)}
                activeObjectId={activeObjectId}
                onPhotosChange={(roomId, photoUrls) => {
                  setRooms(prev => prev.map(r => r.id === roomId ? { ...r, photoUrls } : r));
                }}
              />
            ))}
            {/* Summary + actions */}
            <div className="rounded-lg border-2 border-[#1e3a5f]/20 bg-[#1e3a5f]/5 p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-sm text-muted-foreground">{rooms.length} помещений</div>
                <div className="flex items-baseline gap-4 mt-1">
                  <span className="text-2xl font-bold text-[#1e3a5f]">{totalArea} м²</span>
                  <span className="text-sm font-medium text-purple-600">P = {totalPerimeter} м</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleSaveObject}
                  className="rounded-lg border border-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-[#1e3a5f] hover:bg-blue-50 active:opacity-80">
                  Сохранить 💾
                </button>
                <button onClick={handleShareToFactory}
                  className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 active:opacity-80">
                  В цех 📐
                </button>
                <button onClick={handleShare}
                  className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 active:opacity-80">
                  WhatsApp 📤
                </button>
                <button onClick={handleCreateEstimate}
                  className="rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#152d4a]">
                  Создать КП →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
