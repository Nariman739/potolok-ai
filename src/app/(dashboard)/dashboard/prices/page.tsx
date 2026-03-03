"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Loader2, RotateCcw, Plus, Trash2, Info } from "lucide-react";
import { CATEGORY_LABELS, type ProductCategory } from "@/lib/constants";

interface PriceItem {
  code: string;
  name: string;
  unit: string;
  category: ProductCategory | "custom";
  description?: string;
  defaultPrice: number;
  price: number;
  isCustom: boolean;
  isCustomItem?: boolean;
  customItemId?: string;
}

export default function PricesPage() {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add custom item dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("шт.");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [addingItem, setAddingItem] = useState(false);

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
          ? { ...item, price, isCustom: item.isCustomItem ? false : price !== item.defaultPrice }
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
      // Save standard prices
      const standardItems = items.filter((i) => !i.isCustomItem);
      const res = await fetch("/api/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: standardItems.map((i) => ({ itemCode: i.code, price: i.price })),
        }),
      });
      if (!res.ok) throw new Error();

      // Save custom item prices
      const customItems = items.filter((i) => i.isCustomItem && i.customItemId);
      await Promise.all(
        customItems.map((ci) =>
          fetch(`/api/custom-items/${ci.customItemId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ price: ci.price }),
          })
        )
      );

      toast.success("Цены сохранены");
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustomItem() {
    if (!newItemName.trim() || !newItemPrice) return;
    setAddingItem(true);
    try {
      const res = await fetch("/api/custom-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItemName.trim(),
          unit: newItemUnit,
          price: parseFloat(newItemPrice) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();

      // Add to items list
      setItems((prev) => [
        ...prev,
        {
          code: created.code,
          name: created.name,
          unit: created.unit,
          category: "custom" as const,
          defaultPrice: created.price,
          price: created.price,
          isCustom: false,
          isCustomItem: true,
          customItemId: created.id,
        },
      ]);

      setAddDialogOpen(false);
      setNewItemName("");
      setNewItemUnit("шт.");
      setNewItemPrice("");
      toast.success("Позиция добавлена");
    } catch {
      toast.error("Ошибка добавления");
    } finally {
      setAddingItem(false);
    }
  }

  async function handleDeleteCustomItem(customItemId: string) {
    try {
      const res = await fetch(`/api/custom-items/${customItemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.customItemId !== customItemId));
      toast.success("Позиция удалена");
    } catch {
      toast.error("Ошибка удаления");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by category — standard items
  const categories = Object.entries(CATEGORY_LABELS) as [ProductCategory, string][];
  const grouped = categories
    .map(([cat, label]) => ({
      category: cat,
      label,
      items: items.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  // Custom items (separate group)
  const customGroupItems = items.filter((i) => i.isCustomItem);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Управление ценами</h1>
          <p className="text-sm text-muted-foreground">
            Настройте цены под ваш бизнес. Все расчёты будут использовать ваши цены.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#152d4a] w-full sm:w-auto">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Сохранить
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          Все цены заполнены средними рыночными значениями. Можно начать делать расчёты прямо сейчас, а цены настроить позже.
        </p>
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
                <div key={item.code} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={item.price}
                      onChange={(e) => updatePrice(item.code, parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className={`w-24 sm:w-28 text-right ${item.isCustom ? "border-[#1e3a5f]" : ""}`}
                      inputMode="numeric"
                    />
                    <span className="text-xs text-muted-foreground w-10">
                      {item.unit}
                    </span>
                    {item.isCustom && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        ({item.defaultPrice} ₸)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Custom items section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Ваши позиции</CardTitle>
              <CardDescription>
                Добавьте свои позиции, которые будут доступны в калькуляторе
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Добавить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {customGroupItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              У вас пока нет своих позиций. Нажмите &quot;Добавить&quot; чтобы создать.
            </p>
          ) : (
            <div className="space-y-3">
              {customGroupItems.map((item) => (
                <div key={item.code} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={item.price}
                      onChange={(e) => updatePrice(item.code, parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className="w-24 sm:w-28 text-right"
                      inputMode="numeric"
                    />
                    <span className="text-xs text-muted-foreground w-10">
                      {item.unit}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => item.customItemId && handleDeleteCustomItem(item.customItemId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add custom item dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая позиция</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Название</Label>
              <Input
                id="itemName"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Например: Светодиодная лента"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Единица измерения</Label>
                <Select value={newItemUnit} onValueChange={setNewItemUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="шт.">шт.</SelectItem>
                    <SelectItem value="м.п.">м.п.</SelectItem>
                    <SelectItem value="м²">м²</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemPrice">Цена (₸)</Label>
                <Input
                  id="itemPrice"
                  type="number"
                  min="0"
                  step="100"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="2000"
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleAddCustomItem}
              disabled={addingItem || !newItemName.trim() || !newItemPrice}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              {addingItem && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
