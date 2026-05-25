"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MarkupCanvas, type MarkupData } from "@/components/visualization/markup-canvas";

// Сохраняем состояние формы в sessionStorage — переживает hot-reload, ошибки, F5.
const STORAGE_KEY = "viz_form_state_v1";

interface PersistedFormState {
  photoUrl: string | null;
  referenceUrl: string | null;
  vizId: string | null;
  attachment: string;
  finish: string;
  colorName: string;
  spotsCount: number;
  chandelier: string;
  provider: string;
  extraPrompt: string;
  removeOldFixtures: boolean;
  markup: MarkupData;
  selectedElements: Record<string, { quantity: number; notes: string }>;
  showMarkup: boolean;
  resultUrl: string | null;
}

function loadPersisted(): Partial<PersistedFormState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedFormState;
  } catch {
    return null;
  }
}

function savePersisted(state: PersistedFormState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage full or unavailable — skip
  }
}

type AttachmentType = "regular" | "shadow" | "floating";
type Finish = "matte" | "satin" | "glossy";
type ChandelierType = "none" | "minimalist" | "modern" | "classic" | "molecular";
type Provider = "nano-banana" | "replicate-flux-kontext";

const ATTACHMENT_LABELS: Record<AttachmentType, string> = {
  regular: "Обычное",
  shadow: "Теневое",
  floating: "Парящий",
};
const FINISH_LABELS: Record<Finish, string> = {
  matte: "Матовый",
  satin: "Сатин",
  glossy: "Глянец",
};
const CHANDELIER_LABELS: Record<ChandelierType, string> = {
  none: "Без люстры",
  minimalist: "Минимализм",
  modern: "Современная",
  // classic и molecular скрыты в селекте, но валидируются на сервере (есть в общем enum типе)
  classic: "Классическая",
  molecular: "Молекулярная",
};

// В селекте показываем только 2 пресета "с люстрой". Если мастер хочет конкретную модель —
// он добавляет её в библиотеку как элемент категории `chandelier` и ставит через 💡 разметку.
const CHANDELIER_VISIBLE: ChandelierType[] = ["none", "minimalist", "modern"];
const PROVIDER_LABELS: Record<Provider, string> = {
  "nano-banana": "Дизайнерский (Nano Banana)",
  "replicate-flux-kontext": "Фотореалистичный (FLUX Kontext)",
};

interface VisualizationItem {
  id: string;
  originalUrl: string;
  status: string;
  createdAt: string;
  latestRender: { id: string; url: string; createdAt: string } | null;
}

interface LibraryElement {
  id: string;
  category: string;
  name: string;
  imageUrl: string;
  defaultQty: number;
}

const ELEMENT_CATEGORY_LABELS: Record<string, string> = {
  spot: "Споты",
  track: "Треки",
  lightline: "Линии",
  chandelier: "Люстры",
  ventilation: "Вентиляция",
  decoration: "Декор",
  profile: "Профили",
  other: "Другое",
};

