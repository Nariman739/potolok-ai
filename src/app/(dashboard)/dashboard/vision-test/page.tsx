"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Camera, Loader2, Upload, History, ChevronRight } from "lucide-react";
import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";
import type { MultiAgentResult } from "@/lib/vision-agents";

// ─────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

function calcWithTurns(
  lengths: number[],
  normalCorners: boolean[]
): { area: number; perimeter: number } {
  const n = lengths.length;
  if (n < 4) return { area: 0, perimeter: 0 };
  const perimeter = Math.round(lengths.reduce((s, w) => s + w, 0)) / 100;
  const reflex = new Set<number>();
  normalCorners.forEach((normal, i) => { if (!normal) reflex.add((i + 1) % n); });
  let x = 0, y = 0, dir = 0;
  const v: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    v.push({ x, y });
    x += DX[dir] * lengths[i];
    y += DY[dir] * lengths[i];
    dir = reflex.has((i + 1) % n) ? (dir + 3) % 4 : (dir + 1) % 4;
  }
  if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return { area: 0, perimeter };
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += v[i].x * v[j].y - v[j].x * v[i].y;
  }
  return { area: Math.round(Math.abs(sum) / 2 / 100) / 100, perimeter };
}

// ─────────────────────────────────────────────────────
// SVG Preview
// ─────────────────────────────────────────────────────

interface Vertex { x: number; y: number }

function buildVertices(walls: { length: string; normalCorner: boolean }[]): {
  vertices: Vertex[];
  closed: boolean;
  gapX: number;
  gapY: number;
} {
  const n = walls.length;
  const reflex = new Set<number>();
  walls.forEach((w, i) => { if (!w.normalCorner) reflex.add((i + 1) % n); });
  let x = 0, y = 0, dir = 0;
  const vertices: Vertex[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < n; i++) {
    const len = parseFloat(walls[i].length);
    if (!len || len <= 0) break;
    x += DX[dir] * len;
    y += DY[dir] * len;
    vertices.push({ x, y });
    dir = reflex.has((i + 1) % n) ? (dir + 3) % 4 : (dir + 1) % 4;
  }
  const closed = vertices.length === n + 1 && Math.abs(x) < 2 && Math.abs(y) < 2;
  return { vertices, closed, gapX: x, gapY: y };
}

