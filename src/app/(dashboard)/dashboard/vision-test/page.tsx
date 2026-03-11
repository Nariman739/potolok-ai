"use client";

import { useState, useRef, useCallback } from "react";
import { compressImage } from "@/lib/compress-image";
import type { MultiAgentResult } from "@/lib/vision-agents";

// ─────────────────────────────────────────────────────
// Rectilinear polygon solver (client-side copy for manual testing)
// Same algorithm as server-side vision-agents.ts
// ─────────────────────────────────────────────────────

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function tryTurnSequence(
  walls: number[],
  reflexIndices: Set<number>
): number | null {
  const n = walls.length;
  let x = 0, y = 0, dir = 0;
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    vertices.push({ x, y });
    x += DX[dir] * walls[i];
    y += DY[dir] * walls[i];
    const nextVertex = (i + 1) % n;
    if (reflexIndices.has(nextVertex)) {
      dir = (dir + 3) % 4;
    } else {
      dir = (dir + 1) % 4;
    }
  }

  if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return null;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const area = Math.abs(sum) / 2;
  return area < 1 ? null : area;
}

function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  function gen(start: number, rem: number) {
    if (rem === 0) { result.push([...combo]); return; }
    for (let i = start; i <= n - rem; i++) {
      combo.push(i);
      gen(i + 1, rem - 1);
      combo.pop();
    }
  }
  gen(0, k);
  return result;
}

function solveArea(walls_cm: number[]): { area_m2: number; method: string } {
  const n = walls_cm.length;

  if (n < 3) return { area_m2: 0, method: "too few walls" };

  if (n === 4) {
    const a = walls_cm[0], b = walls_cm[1];
    return { area_m2: Math.round((a * b) / 100) / 100, method: `rectangle ${a}×${b}` };
  }

  if (n % 2 !== 0) return { area_m2: 0, method: `odd walls (${n}) — unsupported` };

  const numReflex = n / 2 - 2;
  if (numReflex <= 0) return { area_m2: 0, method: "no reflex vertices needed" };

  const combos = combinations(n, numReflex);
  const valid: { area: number; reflex: number[] }[] = [];

  for (const c of combos) {
    const area = tryTurnSequence(walls_cm, new Set(c));
    if (area !== null) valid.push({ area, reflex: c });
  }

  if (valid.length === 0) return { area_m2: 0, method: `no solution (${combos.length} tried)` };

  valid.sort((a, b) => b.area - a.area);
  return {
    area_m2: Math.round(valid[0].area / 100) / 100,
    method: valid.length === 1
      ? `unique, reflex=[${valid[0].reflex}]`
      : `${valid.length} solutions, largest, reflex=[${valid[0].reflex}]`,
  };
}

// ─────────────────────────────────────────────────────
// Manual Calculator Component
// ─────────────────────────────────────────────────────

