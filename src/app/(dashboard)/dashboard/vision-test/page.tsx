"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Camera, Loader2, Upload } from "lucide-react";
import type { RoomInput } from "@/lib/types";
import type { CanvasType } from "@/lib/constants";
import type { MultiAgentResult } from "@/lib/vision-agents";

// ─────────────────────────────────────────────────────
// Geometry
// Правило: идём по часовой стрелке.
//   normalCorner = true  → правый поворот  (обычный угол)
//   normalCorner = false → левый поворот   (ступенька / выступ внутрь)
// ─────────────────────────────────────────────────────

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

function calcWithTurns(
  lengths: number[],
  normalCorners: boolean[]
): { area: number; perimeter: number } {
  const n = lengths.length;
  if (n < 4) return { area: 0, perimeter: 0 };

  const perimeter = Math.round(lengths.reduce((s, w) => s + w, 0)) / 100;

  // Build reflex set: vertex AFTER wall i is reflex when !normalCorners[i]
  const reflex = new Set<number>();
  normalCorners.forEach((normal, i) => {
    if (!normal) reflex.add((i + 1) % n);
  });

  // Walk the polygon
  let x = 0, y = 0, dir = 0;
  const v: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    v.push({ x, y });
    x += DX[dir] * lengths[i];
    y += DY[dir] * lengths[i];
    dir = reflex.has((i + 1) % n) ? (dir + 3) % 4 : (dir + 1) % 4;
  }

  // Must close
  if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return { area: 0, perimeter };

  // Shoelace
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += v[i].x * v[j].y - v[j].x * v[i].y;
  }
  const area = Math.round(Math.abs(sum) / 2 / 100) / 100;
  return { area, perimeter };
}

// ─────────────────────────────────────────────────────
// Live polygon preview
// ─────────────────────────────────────────────────────

interface Vertex { x: number; y: number }

function buildVertices(walls: { length: string; normalCorner: boolean }[]): {
  vertices: Vertex[];
  closed: boolean;
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

  const closed = vertices.length === n + 1 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5;
  return { vertices, closed };
}

function RoomPreview({ walls }: { walls: { length: string; normalCorner: boolean }[] }) {
  const { vertices, closed } = buildVertices(walls);
  if (vertices.length < 2) return null;

  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = maxX - minX || 1, H = maxY - minY || 1;

  const PAD = 28, SVG_W = 300, SVG_H = 200;
  const scale = Math.min((SVG_W - PAD * 2) / W, (SVG_H - PAD * 2) / H);

  const sx = (x: number) => PAD + (x - minX) * scale;
  const sy = (y: number) => PAD + (y - minY) * scale;

  const pts = vertices.map(v => `${sx(v.x)},${sy(v.y)}`).join(" ");

  return (
    <div className="rounded-lg border bg-gray-50 overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
        {/* Fill when closed */}
        {closed && (
          <polygon points={pts} fill="#1e3a5f18" stroke="#1e3a5f" strokeWidth={2} strokeLinejoin="round" />
        )}
        {/* Partial path */}
        {!closed && (
          <polyline points={pts} fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" strokeDasharray="6,3" />
        )}
        {/* Wall midpoint labels */}
        {vertices.slice(0, -1).map((v, i) => {
          const next = vertices[i + 1];
          const mx = sx((v.x + next.x) / 2);
          const my = sy((v.y + next.y) / 2);
          const len = parseFloat(walls[i]?.length) || 0;
          return (
            <g key={i}>
              <rect x={mx - 14} y={my - 9} width={28} height={16} rx={3} fill="white" fillOpacity={0.85} />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fontFamily="monospace"
                fill={closed ? "#1e3a5f" : "#64748b"} fontWeight="500">
                {len > 0 ? len : "?"}
              </text>
            </g>
          );
        })}
        {/* Start point dot */}
        <circle cx={sx(0)} cy={sy(0)} r={4} fill="#1e3a5f" />
        {/* Wall numbers on dots */}
        {vertices.map((v, i) => (
          <circle key={i} cx={sx(v.x)} cy={sy(v.y)} r={3}
            fill={i === 0 ? "#1e3a5f" : closed ? "#1e3a5f" : "#94a3b8"}
          />
        ))}
      </svg>
      <div className={`px-3 py-1.5 text-xs font-medium text-center ${closed ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
        {closed ? "✓ Фигура замкнута" : `${vertices.length - 1} из ${walls.length} стен введено`}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface WallInput {
  length: string;
  normalCorner: boolean; // угол ПОСЛЕ этой стены
}

interface Room {
  id: string;
  name: string;
  walls: number[];
  area: number;
  perimeter: number;
}

function defaultWalls(n = 4): WallInput[] {
  return Array.from({ length: n }, () => ({ length: "", normalCorner: true }));
}

// ─────────────────────────────────────────────────────
// Corner Toggle Button
// ─────────────────────────────────────────────────────

function CornerToggle({
  normal,
  onToggle,
}: {
  normal: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={normal ? "Обычный угол — нажмите чтобы изменить на ступеньку" : "Ступенька — нажмите чтобы изменить на обычный"}
      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
        normal
          ? "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
          : "bg-amber-50 text-amber-700 border-amber-400 font-semibold"
      }`}
    >
      {normal ? "┐ обычный" : "┘ ступенька"}
    </button>
  );
}

