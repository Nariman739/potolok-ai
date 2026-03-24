"use client";

interface RoomShapeSvgProps {
  shape: "l-shape" | "t-shape";
  dims: { a: string; b: string; c: string; d: string; e?: string };
  activeSide?: "a" | "b" | "c" | "d" | "e" | null;
}

const ACTIVE_COLOR = "#F97316"; // orange
const DEFAULT_COLOR = "#1e3a5f";
const FILL_COLOR = "#1e3a5f";
const LABEL_SIZE = 11;
const DERIVED_COLOR = "#6b7280"; // gray for derived values

function dimLabel(val: string, suffix = " см"): string {
  const n = parseFloat(val);
  if (!n || n <= 0) return "?";
  return `${n}${suffix}`;
}

export function RoomShapeSvg({ shape, dims, activeSide }: RoomShapeSvgProps) {
  if (shape === "l-shape") return renderLShape(dims, activeSide);
  return renderTShape(dims, activeSide);
}

function sideColor(side: string, activeSide?: string | null): string {
  return side === activeSide ? ACTIVE_COLOR : DEFAULT_COLOR;
}

/**
 * L-shape: 6 sides clockwise from top-left
 *
 *          A (→)
 *     1──────────2
 *     │          │ B (↓)
 *  F  │     4────3
 *  (↑)│     │ C (←)
 *     │     │ D (↓)
 *     6─────5
 *        E (←)
 */
function renderLShape(
  dims: { a: string; b: string; c: string; d: string; e?: string },
  activeSide?: string | null
) {
  const a = parseFloat(dims.a) || 100;
  const b = parseFloat(dims.b) || 40;
  const c = parseFloat(dims.c) || 40;
  const d = parseFloat(dims.d) || 60;
  const e = parseFloat(dims.e ?? "") || Math.max(a - c, 20);

  const totalH = b + d;
  const maxDim = Math.max(a, totalH);
  const scale = 130 / maxDim;
  const sa = a * scale;
  const sb = b * scale;
  const sc = c * scale;
  const sd = d * scale;
  const se = e * scale;
  const ox = 30;
  const oy = 20;

  // 6 points clockwise from top-left
  const points = [
    [ox, oy],                       // 1 top-left
    [ox + sa, oy],                  // 2 top-right
    [ox + sa, oy + sb],            // 3 right step
    [ox + sa - sc, oy + sb],       // 4 inner corner
    [ox + sa - sc, oy + sb + sd],  // 5 bottom-right
    [ox, oy + sb + sd],            // 6 bottom-left
  ];

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";

  // F = B + D (derived, left wall)
  const fVal = (parseFloat(dims.b) || 0) + (parseFloat(dims.d) || 0);

  return (
    <svg viewBox="0 0 220 210" className="w-full max-w-[220px] h-auto mx-auto">
      <path d={path} fill={FILL_COLOR} fillOpacity={0.08} stroke={DEFAULT_COLOR} strokeWidth={1.5} />

      {/* A — top (→) */}
      <line x1={points[0][0]} y1={points[0][1]} x2={points[1][0]} y2={points[1][1]}
        stroke={sideColor("a", activeSide)} strokeWidth={activeSide === "a" ? 3 : 1.5} />
      <text x={ox + sa / 2} y={oy - 6} textAnchor="middle" fontSize={LABEL_SIZE}
        fill={sideColor("a", activeSide)} fontWeight={activeSide === "a" ? 700 : 500}>
        A: {dimLabel(dims.a)}
      </text>

      {/* B — right (↓) */}
      <line x1={points[1][0]} y1={points[1][1]} x2={points[2][0]} y2={points[2][1]}
        stroke={sideColor("b", activeSide)} strokeWidth={activeSide === "b" ? 3 : 1.5} />
      <text x={points[1][0] + 6} y={oy + sb / 2 + 4} textAnchor="start" fontSize={LABEL_SIZE}
        fill={sideColor("b", activeSide)} fontWeight={activeSide === "b" ? 700 : 500}>
        B: {dimLabel(dims.b)}
      </text>

      {/* C — step left (←) */}
      <line x1={points[2][0]} y1={points[2][1]} x2={points[3][0]} y2={points[3][1]}
        stroke={sideColor("c", activeSide)} strokeWidth={activeSide === "c" ? 3 : 1.5} />
      <text x={(points[2][0] + points[3][0]) / 2} y={points[2][1] - 6} textAnchor="middle" fontSize={LABEL_SIZE - 1}
        fill={sideColor("c", activeSide)} fontWeight={activeSide === "c" ? 700 : 500}>
        C: {dimLabel(dims.c)}
      </text>

      {/* D — inner down (↓) */}
      <line x1={points[3][0]} y1={points[3][1]} x2={points[4][0]} y2={points[4][1]}
        stroke={sideColor("d", activeSide)} strokeWidth={activeSide === "d" ? 3 : 1.5} />
      <text x={points[3][0] + 6} y={oy + sb + sd / 2 + 4} textAnchor="start" fontSize={LABEL_SIZE}
        fill={sideColor("d", activeSide)} fontWeight={activeSide === "d" ? 700 : 500}>
        D: {dimLabel(dims.d)}
      </text>

      {/* E — bottom (←) */}
      <line x1={points[4][0]} y1={points[4][1]} x2={points[5][0]} y2={points[5][1]}
        stroke={sideColor("e", activeSide)} strokeWidth={activeSide === "e" ? 3 : 1.5} />
      <text x={(points[4][0] + points[5][0]) / 2} y={points[4][1] + 14} textAnchor="middle" fontSize={LABEL_SIZE}
        fill={sideColor("e", activeSide)} fontWeight={activeSide === "e" ? 700 : 500}>
        E: {dims.e ? dimLabel(dims.e) : `${e} см`}
      </text>

      {/* F — left wall (derived, shown as info) */}
      <line x1={points[5][0]} y1={points[5][1]} x2={points[0][0]} y2={points[0][1]}
        stroke={DERIVED_COLOR} strokeWidth={1} strokeDasharray="4 2" />
      <text x={ox - 6} y={oy + (sb + sd) / 2 + 4} textAnchor="end" fontSize={LABEL_SIZE - 1}
        fill={DERIVED_COLOR} fontWeight={400}>
        F: {fVal > 0 ? `${fVal} см` : "?"}
      </text>
    </svg>
  );
}

