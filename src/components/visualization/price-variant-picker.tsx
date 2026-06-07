"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check, X } from "lucide-react";

interface PriceVariant {
  id: string;
  name: string;
  category: string;
  photoUrl: string | null;
  unit: string;
  price: number;
  physicalWidthMm: number | null;
  physicalHeightMm: number | null;
  colorHex: string | null;
  mountingType: string | null;
}

// Маппинг типа RoomElement → category в PriceVariant.
const ELEMENT_TO_CATEGORY: Record<string, string> = {
  spot: "spot",
  chandelier: "chandelier",
  pendant: "chandelier",
  track: "track",
  lightline: "lightline",
  curtain: "curtain",
  subcurtain: "podshtornik",
  builtin_gardina: "gardina",
};

const CATEGORY_LABELS: Record<string, string> = {
  spot: "Софиты",
  chandelier: "Люстры / подвесы",
  track: "Магнитные треки",
  lightline: "Световые линии",
  curtain: "Гардины",
  podshtornik: "Подшторники",
  gardina: "Встроенные гардины",
};

interface PriceVariantPickerProps {
  elementType: string;
  currentVariantId?: string | null;
  onPick: (variantId: string | null) => void;
  onClose: () => void;
}

export function PriceVariantPicker({ elementType, currentVariantId, onPick, onClose }: PriceVariantPickerProps) {
  const category = ELEMENT_TO_CATEGORY[elementType];
  const [variants, setVariants] = useState<PriceVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!category) {
      setLoading(false);
      return;
    }
    fetch(`/api/prices/variants?category=${category}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data: PriceVariant[]) => setVariants(Array.isArray(data) ? data : []))
      .catch((e) => setError(typeof e === "string" ? e : "Не удалось загрузить прайс"))
      .finally(() => setLoading(false));
  }, [category]);

  if (!category) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-2">Привязка товара недоступна</h3>
          <p className="text-sm text-slate-600">
            Этот тип элемента ({elementType}) не имеет соответствующей категории в прайсе.
          </p>
          <button
            onClick={onClose}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Закрыть
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Выбрать товар: {CATEGORY_LABELS[category] ?? category}
          </h3>
          <p className="text-xs text-slate-500">Из вашего прайса. AI отрендерит именно этот товар.</p>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {loading && (
          <div className="text-center py-10 text-sm text-slate-500">Загрузка...</div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">⚠ {error}</div>
        )}
        {!loading && !error && variants.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-sm font-medium text-slate-700 mb-2">
              В вашем прайсе нет вариантов «{CATEGORY_LABELS[category]}»
            </p>
            <a
              href="/dashboard/prices"
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
            >
              <Sparkles className="h-4 w-4" />
              Добавить в прайс
            </a>
          </div>
        )}
        {!loading && variants.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {currentVariantId && (
              <button
                onClick={() => { onPick(null); onClose(); }}
                className="rounded-xl border-2 border-dashed border-rose-300 bg-rose-50 p-3 text-center text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                ✕ Убрать привязку
              </button>
            )}
            {variants.map((v) => {
              const active = currentVariantId === v.id;
              const spec: string[] = [];
              if (v.physicalWidthMm) spec.push(`${v.physicalWidthMm}мм`);
              if (v.colorHex) spec.push(v.colorHex);
              if (v.mountingType) spec.push(v.mountingType);
              return (
                <button
                  key={v.id}
                  onClick={() => { onPick(v.id); onClose(); }}
                  className={`group relative rounded-xl border-2 overflow-hidden text-left transition ${
                    active ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {active && (
                    <div className="absolute right-1 top-1 z-10 rounded-full bg-emerald-500 p-1">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {v.photoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={v.photoUrl} alt={v.name} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="aspect-square w-full bg-slate-100 flex items-center justify-center text-3xl">📦</div>
                  )}
                  <div className="p-2">
                    <div className="text-xs font-semibold text-slate-800 line-clamp-2">{v.name}</div>
                    {spec.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{spec.join(" · ")}</div>
                    )}
                    <div className="text-[11px] font-bold text-slate-900 mt-1">
                      {v.price.toLocaleString("ru-RU")} ₸/{v.unit}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-t-2xl md:rounded-2xl bg-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
