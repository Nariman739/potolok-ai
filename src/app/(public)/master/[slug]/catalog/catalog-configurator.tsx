"use client";

import { useState, useMemo } from "react";
import { MessageCircle, ChevronDown, ChevronUp, ShoppingCart, X, Send } from "lucide-react";

interface CatalogItem {
  code: string;
  name: string;
  unit: string;
  category: string;
  description: string;
  price: number;
}

interface CategoryGroup {
  category: string;
  label: string;
  items: CatalogItem[];
}

interface SelectedItem {
  code: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " \u20B8";
}

// Category icons
const CATEGORY_ICONS: Record<string, string> = {
  canvas: "🎨",
  profile: "📐",
  spot: "💡",
  chandelier: "🔆",
  curtain: "🪟",
  gardina: "📏",
  podshtornik: "📐",
  corner: "📍",
  other: "🔧",
};

export function CatalogConfigurator({
  grouped,
  masterName,
  brandColor,
  contactPhone,
  slug,
}: {
  grouped: CategoryGroup[];
  masterName: string;
  brandColor: string;
  contactPhone: string;
  slug: string;
}) {
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [expandedCat, setExpandedCat] = useState<string>(grouped[0]?.category || "");
  const [showCart, setShowCart] = useState(false);
  const [area, setArea] = useState("");

  const selectedItems = useMemo(() => Object.values(selected).filter(i => i.quantity > 0), [selected]);
  const totalPrice = useMemo(() => selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0), [selectedItems]);
  const itemCount = selectedItems.length;

  function toggleItem(item: CatalogItem) {
    setSelected(prev => {
      const existing = prev[item.code];
      if (existing && existing.quantity > 0) {
        const { [item.code]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [item.code]: { code: item.code, name: item.name, unit: item.unit, price: item.price, quantity: 1 },
      };
    });
  }

  function setQuantity(code: string, qty: number) {
    if (qty <= 0) {
      setSelected(prev => {
        const { [code]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    setSelected(prev => ({
      ...prev,
      [code]: { ...prev[code], quantity: qty },
    }));
  }

  function handleWhatsApp() {
    const areaNum = parseFloat(area) || 0;
    let text = `Здравствуйте! Хочу натяжной потолок.\n\n`;
    if (areaNum > 0) text += `Площадь: ${areaNum} м²\n\n`;
    text += `Выбранные материалы:\n`;
    for (const item of selectedItems) {
      text += `• ${item.name} — ${item.quantity} ${item.unit} × ${fmtPrice(item.price)}\n`;
    }
    text += `\nИтого материалы: ${fmtPrice(totalPrice)}`;
    if (areaNum > 0) text += `\nЦена/м²: ${fmtPrice(totalPrice / areaNum)}`;
    text += `\n\nВыбрано в каталоге: potolok.ai/master/${slug}/catalog`;

    const phone = contactPhone.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-32">
      {/* Area input */}
      <div className="sticky top-0 z-10 bg-white pt-4 pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Площадь потолка</label>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="number"
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="0"
                className="w-24 text-lg font-bold border rounded-lg px-3 py-1.5 text-center"
              />
              <span className="text-sm text-gray-500">м²</span>
            </div>
          </div>
          {itemCount > 0 && (
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold active:scale-95 transition-transform"
              style={{ backgroundColor: brandColor }}
            >
              <ShoppingCart className="h-4 w-4" />
              {fmtPrice(totalPrice)}
              <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {itemCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="mt-4 space-y-3">
        {grouped.map(group => {
          const isExpanded = expandedCat === group.category;
          const selectedInCat = group.items.filter(i => selected[i.code]?.quantity > 0).length;

          return (
            <div key={group.category} className="rounded-xl border overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => setExpandedCat(isExpanded ? "" : group.category)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{CATEGORY_ICONS[group.category] || "📦"}</span>
                  <span className="font-semibold text-sm">{group.label}</span>
                  {selectedInCat > 0 && (
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                      {selectedInCat} выбрано
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="divide-y">
                  {group.items.map(item => {
                    const sel = selected[item.code];
                    const isSelected = sel && sel.quantity > 0;

                    return (
                      <div key={item.code} className={`px-4 py-3 ${isSelected ? "bg-blue-50" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.description && (
                              <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                            )}
                            <div className="text-sm font-bold mt-1" style={{ color: brandColor }}>
                              {fmtPrice(item.price)} / {item.unit}
                            </div>
                          </div>

                          {isSelected ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setQuantity(item.code, sel.quantity - 1)}
                                className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-lg active:bg-gray-100"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                value={sel.quantity}
                                onChange={e => setQuantity(item.code, parseFloat(e.target.value) || 0)}
                                className="w-14 h-8 text-center border rounded-lg text-sm font-bold"
                              />
                              <button
                                onClick={() => setQuantity(item.code, sel.quantity + 1)}
                                className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-lg active:bg-gray-100"
                              >
                                +
                              </button>
                              <span className="text-xs text-gray-400 w-8">{item.unit}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleItem(item)}
                              className="shrink-0 px-3 py-1.5 text-xs rounded-lg border-2 font-semibold active:scale-95 transition-transform"
                              style={{ borderColor: brandColor, color: brandColor }}
                            >
                              Выбрать
                            </button>
                          )}
                        </div>

                        {/* Per-item total when area set */}
                        {isSelected && parseFloat(area) > 0 && (item.unit === "м²" || item.unit === "м.п.") && (
                          <div className="text-xs text-gray-500 mt-1.5">
                            ~ {fmtPrice(item.price * (parseFloat(area) || 0))} за {area} {item.unit === "м²" ? "м²" : "м.п."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cart modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-lg">Ваш выбор</h3>
              <button onClick={() => setShowCart(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedItems.map(item => (
                <div key={item.code} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.quantity} {item.unit} × {fmtPrice(item.price)}</div>
                  </div>
                  <div className="text-sm font-bold shrink-0 ml-3">{fmtPrice(item.price * item.quantity)}</div>
                </div>
              ))}

              {selectedItems.length === 0 && (
                <p className="text-center text-gray-400 py-8">Ничего не выбрано</p>
              )}
            </div>

            {selectedItems.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Итого:</span>
                  <span className="text-xl font-bold" style={{ color: brandColor }}>{fmtPrice(totalPrice)}</span>
                </div>
                {parseFloat(area) > 0 && (
                  <div className="text-xs text-gray-500 text-right">
                    {fmtPrice(totalPrice / parseFloat(area))}/м² • {area} м²
                  </div>
                )}
                <button
                  onClick={handleWhatsApp}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold active:opacity-80"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <MessageCircle className="h-5 w-5" />
                  Отправить мастеру в WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating bottom bar */}
      {itemCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white border-t shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold" style={{ color: brandColor }}>{fmtPrice(totalPrice)}</div>
              <div className="text-xs text-gray-500">{itemCount} позиций</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCart(true)}
                className="px-4 py-2.5 rounded-xl border-2 text-sm font-semibold active:scale-95"
                style={{ borderColor: brandColor, color: brandColor }}
              >
                <ShoppingCart className="h-4 w-4 inline mr-1.5" />
                Корзина
              </button>
              <button
                onClick={handleWhatsApp}
                className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold active:scale-95 flex items-center gap-1.5"
                style={{ backgroundColor: "#25D366" }}
              >
                <Send className="h-4 w-4" />
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 text-center text-xs text-gray-400 pb-4">
        <p>Цены {masterName} • potolok.ai</p>
        <p className="mt-1">Точная стоимость определяется после замера</p>
      </div>
    </div>
  );
}
