"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Category = "spot" | "track" | "lightline" | "chandelier" | "ventilation" | "decoration" | "profile" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  spot: "Споты",
  track: "Магнитные треки",
  lightline: "Светящиеся линии",
  chandelier: "Люстры",
  ventilation: "Вентиляция / решётки",
  decoration: "Декор",
  profile: "Профили",
  other: "Другое",
};

interface CeilingElement {
  id: string;
  category: Category;
  name: string;
  description: string | null;
  imageUrl: string;
  defaultQty: number;
  isHidden: boolean;
  createdAt: string;
}

export default function LibraryPage() {
  const [list, setList] = useState<CeilingElement[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("spot");
  const [defaultQty, setDefaultQty] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ceiling-elements?includeHidden=true");
      const data = (await res.json()) as { elements: CeilingElement[] };
      setList(data.elements ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (!file || !name.trim()) {
      setError("Заполните имя и выберите фото");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("category", category);
      fd.append("defaultQty", String(defaultQty));
      const res = await fetch("/api/ceiling-elements", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // reset form
      setName("");
      setFile(null);
      setDefaultQty(1);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка добавления");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить элемент из библиотеки?")) return;
    await fetch(`/api/ceiling-elements/${id}`, { method: "DELETE" });
    load();
  }

  async function handleToggleHidden(el: CeilingElement) {
    await fetch(`/api/ceiling-elements/${el.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isHidden: !el.isHidden }),
    });
    load();
  }

  // group by category
  const groups: Record<string, CeilingElement[]> = {};
  for (const el of list) {
    if (!groups[el.category]) groups[el.category] = [];
    groups[el.category].push(el);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/visualization"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← К визуализациям
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Библиотека элементов</h1>
          <p className="text-sm text-slate-500">
            Загружай свои споты, треки, люстры, вентиляцию (на нейтральном фоне) — AI будет ставить
            именно их в рендеры комнат клиентов
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700"
        >
          {showForm ? "Скрыть" : "+ Добавить элемент"}
        </button>
      </div>

      {/* --- Form --- */}
      {showForm && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Новый элемент</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Фото элемента (на нейтральном фоне)
              </label>
              <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400 hover:bg-indigo-50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt="preview"
                      className="max-h-44 max-w-full rounded object-contain"
                    />
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-600">
                      📷 Выбрать фото
                    </span>
                    <span className="mt-1 text-xs text-slate-400">JPG/PNG до 10MB</span>
                  </>
                )}
              </label>
              <p className="mt-2 text-xs text-slate-500">
                После загрузки AI автоматически опишет элемент текстом — это используется для
                точного копирования в рендерах
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Категория
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Имя элемента
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="например: Софит чёрный COB 30W"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Кол-во по умолчанию
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={defaultQty}
                  onChange={(e) => setDefaultQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Сколько штук по умолчанию ставится в визуализацию
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">⚠ {error}</div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={uploading || !file || !name.trim()}
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {uploading
                  ? "Загружаем + AI анализирует... (5-10 сек)"
                  : "💾 Сохранить в библиотеку"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* --- Catalog --- */}
      {loading ? (
        <div className="text-sm text-slate-500">Загрузка...</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-500">
            Пусто. Загрузи свои элементы — потом сможешь собирать из них любую композицию потолка.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Совет: фоткай элементы на белом/нейтральном фоне (или скачивай с сайтов производителей).
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
            const items = groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                  {CATEGORY_LABELS[cat]} · {items.length}
                </h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {items.map((el) => (
                    <div
                      key={el.id}
                      className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
                        el.isHidden ? "opacity-50" : ""
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={el.imageUrl}
                        alt={el.name}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="p-3">
                        <div className="text-sm font-semibold text-slate-800">{el.name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          По умолчанию: {el.defaultQty} шт.
                        </div>
                        {el.description && (
                          <details className="mt-2 text-xs text-slate-500">
                            <summary className="cursor-pointer">AI-описание</summary>
                            <p className="mt-1">{el.description}</p>
                          </details>
                        )}
                        <div className="mt-2 flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleHidden(el)}
                            className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200"
                          >
                            {el.isHidden ? "Показать" : "Скрыть"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(el.id)}
                            className="rounded bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
