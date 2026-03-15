"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Camera, Loader2, Upload } from "lucide-react";
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
}: {
  walls: { length: string; normalCorner: boolean }[];
  committedCount?: number;
  nextDir?: number;
}) {
  const { vertices, closed, gapX, gapY } = buildVertices(walls);
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
  const PAD = 32, SVG_W = 320, SVG_H = 200;
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
            fill="#1e3a5f18" stroke="none"
          />
        )}

        {/* Wall segments */}
        {vertices.slice(0, -1).map((v, i) => {
          const next = vertices[i + 1];
          const isCommitted = i < committed;
          const isCurrent = i === committed;
          return (
            <line key={i}
              x1={sx(v.x)} y1={sy(v.y)} x2={sx(next.x)} y2={sy(next.y)}
              stroke={closed ? "#1e3a5f" : isCommitted ? "#1e3a5f" : isCurrent ? "#f59e0b" : "#94a3b8"}
              strokeWidth={isCurrent ? 3 : isCommitted || closed ? 2.5 : 1.5}
              strokeDasharray={(!isCommitted && !isCurrent && !closed) ? "5,3" : undefined}
              strokeLinecap="round"
            />
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

        {/* Gap line: dashed red from last point back to start when not closed and 4+ walls */}
        {!closed && vertices.length >= 5 && (Math.abs(gapX) > 2 || Math.abs(gapY) > 2) && (() => {
          const lastV = vertices[vertices.length - 1];
          return (
            <line x1={sx(lastV.x)} y1={sy(lastV.y)} x2={sx(0)} y2={sy(0)}
              stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" opacity={0.5} />
          );
        })()}

        {/* Ghost: short fixed-pixel stub showing next wall direction */}
        {nextDir !== undefined && !closed && (() => {
          const lastV = vertices[vertices.length - 1];
          const stubLen = 20 / scale; // fixed 20px in SVG coords
          const gx = lastV.x + DX[nextDir] * stubLen;
          const gy = lastV.y + DY[nextDir] * stubLen;
          return (
            <g>
              <line x1={sx(lastV.x)} y1={sy(lastV.y)} x2={sx(gx)} y2={sy(gy)}
                stroke="#10b981" strokeWidth={3} strokeLinecap="round" />
              <circle cx={sx(gx)} cy={sy(gy)} r={4} fill="#10b981" />
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
  area: number;
  perimeter: number;
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
  const [isStep, setIsStep] = useState(false);
  const [roomName, setRoomName] = useState("");

  const previewWalls = [
    ...committed.map(w => ({ length: String(w.length), normalCorner: w.normalCorner })),
    ...(input ? [{ length: input, normalCorner: !isStep }] : []),
  ];

  const committedPreview = committed.map(w => ({ length: String(w.length), normalCorner: w.normalCorner }));
  const { closed: isDone } = buildVertices(committedPreview);

  const doneResult = isDone && committed.length >= 4
    ? calcWithTurns(committed.map(w => w.length), committed.map(w => w.normalCorner))
    : null;
  const isValid = !!doneResult && doneResult.area > 0;

  // Direction of the current wall being entered
  const currentWallDir = committed.reduce(
    (dir, w) => w.normalCorner ? (dir + 1) % 4 : (dir + 3) % 4, 0
  );
  const dirArrows = ["→", "↓", "←", "↑"];
  const nextDirNormal = (currentWallDir + 1) % 4;
  const nextDirStep  = (currentWallDir + 3) % 4;

  function digit(d: string) {
    if (isValid) return;
    setInput(p => p.length < 5 ? p + d : p);
  }

  function confirm() {
    const len = parseFloat(input);
    if (!len || len <= 0) return;
    setCommitted(prev => [...prev, { length: len, normalCorner: !isStep }]);
    setInput("");
    setIsStep(false);
  }

  function handleBack() {
    if (input) {
      setInput("");
      setIsStep(false);
    } else if (committed.length > 0) {
      setCommitted(prev => prev.slice(0, -1));
      setIsStep(false);
    }
  }

  function handleAdd() {
    if (!isValid || !doneResult) return;
    onDone({
      id: crypto.randomUUID(),
      name: roomName,
      walls: committed.map(w => w.length),
      area: doneResult.area,
      perimeter: doneResult.perimeter,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white flex flex-col overflow-hidden w-full sm:max-w-sm sm:rounded-2xl sm:shadow-2xl"
        style={{ height: "100dvh", maxHeight: "100dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button onClick={onCancel} className="p-1 -ml-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">
            {isValid ? "✓ Готово" : `Стена ${committed.length + 1}`}
          </span>
          <button
            onClick={handleBack}
            disabled={committed.length === 0 && !input}
            className="text-xs text-muted-foreground disabled:opacity-30 px-1"
          >
            ← Назад
          </button>
        </div>

        {/* SVG Preview */}
        <div className="shrink-0 px-3 pt-3" style={{ height: 210 }}>
          <RoomPreview
            walls={previewWalls}
            committedCount={committed.length}
            nextDir={isStep ? (currentWallDir + 3) % 4 : (currentWallDir + 1) % 4}
          />
          {/* Gap hint */}
          {(() => {
            const preview = committed.map(w => ({ length: String(w.length), normalCorner: w.normalCorner }));
            const { closed: c, gapX: gx, gapY: gy } = buildVertices(preview);
            if (c || committed.length < 4) return null;
            const parts: string[] = [];
            if (Math.abs(gx) > 2) parts.push(`${Math.abs(Math.round(gx))} см ${gx > 0 ? "←" : "→"}`);
            if (Math.abs(gy) > 2) parts.push(`${Math.abs(Math.round(gy))} см ${gy > 0 ? "↑" : "↓"}`);
            if (parts.length === 0) return null;
            return (
              <p className="text-xs text-center text-red-500 mt-1">
                Не сходится: нужно ещё {parts.join(" и ")}
              </p>
            );
          })()}
        </div>

        {isValid && doneResult ? (
          /* Done */
          <div className="shrink-0 p-4 space-y-3 border-t">
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
            <button
              onClick={handleAdd}
              className="w-full rounded-xl bg-[#1e3a5f] py-3.5 text-base font-semibold text-white active:bg-[#152d4a]"
            >
              Добавить помещение
            </button>
          </div>
        ) : (
          /* Input */
          <div className="shrink-0 border-t">
            {/* Big number display */}
            <div className="flex items-baseline justify-center gap-2 py-3">
              <span className="text-6xl font-bold tabular-nums text-[#1e3a5f]">
                {input || "0"}
              </span>
              <span className="text-xl text-muted-foreground">см</span>
            </div>

            {/* Corner selector */}
            <div className="px-3 pb-2 space-y-1">
              <p className="text-xs text-center text-muted-foreground">
                Сейчас идём {dirArrows[currentWallDir]} — выберите угол после этой стены:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIsStep(false)}
                  className={`rounded-xl py-2.5 text-sm font-semibold border-2 transition-all flex flex-col items-center gap-0.5 ${
                    !isStep ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  <span className="text-base">┐</span>
                  <span>обычный</span>
                  <span className={`text-xs ${!isStep ? "opacity-70" : "opacity-50"}`}>дальше {dirArrows[nextDirNormal]}</span>
                </button>
                <button
                  onClick={() => setIsStep(true)}
                  className={`rounded-xl py-2.5 text-sm font-semibold border-2 transition-all flex flex-col items-center gap-0.5 ${
                    isStep ? "bg-amber-500 text-white border-amber-500" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  <span className="text-base">↙</span>
                  <span>ступенька</span>
                  <span className={`text-xs ${isStep ? "opacity-70" : "opacity-50"}`}>дальше {dirArrows[nextDirStep]}</span>
                </button>
              </div>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 border-t select-none">
              {(["1","2","3","4","5","6","7","8","9"] as const).map(d => (
                <button
                  key={d}
                  onPointerDown={() => digit(d)}
                  className="py-5 text-3xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100"
                >
                  {d}
                </button>
              ))}
              <button
                onPointerDown={() => {
                  if (input) {
                    setInput(p => p.slice(0, -1));
                  } else if (committed.length > 0) {
                    setCommitted(prev => prev.slice(0, -1));
                    setIsStep(false);
                  }
                }}
                className="py-5 text-2xl text-center border-b border-r border-gray-100 active:bg-red-50 text-muted-foreground">
                ⌫
              </button>
              <button onPointerDown={() => digit("0")}
                className="py-5 text-3xl font-medium text-center border-b border-r border-gray-100 active:bg-gray-100">
                0
              </button>
              <button
                onPointerDown={confirm}
                disabled={!input || parseFloat(input) <= 0}
                className="py-5 text-3xl font-bold bg-[#1e3a5f] text-white border-b active:bg-[#152d4a] disabled:opacity-30"
              >
                ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Room Card
// ─────────────────────────────────────────────────────

function RoomCard({ room, index, onRemove }: {
  room: Room;
  index: number;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-4">
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
        <button onClick={onRemove}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showWizard, setShowWizard] = useState(false);

  const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const totalPerimeter = Math.round(rooms.reduce((s, r) => s + r.perimeter, 0) * 100) / 100;

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

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Замеры</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Введите стены каждого помещения — площадь и периметр рассчитаются автоматически
          </p>
        </div>

        <PhotoUpload onRoomsLoaded={loaded => setRooms(prev => [...prev, ...loaded])} />

        {rooms.length > 0 && (
          <div className="space-y-3">
            {rooms.map((room, i) => (
              <RoomCard
                key={room.id}
                room={room}
                index={i}
                onRemove={() => setRooms(prev => prev.filter(r => r.id !== room.id))}
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
              <button onClick={handleCreateEstimate}
                className="rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#152d4a]">
                Создать КП →
              </button>
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
