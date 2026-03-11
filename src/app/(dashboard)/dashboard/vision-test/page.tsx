"use client";

import { useState, useRef } from "react";
import { compressImage } from "@/lib/compress-image";
import type { MultiAgentResult } from "@/lib/vision-agents";

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

    // Compress and convert to base64
    const compressed = await compressImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImage(base64);
    };
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

      if (!res.ok) {
        setError(data.error || "Ошибка сервера");
        return;
      }

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
        <h1 className="text-2xl font-bold">Тест распознавания замеров</h1>
        <p className="text-muted-foreground mt-1">
          Загрузите фото чертежа → AI читает размеры → код считает площадь и периметр
        </p>
      </div>

      {/* Upload */}
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
            <img
              src={image}
              alt="Чертёж замеров"
              className="mx-auto max-h-80 rounded-lg"
            />
            <div className="flex justify-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                Другое фото
              </button>
              <button
                onClick={analyze}
                disabled={loading}
                className="rounded-lg bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Анализирую..." : "Распознать"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
          >
            Загрузить фото замеров
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-lg bg-muted p-6 text-center">
          <div className="text-lg font-medium">Читаю чертёж...</div>
          <p className="text-muted-foreground mt-1">
            AI читает размеры → код считает площадь и периметр
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4">
            <h2 className="text-lg font-bold text-green-800 dark:text-green-200">
              Итого: {result.totalArea} м² | Периметр: {result.totalPerimeter} м | {result.totalCorners} углов
            </h2>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              {result.totalRooms} комнат найдено. Площадь и периметр рассчитаны кодом.
            </p>
          </div>

          {/* Room cards */}
          {result.rooms.map((room) => (
            <div key={room.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{room.name}</h3>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  {room.corners} углов
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {room.area}
                  </div>
                  <div className="text-xs text-muted-foreground">м²</div>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {room.perimeter}
                  </div>
                  <div className="text-xs text-muted-foreground">м периметр</div>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {room.corners}
                  </div>
                  <div className="text-xs text-muted-foreground">углов</div>
                </div>
              </div>

              {/* Walls detail */}
              <div className="text-sm">
                <span className="font-medium">Стены (см):</span>{" "}
                {room.walls_cm.join(" + ")} ={" "}
                {room.walls_cm.reduce((a, b) => a + b, 0)} см
              </div>
              {room.rectangles_cm.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">Разбивка:</span>{" "}
                  {room.rectangles_cm.map((r, i) => (
                    <span key={i}>
                      {i > 0 && " + "}
                      {r.w_cm}×{r.h_cm}см
                    </span>
                  ))}
                </div>
              )}

              {room.area === 0 && (
                <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  ⚠ Площадь не рассчитана — проверьте данные
                </div>
              )}
            </div>
          ))}

          {/* Raw JSON */}
          <details className="rounded-lg border">
            <summary className="cursor-pointer p-3 font-medium text-sm">
              Сырой JSON ответ
            </summary>
            <pre className="overflow-auto p-3 text-xs bg-muted rounded-b-lg max-h-96">
              {rawJson}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
