"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface RenderItem {
  id: string;
  url: string;
  prompt: string;
  modelUsed: string;
  costUsd: number;
  variantName: string | null;
  createdAt: string;
}

interface VisualizationDetail {
  id: string;
  originalUrl: string;
  referenceUrl: string | null;
  markup: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  renders: RenderItem[];
}

export default function VisualizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<VisualizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRender, setSelectedRender] = useState<RenderItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/visualizations/${params.id}`)
      .then((r) => r.json())
      .then((d: VisualizationDetail | { error: string }) => {
        if ("error" in d) {
          setError(d.error);
        } else {
          setData(d);
          setSelectedRender(d.renders[0] ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleDelete() {
    if (!confirm("Удалить визуализацию со всеми рендерами?")) return;
    const res = await fetch(`/api/visualizations/${params.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/visualization");
  }

  if (loading) {
    return <div className="container mx-auto max-w-5xl px-4 py-6">Загрузка...</div>;
  }
  if (error || !data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          ⚠ {error ?? "Не найдено"}
        </div>
        <Link
          href="/dashboard/visualization"
          className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
        >
          ← Назад к списку
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/dashboard/visualization"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← К списку
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded text-sm text-rose-600 hover:underline"
        >
          🗑 Удалить
        </button>
      </div>

      <h1 className="mb-4 text-2xl font-bold">Визуализация</h1>

      {/* Before / After comparison */}
      <div className={`mb-6 grid gap-4 ${data.referenceUrl ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-600">До (комната клиента)</div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.originalUrl} alt="до" className="w-full" />
          </div>
        </div>
        {data.referenceUrl && (
          <div>
            <div className="mb-2 text-sm font-semibold text-emerald-700">
              Референс «как сделать»
            </div>
            <div className="overflow-hidden rounded-lg border-2 border-emerald-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.referenceUrl} alt="референс" className="w-full" />
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-600">После</div>
          {selectedRender ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedRender.url} alt="после" className="w-full" />
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
              Рендеров пока нет
            </div>
          )}
        </div>
      </div>

      {selectedRender && (
        <div className="mb-6 flex gap-2">
          <a
            href={selectedRender.url}
            download
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            ⬇ Скачать
          </a>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              navigator.clipboard.writeText(selectedRender.url);
            }}
          >
            🔗 Копировать ссылку
          </button>
        </div>
      )}

      {/* All variants */}
      {data.renders.length > 1 && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">
            Все варианты ({data.renders.length})
          </h2>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {data.renders.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRender(r)}
                className={`overflow-hidden rounded-lg border-2 transition ${
                  selectedRender?.id === r.id
                    ? "border-indigo-500"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.variantName ?? ""} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Meta */}
      {selectedRender && (
        <details className="rounded-lg bg-slate-50 p-4 text-xs">
          <summary className="cursor-pointer font-medium text-slate-700">
            Детали рендера
          </summary>
          <div className="mt-3 space-y-2 text-slate-600">
            <div>
              <strong>Модель:</strong> {selectedRender.modelUsed}
            </div>
            <div>
              <strong>Стоимость:</strong> ${selectedRender.costUsd.toFixed(3)}
            </div>
            <div>
              <strong>Создан:</strong>{" "}
              {new Date(selectedRender.createdAt).toLocaleString("ru-RU")}
            </div>
            <div>
              <strong>Промпт:</strong>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[10px] text-slate-500">
                {selectedRender.prompt}
              </pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
