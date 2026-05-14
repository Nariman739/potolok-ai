"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ImagePlus,
  Camera,
  Trash2,
  Pencil,
  Loader2,
  X,
} from "lucide-react";

export interface PriceVariant {
  id: string;
  category: string;
  baseCode: string | null;
  name: string;
  unit: string;
  price: number;
  photoUrl: string | null;
  sortOrder: number;
}

export type VariantDialogState =
  | { mode: "create"; category: string }
  | { mode: "edit"; category: string; variant: PriceVariant };

const UNIT_OPTIONS = ["шт.", "м.п.", "м²", "пара"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  canvas: "Полотно",
  profile: "Профиль",
  spot: "Софиты",
  chandelier: "Люстры",
  curtain: "Гардина",
  gardina: "Гардина",
  podshtornik: "Подшторник",
  track: "Трек",
  lightline: "Световая линия",
};
const CATEGORY_OPTIONS = ["canvas", "profile", "spot", "chandelier", "gardina", "podshtornik", "track", "lightline"] as const;

function formatPrice(n: number): string {
  return n.toLocaleString("ru-KZ") + " ₸";
}

export function VariantList({
  variants,
  onEdit,
  onPhotoClick,
}: {
  variants: PriceVariant[];
  onEdit: (v: PriceVariant) => void;
  onPhotoClick: (url: string) => void;
}) {
  if (variants.length === 0) return null;

  return (
    <>
      <Separator className="my-4" />
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Варианты с фото
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {variants.map((v) => (
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-lg border bg-card p-2.5 hover:shadow-sm transition-shadow group"
          >
            <button
              type="button"
              onClick={() => v.photoUrl && onPhotoClick(v.photoUrl)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted"
              aria-label="Просмотреть фото"
            >
              {v.photoUrl ? (
                <Image
                  src={v.photoUrl}
                  alt={v.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(v.price)} / {v.unit}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity"
              onClick={() => onEdit(v)}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

export function AddVariantButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full mt-3 border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-400"
      onClick={onClick}
    >
      <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
      Добавить вариант с фото
    </Button>
  );
}

// ============================================
// Variant dialog (create/edit/delete)
// ============================================

export function VariantDialog({
  state,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: VariantDialogState | null;
  onClose: () => void;
  onSaved: (variant: PriceVariant, mode: "create" | "edit") => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("шт.");
  const [price, setPrice] = useState("");
  // category в edit-режиме — позволяет исправить ошибочно выбранную при создании
  // (например, мастер создал "Подшторник ЛДСП" в категории "Профиль").
  const [category, setCategory] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setName(state.variant.name);
      setUnit(state.variant.unit);
      setPrice(String(state.variant.price));
      setPhotoPreview(state.variant.photoUrl);
      setPhotoFile(null);
      setRemovePhoto(false);
      setCategory(state.variant.category);
    } else {
      setName("");
      const def =
        state.category === "canvas" ? "м²" :
        state.category === "profile" || state.category === "gardina" || state.category === "podshtornik" || state.category === "track" || state.category === "lightline" ? "м.п." :
        "шт.";
      setUnit(def);
      setPrice("");
      setPhotoPreview(null);
      setPhotoFile(null);
      setRemovePhoto(false);
      setCategory(state.category);
    }
  }, [state]);

  const handlePickPhoto = () => {
    fileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Фото максимум 5MB");
      return;
    }
    setPhotoFile(file);
    setRemovePhoto(false);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (state?.mode === "edit") setRemovePhoto(true);
  };

  const handleSave = async () => {
    if (!state) return;
    if (!name.trim()) {
      toast.error("Введите название");
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error("Введите корректную цену");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      // create: используем категорию из state. edit: разрешаем сменить через select.
      form.append("category", state.mode === "edit" ? category : state.category);
      form.append("name", name.trim());
      form.append("unit", unit);
      form.append("price", String(priceNum));
      if (photoFile) form.append("photo", photoFile);
      if (removePhoto && state.mode === "edit") form.append("removePhoto", "1");

      const url = state.mode === "create"
        ? "/api/prices/variants"
        : `/api/prices/variants/${state.variant.id}`;
      const method = state.mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, { method, body: form });
      if (!res.ok) {
        const errBody = await res.text();
        toast.error(errBody || "Ошибка сохранения");
        return;
      }
      const saved = await res.json() as PriceVariant;
      onSaved(saved, state.mode);
      toast.success(state.mode === "create" ? "Вариант добавлен" : "Вариант обновлён");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!state || state.mode !== "edit") return;
    if (!confirm(`Удалить вариант «${state.variant.name}»?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/prices/variants/${state.variant.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Не удалось удалить");
        return;
      }
      onDeleted(state.variant.id);
      toast.success("Удалено");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit" ? "Редактирование варианта" : "Новый вариант"}
          </DialogTitle>
          <DialogDescription>
            {state?.mode === "edit"
              ? "Измените название, цену или фото."
              : "Загрузите фото и укажите цену — этот вариант появится в КП с тапом для смены."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo upload */}
          <div className="space-y-2">
            <Label>Фото</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {photoPreview ? (
              <div className="relative">
                <div className="relative aspect-square w-full max-w-[220px] mx-auto overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Превью"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2"
                  type="button"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Убрать
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePickPhoto}
                className="w-full aspect-[2/1] max-w-[440px] mx-auto flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/50 transition-colors text-muted-foreground"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm font-medium">Загрузить фото</span>
                <span className="text-xs">JPG, PNG, HEIC до 5MB</span>
              </button>
            )}
            {photoPreview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePickPhoto}
                className="w-full"
              >
                <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
                Заменить фото
              </Button>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="variantName">Название</Label>
            <Input
              id="variantName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Pongs белый матовый"
              autoFocus
            />
          </div>

          {/* Category (только в edit-режиме — на случай ошибки при создании) */}
          {state?.mode === "edit" && (
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category !== state.variant.category && (
                <p className="text-xs text-orange-600">
                  Категория изменена с «{CATEGORY_LABELS[state.variant.category] ?? state.variant.category}» на «{CATEGORY_LABELS[category] ?? category}»
                </p>
              )}
            </div>
          )}

          {/* Price + Unit */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="variantPrice">Цена (₸)</Label>
              <Input
                id="variantPrice"
                type="number"
                min="0"
                step="100"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>За</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {state?.mode === "edit" && (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Удалить
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !price}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Photo lightbox (click thumbnail to enlarge)
// ============================================

export function PhotoLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!url} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Фото варианта</DialogTitle>
        </DialogHeader>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Фото" className="w-full h-auto max-h-[85vh] object-contain" />
        )}
      </DialogContent>
    </Dialog>
  );
}