function ManualCalculator() {
  const [wallsInput, setWallsInput] = useState("464, 246, 464, 246");
  const [calcResult, setCalcResult] = useState<{
    walls: number[];
    perimeter_m: number;
    area_m2: number;
    method: string;
    corners: number;
  } | null>(null);

  const calculate = useCallback(() => {
    const walls = wallsInput
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);

    if (walls.length < 3) return;

    const perimeter_m = Math.round(walls.reduce((s, w) => s + w, 0)) / 100;
    const { area_m2, method } = solveArea(walls);

    setCalcResult({ walls, perimeter_m, area_m2, method, corners: walls.length });
  }, [wallsInput]);

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h2 className="text-lg font-bold">Ручной калькулятор</h2>
      <p className="text-sm text-muted-foreground">
        Введите стены в сантиметрах через запятую, по часовой стрелке (все углы = 90°)
      </p>

      <div className="space-y-2">
        <textarea
          value={wallsInput}
          onChange={(e) => setWallsInput(e.target.value)}
          className="w-full rounded-lg border p-3 text-sm font-mono"
          rows={2}
          placeholder="464, 246, 464, 246"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={calculate}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Посчитать
          </button>
          <button
            onClick={() => setWallsInput("464, 246, 464, 246")}
            className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
          >
            Прямоугольник
          </button>
          <button
            onClick={() => setWallsInput("340, 105, 139, 134, 201, 239")}
            className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
          >
            Г-образная (6)
          </button>
          <button
            onClick={() => setWallsInput("500, 200, 150, 100, 200, 100, 150, 200")}
            className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
          >
            П-образная (8)
          </button>
        </div>
      </div>

      {calcResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {calcResult.area_m2}
              </div>
              <div className="text-xs text-muted-foreground">м²</div>
            </div>
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {calcResult.perimeter_m}
              </div>
              <div className="text-xs text-muted-foreground">м периметр</div>
            </div>
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {calcResult.corners}
              </div>
              <div className="text-xs text-muted-foreground">углов</div>
            </div>
          </div>
          <div className="text-sm">
            <span className="font-medium">Стены:</span>{" "}
            {calcResult.walls.join(" + ")} = {calcResult.walls.reduce((a, b) => a + b, 0)} см
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Метод:</span> {calcResult.method}
          </div>
          {calcResult.area_m2 === 0 && (
            <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Полигон не замкнулся — проверьте порядок и длины стен
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// AI Vision Test Component
// ─────────────────────────────────────────────────────

export default function VisionTestPage() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultiAgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setRawJson("");
    const compressed = await compressImage(file);
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(compressed);
  }

  async function analyze() {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/vision-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64Url: image }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); return; }
      setResult(data as MultiAgentResult);
      setRawJson(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Калькулятор комнат</h1>
        <p className="text-muted-foreground mt-1">
          Введите стены вручную или загрузите фото чертежа
        </p>
      </div>

      {/* Manual Calculator */}
      <ManualCalculator />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">или загрузите фото</span>
        </div>
      </div>

      {/* AI Upload */}
      <div className="rounded-lg border-2 border-dashed p-6 text-center">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {image ? (
          <div className="space-y-4">
            <img src={image} alt="Чертёж" className="mx-auto max-h-80 rounded-lg" />
            <div className="flex justify-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                Другое фото
              </button>
              <button onClick={analyze} disabled={loading} className="rounded-lg bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {loading ? "Анализирую..." : "Распознать"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90">
            Загрузить фото замеров
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-destructive/10 p-4 text-destructive">{error}</div>}

      {loading && (
        <div className="rounded-lg bg-muted p-6 text-center">
          <div className="text-lg font-medium">Читаю чертёж...</div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4">
            <h2 className="text-lg font-bold text-green-800 dark:text-green-200">
              Итого: {result.totalArea} м² | Периметр: {result.totalPerimeter} м | {result.totalCorners} углов
            </h2>
          </div>

          {result.rooms.map((room) => (
            <div key={room.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{room.name}</h3>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{room.corners} углов</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{room.area}</div>
                  <div className="text-xs text-muted-foreground">м²</div>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{room.perimeter}</div>
                  <div className="text-xs text-muted-foreground">м периметр</div>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{room.corners}</div>
                  <div className="text-xs text-muted-foreground">углов</div>
                </div>
              </div>
              <div className="text-sm">
                <span className="font-medium">Стены (см):</span> {room.walls_cm.join(" + ")} = {room.walls_cm.reduce((a, b) => a + b, 0)} см
              </div>
              {room.areaMethod && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Метод:</span> {room.areaMethod}
                </div>
              )}
              {room.area === 0 && (
                <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  ⚠ Площадь не рассчитана — проверьте данные
                </div>
              )}
            </div>
          ))}

          <details className="rounded-lg border">
            <summary className="cursor-pointer p-3 font-medium text-sm">Сырой JSON</summary>
            <pre className="overflow-auto p-3 text-xs bg-muted rounded-b-lg max-h-96">{rawJson}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