export default function VisualizationPage() {
  // --- list ---
  const [list, setList] = useState<VisualizationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // --- new visualization flow ---
  // Initial state — defaults, чтобы SSR и client первый рендер совпали.
  // sessionStorage загружается в useEffect ниже (после mount).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [vizId, setVizId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);

  // options
  const [attachment, setAttachment] = useState<AttachmentType>("floating");
  const [finish, setFinish] = useState<Finish>("matte");
  const [colorName, setColorName] = useState("белый");
  const [spotsCount, setSpotsCount] = useState<0 | 4 | 6 | 8>(0);
  const [chandelier, setChandelier] = useState<ChandelierType>("none");
  const [provider, setProvider] = useState<Provider>("nano-banana");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [removeOldFixtures, setRemoveOldFixtures] = useState(true);

  // library
  const [library, setLibrary] = useState<LibraryElement[]>([]);
  const [selectedElements, setSelectedElements] = useState<Record<string, { quantity: number; notes: string }>>({});

  // markup
  const [markup, setMarkup] = useState<MarkupData>({ points: [], lines: [] });
  const [showMarkup, setShowMarkup] = useState<boolean>(false);

  // render state
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // hydrated: true после первого client-side mount.
  // До этого момента не пишем в sessionStorage (чтобы не затереть persistedstate дефолтами).
  const [hydrated, setHydrated] = useState(false);

  // Восстановление из sessionStorage — ТОЛЬКО на клиенте, ПОСЛЕ первого render.
  // Так SSR HTML совпадает с первым client HTML → нет hydration mismatch.
  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      if (p.photoUrl !== undefined) setPhotoUrl(p.photoUrl);
      if (p.referenceUrl !== undefined) setReferenceUrl(p.referenceUrl);
      if (p.vizId !== undefined) setVizId(p.vizId);
      if (p.attachment) setAttachment(p.attachment as AttachmentType);
      if (p.finish) setFinish(p.finish as Finish);
      if (p.colorName !== undefined) setColorName(p.colorName);
      if (p.spotsCount !== undefined) setSpotsCount(p.spotsCount as 0 | 4 | 6 | 8);
      if (p.chandelier) setChandelier(p.chandelier as ChandelierType);
      if (p.provider) setProvider(p.provider as Provider);
      if (p.extraPrompt !== undefined) setExtraPrompt(p.extraPrompt);
      if (p.removeOldFixtures !== undefined) setRemoveOldFixtures(p.removeOldFixtures);
      if (p.markup) setMarkup(p.markup);
      if (p.selectedElements) setSelectedElements(p.selectedElements);
      if (p.showMarkup !== undefined) setShowMarkup(p.showMarkup);
      if (p.resultUrl !== undefined) setResultUrl(p.resultUrl);
    }
    setHydrated(true);
  }, []);

  // Сохраняем всё в sessionStorage при любом изменении (после гидратации).
  useEffect(() => {
    if (!hydrated) return;
    savePersisted({
      photoUrl,
      referenceUrl,
      vizId,
      attachment,
      finish,
      colorName,
      spotsCount,
      chandelier,
      provider,
      extraPrompt,
      removeOldFixtures,
      markup,
      selectedElements,
      showMarkup,
      resultUrl,
    });
  }, [
    hydrated,
    photoUrl,
    referenceUrl,
    vizId,
    attachment,
    finish,
    colorName,
    spotsCount,
    chandelier,
    provider,
    extraPrompt,
    removeOldFixtures,
    markup,
    selectedElements,
    showMarkup,
    resultUrl,
  ]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/visualizations");
      if (res.ok) {
        const data = (await res.json()) as { visualizations: VisualizationItem[] };
        setList(data.visualizations);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await fetch("/api/ceiling-elements");
    if (res.ok) {
      const data = (await res.json()) as { elements: LibraryElement[] };
      setLibrary(data.elements ?? []);
    }
  }, []);

  useEffect(() => {
    loadList();
    loadLibrary();
  }, [loadList, loadLibrary]);

  function toggleElement(elId: string, defaultQty: number) {
    setSelectedElements((prev) => {
      const next = { ...prev };
      if (next[elId]) {
        delete next[elId];
      } else {
        next[elId] = { quantity: defaultQty, notes: "" };
      }
      return next;
    });
  }

  function updateElementQty(elId: string, qty: number) {
    setSelectedElements((prev) => ({
      ...prev,
      [elId]: { ...prev[elId], quantity: Math.max(1, Math.min(99, qty)) },
    }));
  }

  function updateElementNotes(elId: string, notes: string) {
    setSelectedElements((prev) => ({
      ...prev,
      [elId]: { ...prev[elId], notes },
    }));
  }

  async function handleUpload(file: File) {
    setError(null);
    setResultUrl(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/visualizations", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        id: string;
        originalUrl: string;
        referenceUrl: string | null;
      };
      setVizId(data.id);
      setPhotoUrl(data.originalUrl);
      setReferenceUrl(data.referenceUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки фото");
    } finally {
      setUploading(false);
    }
  }

  async function handleReferenceUpload(file: File) {
    if (!vizId) {
      setError("Сначала загрузите фото комнаты");
      return;
    }
    setError(null);
    setUploadingRef(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/visualizations/${vizId}/reference`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { referenceUrl: string };
      setReferenceUrl(data.referenceUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки референса");
    } finally {
      setUploadingRef(false);
    }
  }

  async function handleRemoveReference() {
    if (!vizId) return;
    await fetch(`/api/visualizations/${vizId}/reference`, { method: "DELETE" });
    setReferenceUrl(null);
  }

  async function handleGenerate() {
    if (!vizId) {
      setError("Сначала загрузите фото");
      return;
    }
    setError(null);
    setResultUrl(null);
    setGenerating(true);
    setElapsedMs(null);
    try {
      const elementsPayload = Object.entries(selectedElements).map(([elementId, v]) => ({
        elementId,
        quantity: v.quantity,
        notes: v.notes.trim() || undefined,
      }));
      const hasMarkup = markup.points.length > 0 || markup.lines.length > 0;
      const res = await fetch(`/api/visualizations/${vizId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          elements: elementsPayload.length > 0 ? elementsPayload : undefined,
          markup: hasMarkup ? markup : undefined,
          options: {
            attachmentType: attachment,
            finish,
            colorName,
            ledStrip: false,
            spotsCount,
            chandelierType: chandelier,
            extraPrompt: extraPrompt.trim() || undefined,
            removeOldFixtures,
          },
        }),
      });
      const data = (await res.json()) as {
        render?: { url: string };
        elapsedMs?: number;
        creditsLeft?: number;
        error?: string;
      };
      if (!res.ok || !data.render) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResultUrl(data.render.url);
      setElapsedMs(data.elapsedMs ?? null);
      setCreditsLeft(data.creditsLeft ?? null);
      // обновим список
      loadList();
    } catch (e) {
      // Если ответ потерялся (ECONNRESET, network issue) — рендер мог пройти на сервере.
      // Перезагружаем список и подсказываем пользователю проверить историю.
      const msg = e instanceof Error ? e.message : "Ошибка рендера";
      const isNetworkError =
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("failed");
      if (isNetworkError) {
        setError(
          "Соединение прервалось, но рендер мог завершиться. Проверьте «Историю визуализаций» ниже — последняя визуализация скорее всего там.",
        );
        loadList();
      } else {
        setError(msg);
      }
    } finally {
      setGenerating(false);
    }
  }

  function resetForm() {
    setPhotoUrl(null);
    setReferenceUrl(null);
    setVizId(null);
    setResultUrl(null);
    setError(null);
    setElapsedMs(null);
    setExtraPrompt("");
    setMarkup({ points: [], lines: [] });
    setSelectedElements({});
    setShowMarkup(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI-визуализация потолка</h1>
          <p className="text-sm text-slate-500">
            Фото комнаты клиента → фотореалистичный рендер с натяжным потолком
          </p>
        </div>
        {creditsLeft !== null && (
          <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            Кредиты: {creditsLeft}
          </div>
        )}
      </div>

      {/* --- New flow --- */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Новая визуализация</h2>

        {!photoUrl ? (
          <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-slate-400 hover:bg-slate-100">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <span className="text-sm font-medium text-slate-600">
              {uploading ? "Загрузка..." : "📷 Загрузить фото комнаты клиента"}
            </span>
            <span className="mt-1 text-xs text-slate-400">JPG/PNG/HEIC до 10 МБ</span>
          </label>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {/* left: photo + options */}
            <div className="space-y-4">
              {/* --- main photo + reference photo side by side --- */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    Комната клиента
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt="комната клиента" className="aspect-square w-full object-cover" />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Референс «как сделать»</span>
                    {referenceUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveReference}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {referenceUrl ? (
                    <div className="overflow-hidden rounded-lg border-2 border-emerald-400">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={referenceUrl} alt="референс" className="aspect-square w-full object-cover" />
                    </div>
                  ) : (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-2 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingRef}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleReferenceUpload(f);
                        }}
                      />
                      <span className="text-xs font-medium text-slate-600">
                        {uploadingRef ? "..." : "+ Pinterest / портфолио"}
                      </span>
                      <span className="mt-1 text-[10px] text-slate-400">
                        опционально
                      </span>
                    </label>
                  )}
                </div>
              </div>

              {referenceUrl && (
                <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
                  ✨ Режим «сделай как на референсе» — AI скопирует дизайн потолка с второго фото
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  Загрузить другое фото
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarkup((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    showMarkup
                      ? "bg-indigo-600 text-white"
                      : "border border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                  }`}
                >
                  🎯 {showMarkup ? "Скрыть разметку" : "Точная разметка на фото"}
                  {(markup.points.length > 0 || markup.lines.length > 0) && (
                    <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-indigo-700">
                      {markup.points.length + markup.lines.length}
                    </span>
                  )}
                </button>
              </div>

              {showMarkup && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
                  <div className="mb-2 text-xs text-indigo-700">
                    Тапни инструмент → потом тапай по фото. AI поставит фикстуры именно в этих местах.
                  </div>
                  <MarkupCanvas
                    photoUrl={photoUrl}
                    markup={markup}
                    onChange={setMarkup}
                    library={library}
                    vizId={vizId}
                  />
                </div>
              )}

              <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                {!referenceUrl && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Тип примыкания
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(Object.keys(ATTACHMENT_LABELS) as AttachmentType[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setAttachment(k)}
                          className={`rounded px-2 py-1.5 text-xs font-medium transition ${
                            attachment === k
                              ? "bg-slate-900 text-white"
                              : "bg-white text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {ATTACHMENT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Финиш
                    </label>
                    <select
                      value={finish}
                      onChange={(e) => setFinish(e.target.value as Finish)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {(Object.keys(FINISH_LABELS) as Finish[]).map((k) => (
                        <option key={k} value={k}>
                          {FINISH_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Цвет
                    </label>
                    <input
                      type="text"
                      value={colorName}
                      onChange={(e) => setColorName(e.target.value)}
                      placeholder="белый"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                {!referenceUrl && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                          Спотов
                        </label>
                        <select
                          value={spotsCount}
                          onChange={(e) =>
                            setSpotsCount(parseInt(e.target.value, 10) as 0 | 4 | 6 | 8)
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value={0}>Без спотов</option>
                          <option value={4}>4</option>
                          <option value={6}>6</option>
                          <option value={8}>8</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                          Люстра
                        </label>
                        <select
                          value={chandelier}
                          onChange={(e) => setChandelier(e.target.value as ChandelierType)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                        >
                          {CHANDELIER_VISIBLE.map((k) => (
                            <option key={k} value={k}>
                              {CHANDELIER_LABELS[k]}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Нужна конкретная люстра?{" "}
                          <Link href="/dashboard/visualization/library" className="text-indigo-600 underline">
                            Добавь фото в библиотеку
                          </Link>{" "}
                          и поставь через 💡 на разметке
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Стиль рендера
                      </label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as Provider)}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        {(Object.keys(PROVIDER_LABELS) as Provider[]).map((k) => (
                          <option key={k} value={k}>
                            {PROVIDER_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* --- Library element picker --- */}
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-indigo-800">
                      📚 Элементы из библиотеки {Object.keys(selectedElements).length > 0 && (
                        <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
                          {Object.keys(selectedElements).length}
                        </span>
                      )}
                    </div>
                    <Link
                      href="/dashboard/visualization/library"
                      className="text-xs text-indigo-700 underline hover:text-indigo-900"
                    >
                      Открыть каталог
                    </Link>
                  </div>

                  {library.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Каталог пуст.{" "}
                      <Link
                        href="/dashboard/visualization/library"
                        className="font-semibold text-indigo-700 underline"
                      >
                        Добавь свои элементы
                      </Link>{" "}
                      (споты, треки, люстры, вентиляцию) — потом сможешь собирать из них любую композицию.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                        {library.map((el) => {
                          const isSelected = !!selectedElements[el.id];
                          return (
                            <button
                              key={el.id}
                              type="button"
                              onClick={() => toggleElement(el.id, el.defaultQty)}
                              className={`overflow-hidden rounded-lg border-2 transition ${
                                isSelected
                                  ? "border-indigo-500 ring-2 ring-indigo-200"
                                  : "border-slate-200 hover:border-slate-400"
                              }`}
                              title={`${ELEMENT_CATEGORY_LABELS[el.category] || el.category} · ${el.name}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={el.imageUrl}
                                alt={el.name}
                                className="aspect-square w-full object-cover"
                              />
                              <div className="bg-white p-1 text-[10px] text-slate-700">
                                <div className="truncate font-medium">{el.name}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {Object.keys(selectedElements).length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3">
                          <div className="text-xs font-semibold text-indigo-800">
                            Выбрано — укажи количество и позицию:
                          </div>
                          {Object.entries(selectedElements).map(([elId, sel]) => {
                            const el = library.find((x) => x.id === elId);
                            if (!el) return null;
                            return (
                              <div
                                key={elId}
                                className="flex items-center gap-2 rounded bg-white p-2 text-xs"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={el.imageUrl}
                                  alt=""
                                  className="h-10 w-10 rounded object-cover"
                                />
                                <div className="flex-1">
                                  <div className="font-semibold">{el.name}</div>
                                  <input
                                    type="text"
                                    value={sel.notes}
                                    onChange={(e) => updateElementNotes(elId, e.target.value)}
                                    placeholder="позиция / уточнение (опционально)"
                                    className="mt-1 w-full rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
                                  />
                                </div>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={sel.quantity}
                                  onChange={(e) =>
                                    updateElementQty(elId, parseInt(e.target.value, 10) || 1)
                                  }
                                  className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-xs"
                                />
                                <span className="text-slate-400">шт.</span>
                                <button
                                  type="button"
                                  onClick={() => toggleElement(elId, 0)}
                                  className="ml-1 text-rose-500 hover:text-rose-700"
                                  title="убрать"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={removeOldFixtures}
                    onChange={(e) => setRemoveOldFixtures(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-amber-800">
                    🗑 <strong>На исходнике висят лампы / провода — убрать</strong>
                    <span className="ml-1 block text-xs text-amber-600">
                      Хардкорный режим: усиленный промпт чтобы AI спрятал старые источники света под новым потолком
                    </span>
                  </span>
                </label>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Доп. инструкции (опционально)
                  </label>
                  <textarea
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    rows={2}
                    placeholder="например: шторы белые, мягкий вечерний свет"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {generating ? "🎨 Рендер 20–60 сек..." : "✨ Сделать визуализацию"}
              </button>
            </div>

            {/* right: result */}
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-2 text-center text-xs font-medium text-slate-600">
                Результат
              </div>
              {generating && (
                <div className="flex h-64 flex-col items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
                  <div className="mb-2 animate-pulse">🎨</div>
                  Рендерим... обычно 20–60 секунд
                </div>
              )}
              {!generating && resultUrl && (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultUrl} alt="результат" className="w-full" />
                </div>
              )}
              {!generating && !resultUrl && !error && (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
                  Нажмите «Сделать визуализацию»
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  ⚠ {error}
                </div>
              )}
              {elapsedMs !== null && resultUrl && (
                <div className="text-xs text-slate-500">
                  Отрендерено за {(elapsedMs / 1000).toFixed(1)} сек
                </div>
              )}
              {resultUrl && (
                <div className="flex gap-2">
                  <a
                    href={resultUrl}
                    download
                    className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-medium text-white hover:bg-slate-900"
                  >
                    ⬇ Скачать
                  </a>
                  <button
                    type="button"
                    onClick={() => handleGenerate()}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    🔄 Ещё вариант
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* --- History --- */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">История визуализаций</h2>
        {loadingList ? (
          <div className="text-sm text-slate-500">Загрузка...</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Пока пусто — загрузите первое фото
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {list.map((v) => (
              <Link
                href={`/dashboard/visualization/${v.id}`}
                key={v.id}
                className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.latestRender?.url ?? v.originalUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                <div className="p-2 text-xs">
                  <div className="font-medium capitalize">{v.status}</div>
                  <div className="text-slate-400">
                    {new Date(v.createdAt).toLocaleDateString("ru-RU")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
