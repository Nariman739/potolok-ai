"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Loader2, RotateCcw } from "lucide-react";
import { CATEGORY_LABELS, type ProductCategory } from "@/lib/constants";

interface PriceItem {
  code: string;
  name: string;
  unit: string;
  category: ProductCategory;
  description?: string;
  defaultPrice: number;
  price: number;
  isCustom: boolean;
}

export default function PricesPage() {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/prices")
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  function updatePrice(code: string, price: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code
          ? { ...item, price, isCustom: price !== item.defaultPrice }
          : item
      )
    );
  }

  function resetCategory(category: ProductCategory) {
    setItems((prev) =>
      prev.map((item) =>
        item.category === category
          ? { ...item, price: item.defaultPrice, isCustom: false }
          : item
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ itemCode: i.code, price: i.price })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Цены сохранены");
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by category
  const categories = Object.entries(CATEGORY_LABELS) as [ProductCategory, string][];
  const grouped = categories
    .map(([cat, label]) => ({
      category: cat,
      label,
      items: items.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Управление ценами</h1>
          <p className="text-sm text-muted-foreground">
            Настройте цены под ваш бизнес. Все расчёты будут использовать ваши цены.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#152d4a]">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Сохранить
        </Button>
      </div>

      {grouped.map((group) => (
        <Card key={group.category}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{group.label}</CardTitle>
                <CardDescription>
                  {group.items.filter((i) => i.isCustom).length > 0 && (
                    <Badge variant="secondary" className="text-xs mt-1">
                      Есть кастомные цены
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetCategory(group.category)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Сбросить
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div key={item.code} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={item.price}
                      onChange={(e) => updatePrice(item.code, parseFloat(e.target.value) || 0)}
                      className={`w-28 text-right ${item.isCustom ? "border-[#1e3a5f]" : ""}`}
                      inputMode="numeric"
                    />
                    <span className="text-xs text-muted-foreground w-10">
                      {item.unit}
                    </span>
                  </div>
                  {item.isCustom && (
                    <p className="text-xs text-muted-foreground w-20 text-right">
                      ({item.defaultPrice} ₸)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
