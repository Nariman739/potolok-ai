"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mic,
  Loader2,
  Plus,
  Trash2,
  Send,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

interface WorkItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function QuickEstimatePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountNum = parseFloat(discount) || 0;
  const finalTotal = discountNum > 0 ? Math.round(total * (1 - discountNum / 100)) : total;

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/quick-estimate/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      const newItems: WorkItem[] = data.items.map(
        (it: { name: string; quantity: number; unit: string; unitPrice: number }) => ({
          id: genId(),
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
        })
      );
      setItems((prev) => [...prev, ...newItems]);
      setText("");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setParsing(false);
    }
  }

  function addEmptyItem() {
    setItems((prev) => [
      ...prev,
      { id: genId(), name: "", quantity: 1, unit: "шт.", unitPrice: 0 },
    ]);
  }

  function updateItem(id: string, field: keyof WorkItem, value: string | number) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function handleSave() {
    if (items.length === 0) return;
    if (items.some((it) => !it.name.trim())) {
      setError("Заполните названия всех позиций");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Build CalculationResult-compatible structure
      const lineItems = items.map((it) => ({
        itemCode: `quick_${it.id}`,
        itemName: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        total: it.quantity * it.unitPrice,
      }));

      const calculationData = {
        quickEstimate: true,
        rooms: [],
        roomResults: [
          {
            roomId: "quick",
            roomName: "Работы",
            area: 0,
            perimeter: 0,
            items: lineItems,
            subtotal: total,
            heightMultiplied: false,
            subtotalAfterHeight: total,
          },
        ],
        subtotal: total,
        minOrderApplied: false,
        total: finalTotal,
        totalArea: 0,
        totalPerimeter: 0,
        totalSpots: 0,
        totalChandeliers: 0,
        pricePerM2: 0,
        calculatedAt: new Date().toISOString(),
      };

      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomsData: [],
          calculationData,
          totalArea: 0,
          total: finalTotal,
          discountPercent: discountNum,
          clientName: clientName.trim() || null,
          clientPhone: clientPhone.trim() || null,
          clientAddress: clientAddress.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Ошибка сохранения");
        return;
      }

      const estimate = await res.json();
      router.push(`/dashboard/estimates/${estimate.id}`);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Быстрое КП</h1>
          <p className="text-xs text-muted-foreground">
            Переделка, доделка, мелкие работы
          </p>
        </div>
      </div>

      {/* Voice/Text input */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Опишите работы и цены
          </label>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Слив воды 20 тысяч, замена полотна в зале 45 тысяч, 3 софита по 3 тысячи..."
              className="w-full rounded-lg border px-3 py-3 pr-12 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleParse();
                }
              }}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <span className="text-[10px] text-gray-400 mr-1">
                <Mic className="h-3.5 w-3.5 inline" /> диктовка на клавиатуре
              </span>
            </div>
          </div>

          <Button
            onClick={handleParse}
            disabled={!text.trim() || parsing}
            className="w-full bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Распознаю...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Распознать работы
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Items list */}
      {items.length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Позиции ({items.length})
              </span>
              <Button variant="ghost" size="sm" onClick={addEmptyItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Добавить
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 space-y-2 bg-gray-50/50"
                >
                  <div className="flex items-start gap-2">
                    <input
                      value={item.name}
                      onChange={(e) =>
                        updateItem(item.id, "name", e.target.value)
                      }
                      placeholder="Название работы"
                      className="flex-1 rounded border px-2.5 py-1.5 text-sm bg-white"
                    />
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "quantity",
                          Math.max(1, parseInt(e.target.value) || 1)
                        )
                      }
                      className="w-16 rounded border px-2 py-1.5 text-sm text-center bg-white"
                      min={1}
                    />
                    <select
                      value={item.unit}
                      onChange={(e) =>
                        updateItem(item.id, "unit", e.target.value)
                      }
                      className="rounded border px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="шт.">шт.</option>
                      <option value="м²">м²</option>
                      <option value="м.п.">м.п.</option>
                      <option value="комплект">компл.</option>
                      <option value="услуга">услуга</option>
                    </select>
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        value={item.unitPrice || ""}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "unitPrice",
                            Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        placeholder="Цена"
                        className="w-full rounded border px-2.5 py-1.5 text-sm pr-8 bg-white"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        ₸
                      </span>
                    </div>
                  </div>
                  {item.quantity > 1 && item.unitPrice > 0 && (
                    <p className="text-xs text-gray-500 text-right">
                      = {(item.quantity * item.unitPrice).toLocaleString("ru-RU")} ₸
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="font-semibold text-gray-700">Итого:</span>
              <span className="text-xl font-bold text-[#1e3a5f]">
                {finalTotal.toLocaleString("ru-RU")} ₸
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client info + discount */}
      {items.length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <span className="text-sm font-medium text-gray-700">
              Клиент (необязательно)
            </span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Имя клиента"
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
            />
            <input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="Телефон"
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
            />
            <input
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="Адрес объекта"
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">Скидка %</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-20 rounded border px-2.5 py-1.5 text-sm text-center"
                min={0}
                max={50}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Save button */}
      {items.length > 0 && (
        <Button
          onClick={handleSave}
          disabled={saving || total === 0}
          size="lg"
          className="w-full bg-[#F97316] hover:bg-[#ea6c0e] text-white"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Сохраняю...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Создать КП — {finalTotal.toLocaleString("ru-RU")} ₸
            </>
          )}
        </Button>
      )}
    </div>
  );
}
