"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  ImageIcon,
  Link2,
  Copy,
  Check,
  Trash2,
  X,
  QrCode,
  Eye,
  Pencil,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

const CEILING_TYPES = [
  "Матовый",
  "Глянцевый",
  "Сатин",
  "Двухуровневый",
  "Парящий",
  "Тканевый",
  "Другой",
];

interface Work {
  id: string;
  title: string | null;
  description: string | null;
  ceilingType: string | null;
  area: number | null;
  photos: string[];
  videoUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Settings {
  portfolioSlug: string;
  portfolioBio: string;
  firstName: string;
  companyName: string;
  whatsappPhone: string;
  address: string;
}

interface PortfolioManagerProps {
  works: Work[];
  settings: Settings;
}

export function PortfolioManager({ works: initialWorks, settings: initialSettings }: PortfolioManagerProps) {
  const [works, setWorks] = useState<Work[]>(initialWorks);
  const [settings, setSettings] = useState(initialSettings);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);

  const publicUrl = settings.portfolioSlug
    ? `https://potolok.ai/master/${settings.portfolioSlug}`
    : null;

  const copyLink = useCallback(async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Ссылка скопирована!");
    setTimeout(() => setCopied(false), 2000);
  }, [publicUrl]);

  const saveSettings = async () => {
    setSlugSaving(true);
    try {
      const res = await fetch("/api/portfolio/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioSlug: settings.portfolioSlug,
          portfolioBio: settings.portfolioBio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка сохранения");
        return;
      }
      toast.success("Настройки сохранены");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSlugSaving(false);
    }
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/portfolio/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Ошибка загрузки");
      return null;
    }

    const data = await res.json();
    return data.url;
  };

  const handlePhotosUpload = async (files: FileList, work?: Work) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadPhoto(file);
        if (url) urls.push(url);
      }

      if (work) {
        const newPhotos = [...work.photos, ...urls];
        await updateWork(work.id, { photos: newPhotos });
      }

      return urls;
    } finally {
      setUploading(false);
    }
  };

  const createWork = async (formData: FormData, photos: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          description: formData.get("description"),
          ceilingType: formData.get("ceilingType"),
          area: formData.get("area"),
          photos,
        }),
      });

      if (!res.ok) {
        toast.error("Ошибка создания");
        return;
      }

      const work = await res.json();
      setWorks([work, ...works]);
      setShowNewForm(false);
      toast.success("Работа добавлена!");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const updateWork = async (id: string, data: Partial<Work>) => {
    try {
      const res = await fetch(`/api/portfolio/works/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        toast.error("Ошибка обновления");
        return;
      }

      const updated = await res.json();
      setWorks(works.map((w) => (w.id === id ? { ...w, ...updated } : w)));
      if (editingWork?.id === id) {
        setEditingWork({ ...editingWork, ...updated });
      }
    } catch {
      toast.error("Ошибка сети");
    }
  };

  const deleteWork = async (id: string) => {
    if (!confirm("Удалить эту работу?")) return;

    try {
      const res = await fetch(`/api/portfolio/works/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error("Ошибка удаления");
        return;
      }

      setWorks(works.filter((w) => w.id !== id));
      if (editingWork?.id === id) setEditingWork(null);
      toast.success("Работа удалена");
    } catch {
      toast.error("Ошибка сети");
    }
  };

  const removePhoto = async (work: Work, photoIndex: number) => {
    const newPhotos = work.photos.filter((_, i) => i !== photoIndex);
    await updateWork(work.id, { photos: newPhotos });
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Портфолио</h1>
          <p className="text-sm text-muted-foreground">
            Ваши работы — {works.length} {works.length === 1 ? "работа" : works.length < 5 ? "работы" : "работ"}
          </p>
        </div>
        <Button
          onClick={() => setShowNewForm(true)}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          disabled={showNewForm}
        >
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      {/* Публичная ссылка */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-5 w-5 text-[#1e3a5f]" />
            <h2 className="font-semibold text-lg">Публичная ссылка</h2>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="slug" className="text-xs text-muted-foreground mb-1">
                potolok.ai/master/
              </Label>
              <Input
                id="slug"
                placeholder="ivan-almaty"
                value={settings.portfolioSlug}
                onChange={(e) =>
                  setSettings({ ...settings, portfolioSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={saveSettings} disabled={slugSaving} variant="outline">
                {slugSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          </div>

          {publicUrl && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-green-800 truncate flex-1">
                {publicUrl}
              </span>
              <Button size="sm" variant="ghost" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(publicUrl, "_blank")}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div>
            <Label htmlFor="bio" className="text-sm">О себе (виден клиентам)</Label>
            <textarea
              id="bio"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              rows={2}
              placeholder="Мастер натяжных потолков. Опыт 5 лет. Алматы и область."
              value={settings.portfolioBio}
              onChange={(e) => setSettings({ ...settings, portfolioBio: e.target.value })}
              onBlur={saveSettings}
            />
          </div>
        </CardContent>
      </Card>

      {/* Форма новой работы */}
      {showNewForm && (
        <NewWorkForm
          onSubmit={createWork}
          onCancel={() => setShowNewForm(false)}
          onUpload={handlePhotosUpload}
          uploading={uploading}
          saving={saving}
        />
      )}

      {/* Список работ */}
      {works.length === 0 && !showNewForm ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="rounded-2xl bg-[#1e3a5f]/10 p-4">
              <ImageIcon className="h-8 w-8 text-[#1e3a5f]" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Пока нет работ</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Добавьте фото ваших работ — клиенты смогут посмотреть их по ссылке
              </p>
            </div>
            <Button onClick={() => setShowNewForm(true)} className="bg-[#1e3a5f] hover:bg-[#152d4a]">
              <Plus className="h-4 w-4 mr-2" />
              Добавить первую работу
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {works.map((work) =>
            editingWork?.id === work.id ? (
              <EditWorkCard
                key={work.id}
                work={editingWork}
                onSave={async (data) => {
                  await updateWork(work.id, data);
                  setEditingWork(null);
                }}
                onCancel={() => setEditingWork(null)}
                onUpload={(files) => handlePhotosUpload(files, work)}
                onRemovePhoto={(idx) => removePhoto(work, idx)}
                uploading={uploading}
              />
            ) : (
              <WorkCard
                key={work.id}
                work={work}
                onEdit={() => setEditingWork(work)}
                onDelete={() => deleteWork(work.id)}
                onTogglePublish={() => updateWork(work.id, { isPublished: !work.isPublished })}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Карточка работы ───
function WorkCard({
  work,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  work: Work;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <Card className="overflow-hidden group">
      {/* Фото превью */}
      <div className="relative aspect-[4/3] bg-muted">
        {work.photos.length > 0 ? (
          <Image
            src={work.photos[0]}
            alt={work.title || "Работа"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        {work.photos.length > 1 && (
          <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
            +{work.photos.length - 1}
          </span>
        )}
        {/* Overlay кнопки */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Изменить
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {work.title || "Без названия"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {work.ceilingType && (
                <span className="text-xs text-muted-foreground">{work.ceilingType}</span>
              )}
              {work.area && (
                <span className="text-xs text-muted-foreground">{work.area} м²</span>
              )}
            </div>
          </div>
          <Switch
            checked={work.isPublished}
            onCheckedChange={onTogglePublish}
            className="shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Форма новой работы ───
function NewWorkForm({
  onSubmit,
  onCancel,
  onUpload,
  uploading,
  saving,
}: {
  onSubmit: (formData: FormData, photos: string[]) => void;
  onCancel: () => void;
  onUpload: (files: FileList) => Promise<string[]>;
  uploading: boolean;
  saving: boolean;
}) {
  const [photos, setPhotos] = useState<string[]>([]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const urls = await onUpload(e.target.files);
    setPhotos([...photos, ...urls]);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (photos.length === 0) {
      toast.error("Добавьте хотя бы одно фото");
      return;
    }
    const formData = new FormData(e.currentTarget);
    onSubmit(formData, photos);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Новая работа</h3>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Загрузка фото */}
          <div>
            <Label className="text-sm">Фото *</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  <Image src={url} alt="" fill className="object-cover" sizes="80px" />
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted transition-colors">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-title" className="text-sm">Название</Label>
              <Input id="new-title" name="title" placeholder="Потолок в гостиной" />
            </div>
            <div>
              <Label htmlFor="new-type" className="text-sm">Тип потолка</Label>
              <select
                id="new-type"
                name="ceilingType"
                className="w-full h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              >
                <option value="">Не указан</option>
                {CEILING_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="new-area" className="text-sm">Площадь (м²)</Label>
              <Input id="new-area" name="area" type="number" step="0.1" placeholder="25" />
            </div>
          </div>

          <div>
            <Label htmlFor="new-desc" className="text-sm">Описание</Label>
            <textarea
              id="new-desc"
              name="description"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              rows={2}
              placeholder="Двухуровневый потолок с подсветкой..."
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152d4a]" disabled={saving || uploading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Добавить работу
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Карточка редактирования ───
function EditWorkCard({
  work,
  onSave,
  onCancel,
  onUpload,
  onRemovePhoto,
  uploading,
}: {
  work: Work;
  onSave: (data: Partial<Work>) => void;
  onCancel: () => void;
  onUpload: (files: FileList) => Promise<string[]>;
  onRemovePhoto: (index: number) => void;
  uploading: boolean;
}) {
  const [title, setTitle] = useState(work.title || "");
  const [description, setDescription] = useState(work.description || "");
  const [ceilingType, setCeilingType] = useState(work.ceilingType || "");
  const [area, setArea] = useState(work.area?.toString() || "");

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await onUpload(e.target.files);
  };

  return (
    <Card className="col-span-1 sm:col-span-2 lg:col-span-3">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Редактирование</h3>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Фото */}
        <div className="flex flex-wrap gap-2">
          {work.photos.map((url, i) => (
            <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden">
              <Image src={url} alt="" fill className="object-cover" sizes="96px" />
              <button
                type="button"
                onClick={() => onRemovePhoto(i)}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted transition-colors">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
              disabled={uploading}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-sm">Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Тип потолка</Label>
            <select
              value={ceilingType}
              onChange={(e) => setCeilingType(e.target.value)}
              className="w-full h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            >
              <option value="">Не указан</option>
              {CEILING_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-sm">Площадь (м²)</Label>
            <Input type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-sm">Описание</Label>
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() =>
              onSave({ title, description, ceilingType, area: area ? parseFloat(area) : null })
            }
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            Сохранить
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