/**
 * T-shape (unchanged from before, 4 dimensions)
 */
function renderTShape(
  dims: { a: string; b: string; c: string; d: string },
  activeSide?: string | null
) {
  const a = parseFloat(dims.a) || 100;
  const b = parseFloat(dims.b) || 40;
  const c = parseFloat(dims.c) || 40;
  const d = parseFloat(dims.d) || 60;

  const totalH = b + d;
  const maxDim = Math.max(a, totalH);
  const scale = 140 / maxDim;
  const sa = a * scale;
  const sb = b * scale;
  const sc = c * scale;
  const sd = d * scale;
  const ox = 30;
  const oy = 20;
  const stemOffset = (sa - sc) / 2; // centered stem

  // T-shape path (clockwise from top-left)
  const points = [
    [ox, oy],                              // top-left
    [ox + sa, oy],                         // top-right
    [ox + sa, oy + sb],                    // right of top bar
    [ox + stemOffset + sc, oy + sb],       // inner right
    [ox + stemOffset + sc, oy + sb + sd],  // bottom-right of stem
    [ox + stemOffset, oy + sb + sd],       // bottom-left of stem
    [ox + stemOffset, oy + sb],            // inner left
    [ox, oy + sb],                         // left of top bar
  ];

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[200px] h-auto mx-auto">
      <path d={path} fill={FILL_COLOR} fillOpacity={0.08} stroke={DEFAULT_COLOR} strokeWidth={1.5} />

      {/* Side A - top */}
      <line x1={ox} y1={oy} x2={ox + sa} y2={oy}
        stroke={sideColor("a", activeSide)} strokeWidth={activeSide === "a" ? 3 : 1.5} />
      <text x={ox + sa / 2} y={oy - 6} textAnchor="middle" fontSize={LABEL_SIZE}
        fill={sideColor("a", activeSide)} fontWeight={activeSide === "a" ? 700 : 500}>
        {dimLabel(dims.a)}
      </text>

      {/* Side B - top bar height (left side) */}
      <line x1={ox} y1={oy} x2={ox} y2={oy + sb}
        stroke={sideColor("b", activeSide)} strokeWidth={activeSide === "b" ? 3 : 1.5} />
      <text x={ox - 8} y={oy + sb / 2 + 4} textAnchor="end" fontSize={LABEL_SIZE}
        fill={sideColor("b", activeSide)} fontWeight={activeSide === "b" ? 700 : 500}>
        {dimLabel(dims.b)}
      </text>

      {/* Side C - stem width (bottom) */}
      <line x1={ox + stemOffset} y1={oy + sb + sd} x2={ox + stemOffset + sc} y2={oy + sb + sd}
        stroke={sideColor("c", activeSide)} strokeWidth={activeSide === "c" ? 3 : 1.5} />
      <text x={ox + sa / 2} y={oy + sb + sd + 14} textAnchor="middle" fontSize={LABEL_SIZE}
        fill={sideColor("c", activeSide)} fontWeight={activeSide === "c" ? 700 : 500}>
        {dimLabel(dims.c)}
      </text>

      {/* Side D - stem height (right side of stem) */}
      <line x1={ox + stemOffset + sc} y1={oy + sb} x2={ox + stemOffset + sc} y2={oy + sb + sd}
        stroke={sideColor("d", activeSide)} strokeWidth={activeSide === "d" ? 3 : 1.5} />
      <text x={ox + stemOffset + sc + 8} y={oy + sb + sd / 2 + 4} textAnchor="start" fontSize={LABEL_SIZE}
        fill={sideColor("d", activeSide)} fontWeight={activeSide === "d" ? 700 : 500}>
        {dimLabel(dims.d)}
      </text>

      {/* Inner dashed lines */}
      <line x1={ox} y1={oy + sb} x2={ox + stemOffset} y2={oy + sb}
        stroke={DEFAULT_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
      <line x1={ox + stemOffset + sc} y1={oy + sb} x2={ox + sa} y2={oy + sb}
        stroke={DEFAULT_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
    </svg>
  );
}

// ============================================
// Custom polygon room SVG preview
// ============================================

interface CustomRoomSvgProps {
  walls: { length: string; turnRight: boolean; angle?: number }[];
  activeWallIndex?: number | null;
}

export function CustomRoomSvg({ walls, activeWallIndex }: CustomRoomSvgProps) {
  // Parse walls to numbers (cm)
  const parsed = walls.map(w => ({
    length: parseFloat(w.length) || 0,
    angle: w.angle ?? (w.turnRight ? 90 : -90),
  }));

  // Need at least 2 walls with length to render
  const filledCount = parsed.filter(w => w.length > 0).length;
  if (filledCount < 2) {
    return (
      <div className="w-full h-32 flex items-center justify-center text-sm text-muted-foreground border rounded">
        Введите длины стен...
      </div>
    );
  }

  // Build vertices (cm space) — supports arbitrary angles via trig
  const allRectilinear = parsed.every(w => w.angle === 90 || w.angle === -90);
  const vertices: { x: number; y: number }[] = [];

  if (allRectilinear) {
    const dxArr = [1, 0, -1, 0];
    const dyArr = [0, 1, 0, -1];
    let x = 0, y = 0, dir = 0;
    for (const wall of parsed) {
      vertices.push({ x, y });
      x += dxArr[dir] * wall.length;
      y += dyArr[dir] * wall.length;
      dir = wall.angle > 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    }
    vertices.push({ x, y });
  } else {
    let x = 0, y = 0, dirRad = 0;
    for (const wall of parsed) {
      vertices.push({ x, y });
      x += Math.cos(dirRad) * wall.length;
      y += Math.sin(dirRad) * wall.length;
      dirRad += wall.angle * Math.PI / 180;
    }
    vertices.push({ x, y });
  }

  // Bounding box
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  // Scale to fit SVG
  const pad = 35;
  const svgW = 220, svgH = 200;
  const scale = Math.min((svgW - 2 * pad) / w, (svgH - 2 * pad) / h);
  const offX = pad + ((svgW - 2 * pad) - w * scale) / 2 - minX * scale;
  const offY = pad + ((svgH - 2 * pad) - h * scale) / 2 - minY * scale;

  const toSvg = (v: { x: number; y: number }) => ({
    x: v.x * scale + offX,
    y: v.y * scale + offY,
  });

  const svgPoints = vertices.map(toSvg);

  // Check if polygon is closed
  const last = vertices[vertices.length - 1];
  const gap = Math.sqrt(last.x * last.x + last.y * last.y);
  const isClosed = gap < 1; // < 1 cm

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-[220px] h-auto mx-auto">
      {/* Filled polygon (if closed) */}
      {isClosed && svgPoints.length > 3 && (
        <polygon
          points={svgPoints.slice(0, -1).map(p => `${p.x},${p.y}`).join(" ")}
          fill={FILL_COLOR} fillOpacity={0.08}
          stroke="none"
        />
      )}

      {/* Wall segments */}
      {parsed.map((wall, i) => {
        if (wall.length <= 0) return null;
        const p1 = svgPoints[i];
        const p2 = svgPoints[i + 1];
        if (!p1 || !p2) return null;
        const isActive = activeWallIndex === i;
        const color = isActive ? ACTIVE_COLOR : DEFAULT_COLOR;

        // Mid point for label
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        // Label offset: perpendicular to wall direction
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const wallLen = Math.sqrt(dx * dx + dy * dy) || 1;
        const labelDx = (-dy / wallLen) * 10;
        const labelDy = (dx / wallLen) * 10;

        return (
          <g key={i}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={color} strokeWidth={isActive ? 3 : 1.5} />
            <text x={mx + labelDx} y={my + labelDy}
              textAnchor="middle" fontSize={9}
              fill={color} fontWeight={isActive ? 700 : 500}>
              {i + 1}: {wall.length} см
            </text>
          </g>
        );
      })}

      {/* Closing gap line (dashed, if not closed) */}
      {!isClosed && filledCount >= 3 && (
        <line
          x1={svgPoints[svgPoints.length - 1].x}
          y1={svgPoints[svgPoints.length - 1].y}
          x2={svgPoints[0].x}
          y2={svgPoints[0].y}
          stroke={DERIVED_COLOR} strokeWidth={1} strokeDasharray="4 2"
        />
      )}

      {/* Vertex dots */}
      {svgPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5}
          fill={i === 0 ? ACTIVE_COLOR : DEFAULT_COLOR} />
      ))}
    </svg>
  );
}
