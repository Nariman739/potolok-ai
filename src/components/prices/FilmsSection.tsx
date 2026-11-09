"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrency } from "@/components/currency-provider";
import type { CanvasFilm } from "@/lib/canvas-pricing";

type Extra = { width: string; price: string };
type Editing = { key: string | null; name: string; p320: string; p550: string; extras: Extra[] };

const widthLabel = (cm: number | null) => (cm === null ? "любая" : `до ${(cm / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`);
const EMPTY: Editing = { key: null, name: "", p320: "", p550: "", extras: [] };

/** Плёнки с ценами по ширине. Считаются только по выбору на объект или комнату. */
export function FilmsSection() {
  const { symbol } = useCurrency();
  const [films, setFilms] = useState<CanvasFilm[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/prices/films", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) { setFilms(data.films); setIsOwner(data.isOwner); } })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  function open(film: CanvasFilm) {
    const price = (w: number) => String(film.steps.find((s) => s.maxWidthCm === w)?.price ?? "");
    setEditing({
      key: film.key,
      name: film.name,
      p320: price(320),
      p550: price(550),
      extras: film.steps
        .filter((s) => s.maxWidthCm !== 320 && s.maxWidthCm !== 550)
        .map((s) => ({ width: s.maxWidthCm === null ? "" : String(s.maxWidthCm / 100), price: String(s.price) })),
    });
  }

  async function save() {
    if (!editing) return;
    const steps = [
      { maxWidthCm: 320 as number | null, price: Number(editing.p320) },
      { maxWidthCm: 550 as number | null, price: Number(editing.p550) },
      ...editing.extras.map((e) => ({
        maxWidthCm: e.width.trim() ? Math.round(parseFloat(e.width.replace(",", ".")) * 100) : null,
        price: Number(e.price),
      })),
    ];
    // NaN в JSON становится null, то есть «любая ширина»: опечатку ловим здесь.
    if (steps.some((s) => Number.isNaN(s.maxWidthCm))) {
      toast.error("Ширину укажите числом в метрах, например 3,6");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing.key ? `/api/prices/films/${editing.key}` : "/api/prices/films", {
        method: editing.key ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, steps }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error ?? "Не удалось сохранить плёнку"); return; }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing?.key || !confirm(`Удалить плёнку «${editing.name}»?`)) return;
    const res = await fetch(`/api/prices/films/${editing.key}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Не удалось удалить плёнку"); return; }
    setEditing(null);
    load();
  }

  if (!isOwner && films.length === 0) return null;
  const setExtra = (i: number, patch: Partial<Extra>) =>
    setEditing((prev) => prev && { ...prev, extras: prev.extras.map((e, n) => (n === i ? { ...e, ...patch } : e)) });

  return (
    <div className="mt-3 space-y-2">
      {films.map((film) => (
        <button key={film.key} type="button" disabled={!isOwner} onClick={() => open(film)}
          className="flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left hover:bg-gray-50">
          <Layers className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{film.name}</span>
            <span className="block text-xs text-muted-foreground">
              {film.steps.map((s) => `${widthLabel(s.maxWidthCm)}: ${s.price}`).join(" · ")} {symbol}/м²
            </span>
          </span>
        </button>
      ))}
      {isOwner && (
        <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Новая плёнка с ценами по ширине
        </Button>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.key ? "Плёнка" : "Новая плёнка"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="filmName">Название</Label>
                <Input id="filmName" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="filmP320">До 3,2 м ({symbol}/м²)</Label>
                  <Input id="filmP320" type="number" min="0" inputMode="numeric" value={editing.p320} onChange={(e) => setEditing({ ...editing, p320: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filmP550">До 5,5 м ({symbol}/м²)</Label>
                  <Input id="filmP550" type="number" min="0" inputMode="numeric" value={editing.p550} onChange={(e) => setEditing({ ...editing, p550: e.target.value })} />
                </div>
              </div>
              {editing.extras.map((extra, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Ширина, м" placeholder="Ширина, м. Пусто — любая" value={extra.width} onChange={(e) => setExtra(i, { width: e.target.value })} />
                  <Input aria-label="Цена" type="number" min="0" inputMode="numeric" placeholder="Цена" value={extra.price} onChange={(e) => setExtra(i, { price: e.target.value })} />
                  <Button variant="ghost" size="icon" aria-label="Убрать ширину"
                    onClick={() => setEditing({ ...editing, extras: editing.extras.filter((_, n) => n !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, extras: [...editing.extras, { width: "", price: "" }] })}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Добавить ширину
              </Button>
            </div>
          )}
          <DialogFooter className="gap-2">
            {editing?.key && (
              <Button variant="ghost" className="text-red-600" onClick={remove}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Удалить
              </Button>
            )}
            <Button disabled={saving || !editing?.name.trim() || !editing?.p320 || !editing?.p550} onClick={save}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
