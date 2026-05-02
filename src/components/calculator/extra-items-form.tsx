"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { ExtraItem } from "@/lib/types";

interface ExtraItemsFormProps {
  items: ExtraItem[];
  onChange: (items: ExtraItem[]) => void;
}

export function ExtraItemsForm({ items, onChange }: ExtraItemsFormProps) {
  function update(idx: number, field: keyof ExtraItem, value: string) {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      if (field === "name" || field === "unit") {
        return { ...it, [field]: value };
      }
      return { ...it, [field]: parseFloat(value) || 0 };
    });
    onChange(next);
  }

  function add() {
    onChange([...items, { name: "", price: 0, quantity: 1, unit: "шт." }]);
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Дополнительно</h3>
        <p className="text-xs text-muted-foreground">
          Разовые работы вне комнат: установка бруса, доставка, демонтаж и т.п.
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="space-y-1.5 rounded-lg border border-border p-2">
              <div className="flex gap-2">
                <Input
                  value={item.name}
                  onChange={(e) => update(idx, "name", e.target.value)}
                  placeholder="Название работы"
                  className="flex-1 h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => remove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.quantity || ""}
                  onChange={(e) => update(idx, "quantity", e.target.value)}
                  placeholder="Кол-во"
                  className="h-9 text-xs"
                  inputMode="decimal"
                />
                <Input
                  value={item.unit ?? ""}
                  onChange={(e) => update(idx, "unit", e.target.value)}
                  placeholder="ед."
                  className="h-9 text-xs"
                />
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={item.price || ""}
                  onChange={(e) => update(idx, "price", e.target.value)}
                  placeholder="Цена ₸"
                  className="h-9 text-xs"
                  inputMode="numeric"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Доп. работа
      </Button>
    </div>
  );
}