function RoomPreview({
  walls,
  committedCount,
  nextDir,
  onWallClick,
  activeWallIdx,
  forceClose,
}: {
  walls: { length: string; normalCorner: boolean }[];
  committedCount?: number;
  nextDir?: number;
  onWallClick?: (i: number) => void;
  activeWallIdx?: number;
  forceClose?: boolean;
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

        {/* Wall segments */}
        {vertices.slice(0, -1).map((v, i) => {
          const next = vertices[i + 1];
          const isCommitted = i < committed;
          const isCurrent = i === committed;
          const isActive = activeWallIdx === i;
          return (
            <g key={i}>
              <line
                x1={sx(v.x)} y1={sy(v.y)} x2={sx(next.x)} y2={sy(next.y)}
                stroke={isActive ? "#f59e0b" : closed ? "#1e3a5f" : isCommitted ? "#1e3a5f" : isCurrent ? "#f59e0b" : "#94a3b8"}
                strokeWidth={isActive ? 5 : isCurrent ? 5 : isCommitted || closed ? 2.5 : 1.5}
                strokeDasharray={(!isCommitted && !isCurrent && !closed) ? "5,3" : undefined}
                strokeLinecap="round"
              />
              {/* Wide invisible tap target */}
              {onWallClick && (
                <line
                  x1={sx(v.x)} y1={sy(v.y)} x2={sx(next.x)} y2={sy(next.y)}
                  stroke="transparent" strokeWidth={24} strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  onPointerDown={() => onWallClick(i)}
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
          return (
            <g key={i}>
              <rect x={mx - 14} y={my - 9} width={28} height={16} rx={3}
                fill={isCurrent ? "#fef3c7" : "white"} fillOpacity={0.92} />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fontFamily="monospace"
                fill={closed ? "#1e3a5f" : isCurrent ? "#92400e" : "#64748b"} fontWeight="600">
                {len > 0 ? len : "?"}
              </text>
            </g>
          );
        })}


        {/* Direction stub — always yellow, grows when user types */}
        {nextDir !== undefined && !closed && (() => {
          const lastV = vertices[vertices.length - 1];
          const stubLen = 28 / scale;
          const gx = lastV.x + DX[nextDir] * stubLen;
          const gy = lastV.y + DY[nextDir] * stubLen;
          return (
            <g>
              <line x1={sx(lastV.x)} y1={sy(lastV.y)} x2={sx(gx)} y2={sy(gy)}
                stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" strokeDasharray="6,3" />
              <circle cx={sx(gx)} cy={sy(gy)} r={5} fill="#f59e0b" />
            </g>
          );
        })()}

        {/* Vertices dots */}
        {vertices.map((v, i) => (
          <circle key={i} cx={sx(v.x)} cy={sy(v.y)} r={i === 0 ? 5 : 3}
            fill={i === 0 ? "#1e3a5f" : closed ? "#1e3a5f" : i <= committed ? "#1e3a5f" : "#94a3b8"} />
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface Room {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[];
  area: number;
  perimeter: number;
}

interface SavedObject {
  id: string;
  address: string;
  rooms: Room[];
  totalArea: number;
  savedAt: number;
}

// ─────────────────────────────────────────────────────
// Wall Wizard — full-screen numpad
// ─────────────────────────────────────────────────────

function WallWizard({ onDone, onCancel }: {
  onDone: (room: Room) => void;
  onCancel: () => void;
}) {
  const [committed, setCommitted] = useState<{ length: number; normalCorner: boolean }[]>([]);
  const [input, setInput] = useState("");
  const [roomName, setRoomName] = useState("");

  const previewWalls = [
    ...committed.map(w => ({ length: String(w.length), normalCorner: w.normalCorner })),
    ...(input ? [{ length: input, normalCorner: true }] : []),
  ];

  const committedPreview = committed.map(w => ({ length: String(w.length), normalCorner: w.normalCorner }));
  const { closed: isDone, vertices: committedVerts, gapX, gapY } = buildVertices(committedPreview);
  const gap = Math.sqrt(gapX * gapX + gapY * gapY);

  const doneResult = isDone && committed.length >= 4
    ? calcWithTurns(committed.map(w => w.length), committed.map(w => w.normalCorner))
    : null;
  const isValid = !!doneResult && doneResult.area > 0;

  const approxResult = !isValid && committed.length >= 4 && gap < 30 && committedVerts.length >= 4 ? (() => {
    let sum = 0;
    for (let i = 0; i < committedVerts.length; i++) {
      const j = (i + 1) % committedVerts.length;
      sum += committedVerts[i].x * committedVerts[j].y - committedVerts[j].x * committedVerts[i].y;
    }
    const area = Math.round(Math.abs(sum) / 2 / 100) / 100;
    const perimeter = Math.round(committed.reduce((s, w) => s + w.length, 0)) / 100;
    return area > 0 ? { area, perimeter, gap } : null;
  })() : null;

  const gapParts: string[] = [];
  if (committed.length >= 4 && !isDone && gap >= 5) {
    if (Math.abs(gapX) > 2) gapParts.push(`${Math.abs(Math.round(gapX))} см ${gapX > 0 ? "влево" : "вправо"}`);
    if (Math.abs(gapY) > 2) gapParts.push(`${Math.abs(Math.round(gapY))} см ${gapY > 0 ? "вверх" : "вниз"}`);
  }

  // Direction tracking
  const currentWallDir = committed.reduce(
    (dir, w) => w.normalCorner ? (dir + 1) % 4 : (dir + 3) % 4, 0
  );
  const dirArrows = ["→", "↓", "←", "↑"];
  const nextDir = (currentWallDir + 1) % 4;
  // Whether last committed wall has a step corner
  const lastIsStep = committed.length > 0 && !committed[committed.length - 1].normalCorner;

  function digit(d: string) {
    if (isValid) return;
    setInput(p => p.length < 5 ? p + d : p);
  }

  function confirm() {
    const len = parseFloat(input);
    if (!len || len <= 0) return;
    // Always auto-commit with normal corner — user can toggle with ступенька button
    setCommitted(prev => [...prev, { length: len, normalCorner: true }]);
    setInput("");
  }

  // Toggle last committed wall between normal and step corner
  function toggleLastStep() {
    if (committed.length === 0 || isValid) return;
    setCommitted(prev => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, normalCorner: !last.normalCorner }];
    });
  }

  function handleBack() {
    if (input) {
      setInput(p => p.slice(0, -1));
    } else if (committed.length > 0) {
      setCommitted(prev => prev.slice(0, -1));
    }
  }

  function handleForceFinish() {
    if (committed.length < 4) return;
    let sum = 0;
    for (let i = 0; i < committedVerts.length; i++) {
      const j = (i + 1) % committedVerts.length;
      sum += committedVerts[i].x * committedVerts[j].y - committedVerts[j].x * committedVerts[i].y;
    }
    const area = Math.round(Math.abs(sum) / 2 / 100) / 100;
    const perimeter = Math.round(committed.reduce((s, w) => s + w.length, 0)) / 100;
    if (area <= 0) return;
    onDone({
      id: crypto.randomUUID(),
      name: roomName,
      walls: committed.map(w => w.length),
      normalCorners: committed.map(w => w.normalCorner),
      area,
      perimeter,
    });
  }

  function handleAdd() {
    const result = doneResult ?? approxResult;
    if (!result) return;
    onDone({
      id: crypto.randomUUID(),
      name: roomName,
      walls: committed.map(w => w.length),
      normalCorners: committed.map(w => w.normalCorner),
      area: result.area,
      perimeter: result.perimeter,
    });
  }

  const headerText = isValid ? "✓ Готово" : approxResult ? "~ Приблизительно" : `Стена ${committed.length + 1}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div
        className="bg-white flex flex-col overflow-hidden w-full sm:max-w-sm sm:rounded-2xl sm:shadow-2xl"
        style={{ height: "100svh", maxHeight: "100svh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button onClick={onCancel} className="p-1 -ml-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">{headerText}</span>
          <button
            onClick={handleBack}
            disabled={committed.length === 0 && !input}
            className="text-xs text-muted-foreground disabled:opacity-30 px-1"
          >
            ← Назад
          </button>
        </div>

        {(isValid && doneResult) || approxResult ? (
          /* ── Done: всё скроллится ── */
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Превью комнаты — фиксированная высота */}
            <div className="px-3 pt-2 pb-2" style={{ height: "40svh" }}>
              <RoomPreview
                walls={previewWalls}
                committedCount={committed.length}
                nextDir={undefined}
                forceClose={!!approxResult}
              />
            </div>
            {!isValid && gapParts.length > 0 && (
              <p className={`text-xs text-center ${gap < 30 ? "text-amber-600" : "text-red-500"}`}>
                {gap < 30
                  ? `Погрешность ${Math.round(gap)} см — можно принять`
                  : `Не сходится: ${gapParts.join(" и ")}`}
              </p>
            )}
            {/* Результаты */}
            <div className="p-4 pb-20 space-y-3 border-t">
            {!isValid && approxResult && (
              <p className="text-xs text-center text-amber-600 font-medium">
                ⚠ Погрешность {Math.round(approxResult.gap)} см — результат приблизительный
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 p-4 text-center">
                <div className="text-4xl font-bold text-blue-600">{(doneResult ?? approxResult)!.area}</div>
                <div className="text-xs text-muted-foreground mt-1">м² площадь</div>
              </div>
              <div className="rounded-xl bg-purple-50 p-4 text-center">
                <div className="text-4xl font-bold text-purple-600">{(doneResult ?? approxResult)!.perimeter}</div>
                <div className="text-xs text-muted-foreground mt-1">м периметр</div>
              </div>
            </div>
            <input
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Название: зал, спальня, кухня..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
            />
            <button onClick={handleAdd}
              className={`w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 ${
                isValid ? "bg-[#1e3a5f]" : "bg-amber-500"
              }`}>
              {isValid ? "Добавить помещение" : "Принять приблизительно"}
            </button>
          </div>
          </div>

        ) : (
          /* ── Numpad ── */
          <>
          {/* Превью комнаты — заполняет всё свободное место */}
          <div className="flex-1 min-h-0 px-3 pt-2 pb-2">
            <RoomPreview
              walls={previewWalls}
              committedCount={committed.length}
              nextDir={nextDir}
              forceClose={false}
            />
          </div>
          <div className="shrink-0 border-t">
            {/* Direction + Ступенька toggle */}
            {committed.length > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-gray-50">
                <span className="text-xs text-muted-foreground">
                  Следующая стена {dirArrows[nextDir]}
                </span>
                <button
                  onPointerDown={toggleLastStep}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors active:scale-95 ${
                    lastIsStep
                      ? "bg-amber-100 border-amber-400 text-amber-700 font-semibold"
                      : "border-gray-300 text-gray-500"
                  }`}>
                  {lastIsStep ? "↙ Ступенька ✓" : "↙ Ступенька?"}
                </button>
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
                <button key={d} onPointerDown={() => digit(d)}
                  className="py-2.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                  {d}
                </button>
              ))}
              <button
                onPointerDown={() => {
                  if (input) setInput(p => p.slice(0, -1));
                  else if (committed.length > 0) setCommitted(prev => prev.slice(0, -1));
                }}
                className="py-2.5 text-xl text-center border-b border-r border-gray-100 active:bg-red-50 text-muted-foreground">
                ⌫
              </button>
              <button onPointerDown={() => digit("0")}
                className="py-2.5 text-2xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                0
              </button>
              <button onPointerDown={confirm}
                disabled={!input || parseFloat(input) <= 0}
                className="py-2.5 text-2xl font-bold bg-[#1e3a5f] text-white border-b active:bg-[#152d4a] disabled:opacity-30">
                ✓
              </button>
            </div>

            {committed.length >= 4 && !isValid && (
              <button onPointerDown={handleForceFinish}
                className="w-full py-3 text-sm font-semibold text-[#1e3a5f] border-t active:bg-blue-50">
                Завершить комнату ({committed.length} стен) →
              </button>
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

function RoomCard({ room, index, onRemove, onView }: {
  room: Room;
  index: number;
  onRemove: () => void;
  onView: () => void;
}) {
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
          </div>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="text-2xl font-bold text-blue-600">{room.area} м²</span>
            <span className="text-sm font-medium text-purple-600">P = {room.perimeter} м</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono">
            {room.walls.join(" · ")} см
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
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

  const normalCorners = room.normalCorners;
  const previewWalls = walls.map((l, i) => ({
    length: String(l),
    normalCorner: normalCorners[i] ?? true,
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

  function shoelace(w: number[], nc: boolean[]) {
    const { vertices } = buildVertices(w.map((l, i) => ({ length: String(l), normalCorner: nc[i] ?? true })));
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
    const res = shoelace(walls, normalCorners);
    onUpdate({ ...room, walls, area: res.area, perimeter: res.perimeter });
    onClose();
  }

  const result = shoelace(walls, normalCorners);

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
        <RoomPreview
          walls={previewWalls}
          onWallClick={i => startEdit(i)}
          activeWallIdx={editingIdx ?? undefined}
        />
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
            return (
              <div key={obj.id} className="rounded-xl border p-4 flex items-center gap-3">
                <button className="flex-1 min-w-0 text-left" onClick={() => onResume(obj)}>
                  <div className="font-medium truncate">{obj.address || "Без адреса"}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {obj.rooms.length} помещ. · <span className="font-semibold text-blue-600">{obj.totalArea} м²</span> · {date}
                  </div>
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" onClick={() => onResume(obj)} />
                <button
                  onClick={() => onDelete(obj.id)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
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
  const [rooms, setRooms] = useState<Room[]>(() => {
    try { return JSON.parse(localStorage.getItem("zamery-rooms") ?? "[]"); } catch { return []; }
  });
  const [objectName, setObjectName] = useState<string>(() => {
    try { return localStorage.getItem("zamery-object") ?? ""; } catch { return ""; }
  });
  const [savedObjects, setSavedObjects] = useState<SavedObject[]>(() => {
    try { return JSON.parse(localStorage.getItem("zamery-saved") ?? "[]"); } catch { return []; }
  });
  const [showWizard, setShowWizard] = useState(false);
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem("zamery-rooms", JSON.stringify(rooms));
  }, [rooms]);

  useEffect(() => {
    localStorage.setItem("zamery-object", objectName);
  }, [objectName]);

  useEffect(() => {
    localStorage.setItem("zamery-saved", JSON.stringify(savedObjects));
  }, [savedObjects]);

  function handleSaveObject() {
    if (rooms.length === 0) return;
    const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
    const obj: SavedObject = {
      id: crypto.randomUUID(),
      address: objectName,
      rooms,
      totalArea,
      savedAt: Date.now(),
    };
    setSavedObjects(prev => [...prev, obj]);
    setRooms([]);
    setObjectName("");
  }

  function handleResume(obj: SavedObject) {
    if (rooms.length > 0) {
      if (!confirm("Заменить текущие замеры на этот объект?")) return;
    }
    setRooms(obj.rooms);
    setObjectName(obj.address);
    setSavedObjects(prev => prev.filter(o => o.id !== obj.id));
    setShowHistory(false);
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

  function handleCreateEstimate() {
    const roomInputs: RoomInput[] = rooms.map(room => {
      const l = room.walls.length === 4 ? room.walls[0] / 100 : Math.sqrt(room.area);
      const w = room.walls.length === 4
        ? room.walls[1] / 100
        : Math.round((room.area / Math.max(l, 0.1)) * 100) / 100;
      return {
        id: crypto.randomUUID(),
        name: room.name || "Помещение",
        length: Math.round(l * 100) / 100,
        width: Math.round(w * 100) / 100,
        ceilingHeight: 2.7,
        canvasType: "matte" as CanvasType,
        spotsCount: 0, chandelierCount: 0, chandelierInstallCount: 0,
        trackMagneticLength: 0, lightLineLength: 0, curtainRodLength: 0,
        pipeBypasses: 0, cornersCount: room.walls.length, eurobrusCount: 0,
        gardinaLength: 0, podshtornikLength: 0,
        shape: room.walls.length === 4 ? "rectangle" : undefined,
      } satisfies RoomInput;
    });
    localStorage.setItem("vision-rooms", JSON.stringify(roomInputs));
    router.push("/dashboard/calculator?from=vision");
  }

  return (
    <>
      {showWizard && (
        <WallWizard
          onDone={room => { setRooms(prev => [...prev, room]); setShowWizard(false); }}
          onCancel={() => setShowWizard(false)}
        />
      )}
      {viewingRoom && (
        <RoomDetail
          room={viewingRoom}
          onUpdate={updated => {
            setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
            setViewingRoom(null);
          }}
          onClose={() => setViewingRoom(null)}
        />
      )}
      {showHistory && (
        <HistoryDrawer
          saved={savedObjects}
          onResume={handleResume}
          onDelete={id => setSavedObjects(prev => prev.filter(o => o.id !== id))}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Замеры</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Введите стены каждого помещения — площадь и периметр рассчитаются автоматически
            </p>
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="shrink-0 mt-1 flex items-center gap-1.5 text-xs text-muted-foreground border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors">
            <History className="h-3.5 w-3.5" />
            {savedObjects.length > 0 ? `История (${savedObjects.length})` : "История"}
          </button>
        </div>

        <input
          value={objectName}
          onChange={e => setObjectName(e.target.value)}
          placeholder="Адрес объекта (необязательно)"
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        <PhotoUpload onRoomsLoaded={loaded => setRooms(prev => [...prev, ...loaded])} />

        {rooms.length > 0 && (
          <div className="space-y-3">
            {rooms.map((room, i) => (
              <RoomCard
                key={room.id}
                room={room}
                index={i}
                onRemove={() => setRooms(prev => prev.filter(r => r.id !== room.id))}
                onView={() => setViewingRoom(room)}
              />
            ))}
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

        <button
          onClick={() => setShowWizard(true)}
          className="w-full rounded-xl border-2 border-dashed py-5 text-sm font-medium text-[#1e3a5f] hover:bg-blue-50 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {rooms.length === 0 ? "Добавить первое помещение" : "Добавить помещение"}
        </button>
      </div>
    </>
  );
}
