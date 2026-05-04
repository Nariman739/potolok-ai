"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CEILING_COLORS } from "@/components/room-3d/constants";

type Finish = "matte" | "satin" | "glossy";

const FINISH_LABELS: Record<Finish, string> = {
  matte: "Матовый",
  satin: "Сатин",
  glossy: "Глянец",
};

export default function AiRenderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const estimateId = searchParams.get("estimateId");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finish, setFinish] = useState<Finish>("glossy");
  const [colorId, setColorId] = useState<string>("white");
  const [topMaskRatio, setTopMaskRatio] = useState(0.4);

  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedToEstimate, setSavedToEstimate] = useState(false);

  // Можно прийти со страницы КП — туда вернёмся после сохранения
  useEffect(() => {
    setSavedToEstimate(false);
  }, [resultUrl]);

  const color = CEILING_COLORS.find((c) => c.id === colorId) ?? CEILING_COLORS[0];

  async function handleUpload(file: File) {
    setError(null);
    setResultUrl(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", "ai-ceiling");
      const res = await fetch("/api/assistant/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      setPhotoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки фото");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!photoUrl) {
      setError("Сначала загрузите фото комнаты");
      return;
    }
    setError(null);
    setGenerating(true);
    setResultUrl(null);
    try {
      const res = await fetch("/api/ai-ceiling-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: photoUrl,
          finish,
          colorHex: color.hex,
          colorName: color.label,
          topMaskRatio,
          estimateId: estimateId ?? undefined,
          saveToEstimate: false, // мастер решает после превью
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      setResultUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка AI-рендера");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveToEstimate() {
    if (!resultUrl || !estimateId) return;
    try {
      const res = await fetch("/api/ai-ceiling-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: photoUrl,
          finish,
          colorHex: color.hex,
          colorName: color.label,
          topMaskRatio,
          estimateId,
          saveToEstimate: true,
        }),
      });
      if (!res.ok) {
        // Альтернатива: PATCH прямо в Estimate.room3dPreviewUrl с уже готовым URL.
        // Сейчас просто перегенерим, потому что лимит 30/день — не критично.
        throw new Error("Не сохранилось");
      }
      setSavedToEstimate(true);
    } catch {
      setError("Не удалось сохранить в КП");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">✨ AI-фото потолка</h1>
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:underline">
          ← Назад
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Загрузите фото комнаты — AI заменит существующий потолок на натяжной выбранного финиша и цвета.
        Это займёт 10-30 секунд.
      </p>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">1. Фото комнаты</div>
        {!photoUrl && (
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              disabled={uploading}
            />
            <div className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-gray-50">
              {uploading ? "Загрузка…" : "📷 Выбрать фото или сделать снимок"}
            </div>
          </label>
        )}
        {photoUrl && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Комната" className="rounded-xl w-full max-h-72 object-contain bg-gray-50" />
            <button
              onClick={() => { setPhotoUrl(null); setResultUrl(null); }}
              className="text-xs text-gray-500 hover:underline"
            >
              Заменить фото
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">2. Финиш потолка</div>
        <div className="grid grid-cols-3 gap-2">
          {(["matte", "satin", "glossy"] as Finish[]).map((f) => (
            <button
              key={f}
              onClick={() => setFinish(f)}
              className={`px-3 py-2 rounded-lg text-sm font-bold ${
                finish === f ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {FINISH_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">3. Цвет</div>
        <div className="flex flex-wrap gap-2">
          {CEILING_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setColorId(c.id)}
              title={c.label}
              className={`w-10 h-10 rounded-full border-2 active:scale-95 ${
                colorId === c.id ? "border-[#1e3a5f] scale-110" : "border-white shadow"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <div className="text-xs text-gray-500">Выбрано: {color.label}</div>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">
          4. Сколько верхней части фото — потолок? <span className="text-gray-400">{Math.round(topMaskRatio * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={0.6}
          step={0.05}
          value={topMaskRatio}
          onChange={(e) => setTopMaskRatio(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="text-xs text-gray-500">
          Если AI меняет лишнее (стены, мебель) — уменьшите. Если потолок остаётся прежним — увеличьте.
        </div>
      </section>

      <button
        onClick={handleGenerate}
        disabled={!photoUrl || generating}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm shadow-lg active:scale-95 disabled:opacity-60"
      >
        {generating ? "AI рисует… 10-30 сек" : "✨ Сгенерировать AI-фото"}
      </button>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {resultUrl && (
        <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3">
          <div className="text-sm font-bold text-emerald-700">Готово!</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="AI-рендер" className="rounded-xl w-full" />
          <div className="flex flex-wrap gap-2">
            <a
              href={resultUrl}
              download={`potolok-ai-${Date.now()}.jpg`}
              className="flex-1 text-center px-4 py-2.5 rounded-xl bg-white border font-semibold text-sm hover:bg-gray-50"
            >
              ⬇ Скачать
            </a>
            {estimateId && (
              <button
                onClick={handleSaveToEstimate}
                disabled={savedToEstimate}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white font-semibold text-sm active:scale-95 disabled:opacity-60"
              >
                {savedToEstimate ? "✓ Сохранено в КП" : "Сохранить в КП"}
              </button>
            )}
            <button
              onClick={handleGenerate}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-300"
            >
              🔄 Перегенерировать
            </button>
          </div>
          {estimateId && savedToEstimate && (
            <Link
              href={`/dashboard/estimates/${estimateId}`}
              className="block text-center text-sm text-emerald-700 underline"
            >
              Перейти к КП →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