// ─────────────────────────────────────────────────────
// Room Form
// ─────────────────────────────────────────────────────

function RoomForm({
  onAdd,
  onCancel,
}: {
  onAdd: (room: Room) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [walls, setWalls] = useState<WallInput[]>(defaultWalls(4));

  const validLengths = walls.map((w) => parseFloat(w.length)).filter((n) => n > 0);
  const allFilled = walls.every((w) => parseFloat(w.length) > 0);
  const normalCorners = walls.map((w) => w.normalCorner);
  const result = allFilled && validLengths.length === walls.length
    ? calcWithTurns(validLengths, normalCorners)
    : null;

  const stepCount = walls.filter((w) => !w.normalCorner).length;

  function setWallLength(i: number, val: string) {
    setWalls((prev) => prev.map((w, idx) => idx === i ? { ...w, length: val } : w));
  }

  function toggleCorner(i: number) {
    setWalls((prev) => prev.map((w, idx) => idx === i ? { ...w, normalCorner: !w.normalCorner } : w));
  }

  function addWall() {
    setWalls((prev) => [...prev, { length: "", normalCorner: true }]);
  }

  function removeWall(i: number) {
    if (walls.length <= 4) return;
    setWalls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleAdd() {
    if (!result || result.area === 0) return;
    const lengths = walls.map((w) => parseFloat(w.length));
    onAdd({
      id: crypto.randomUUID(),
      name,
      walls: lengths,
      area: result.area,
      perimeter: result.perimeter,
    });
  }

  return (
    <div className="space-y-5">
      {/* Название */}
      <div>
        <label className="text-sm font-medium">Название (необязательно)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Зал, Спальня, Кухня..."
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      {/* Live preview */}
      <RoomPreview walls={walls} />

      {/* Подсказка */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-1.5">
        <p className="text-sm font-medium text-blue-800">Как заполнять:</p>
        <p className="text-sm text-blue-700">
          Обойдите комнату <strong>по часовой стрелке</strong>, начиная с верхней стены.
          Введите длину каждой стены в <strong>сантиметрах</strong>.
        </p>
        <p className="text-sm text-blue-700">
          Угол по умолчанию — <strong>┐ обычный</strong>.
          Если в углу есть <strong>выступ или ступенька</strong> — нажмите и смените на <strong>┘ ступенька</strong>.
        </p>
      </div>

      {/* Стены */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-2 text-xs text-muted-foreground px-1">
          <span>Длина стены (см)</span>
          <span className="text-right pr-8">Угол после стены</span>
        </div>

        {walls.map((wall, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">{i + 1}</span>
            <input
              type="number"
              value={wall.length}
              onChange={(e) => setWallLength(i, e.target.value)}
              placeholder="0"
              min="1"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <CornerToggle normal={wall.normalCorner} onToggle={() => toggleCorner(i)} />
            <button
              onClick={() => removeWall(i)}
              disabled={walls.length <= 4}
              className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Статус */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{walls.length} стен{stepCount > 0 ? `, ${stepCount} ступенька` : ""}</span>
        <button
          onClick={addWall}
          className="text-[#1e3a5f] font-medium flex items-center gap-1 hover:underline text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить стену
        </button>
      </div>

      {/* Результат */}
      {result && result.area > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-blue-50 p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{result.area}</div>
            <div className="text-xs text-muted-foreground mt-1">м² площадь</div>
          </div>
          <div className="rounded-xl bg-purple-50 p-4 text-center">
            <div className="text-3xl font-bold text-purple-600">{result.perimeter}</div>
            <div className="text-xs text-muted-foreground mt-1">м периметр</div>
          </div>
        </div>
      )}

      {result && result.area === 0 && allFilled && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Стены не сходятся. Проверьте цифры или типы углов (обычный / ступенька).
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={!result || result.area === 0}
          className="flex-1 rounded-lg bg-[#1e3a5f] py-2.5 text-sm font-medium text-white hover:bg-[#152d4a] disabled:opacity-40 transition-colors"
        >
          Добавить помещение
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition-colors"
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Room Card
// ─────────────────────────────────────────────────────

function RoomCard({
  room,
  index,
  onRemove,
}: {
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
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
// Photo Upload Section
// ─────────────────────────────────────────────────────

function PhotoUpload({ onRoomsLoaded }: { onRoomsLoaded: (rooms: Room[]) => void }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Выберите изображение");
      return;
    }
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
        if (!res.ok || data.error) {
          setError(data.error || "Ошибка распознавания");
          return;
        }
        if (data.rooms.length === 0) {
          setError("Комнаты не найдены. Попробуйте другое фото или добавьте вручную.");
          return;
        }
        const loaded: Room[] = data.rooms.map((r) => ({
          id: crypto.randomUUID(),
          name: r.name,
          walls: r.walls_cm,
          area: r.area,
          perimeter: r.perimeter,
        }));
        onRoomsLoaded(loaded);
        setPreview(null);
      } catch {
        setError("Ошибка соединения");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-blue-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">Сканировать фото замеров</p>
          <p className="text-xs text-blue-600">AI прочитает цифры со стен и заполнит комнаты автоматически</p>
        </div>
      </div>

      {preview && (
        <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border" />
      )}

      {scanning ? (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Распознаём комнаты...
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Загрузить фото
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

export default function ZameryPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showForm, setShowForm] = useState(true);

  const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const totalPerimeter = Math.round(rooms.reduce((s, r) => s + r.perimeter, 0) * 100) / 100;

  function handleCreateEstimate() {
    const roomInputs: RoomInput[] = rooms.map((room) => {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Замеры</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Введите стены каждого помещения — площадь и периметр рассчитаются автоматически
        </p>
      </div>

      {/* AI Photo Upload */}
      <PhotoUpload
        onRoomsLoaded={(loaded) => {
          setRooms((prev) => [...prev, ...loaded]);
          setShowForm(false);
        }}
      />

      {/* Комнаты */}
      {rooms.length > 0 && (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            <RoomCard
              key={room.id}
              room={room}
              index={i}
              onRemove={() => setRooms((prev) => prev.filter((r) => r.id !== room.id))}
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
            <button
              onClick={handleCreateEstimate}
              className="rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#152d4a]"
            >
              Создать КП →
            </button>
          </div>
        </div>
      )}

      {/* Форма */}
      {showForm ? (
        <div className="rounded-lg border p-5">
          <div className="font-semibold mb-5 text-base">
            {rooms.length === 0 ? "Добавьте первое помещение" : "Новое помещение"}
          </div>
          <RoomForm
            onAdd={(room) => { setRooms((prev) => [...prev, room]); setShowForm(false); }}
            onCancel={rooms.length > 0 ? () => setShowForm(false) : undefined}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-lg border-2 border-dashed py-4 text-sm text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Добавить помещение
        </button>
      )}
    </div>
  );
}
