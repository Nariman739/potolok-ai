"use client";

import { useState, useRef, useMemo } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Camera, Plus, Trash2, X, Loader2 } from "lucide-react";

export type PhotoCategoryKey =
  | "BEFORE"
  | "PROCESS"
  | "AFTER"
  | "MEASUREMENT"
  | "DEMOLITION"
  | "OTHER";

export type ObjectPhoto = {
  id: string;
  blobUrl: string;
  category: PhotoCategoryKey;
  caption: string | null;
  takenAt: string;
};

const CATEGORY_LABELS: Record<PhotoCategoryKey, string> = {
  BEFORE: "До",
  PROCESS: "Процесс",
  AFTER: "После",
  MEASUREMENT: "Замер",
  DEMOLITION: "Демонтаж",
  OTHER: "Другое",
};

const CATEGORY_COLORS: Record<PhotoCategoryKey, string> = {
  BEFORE: "bg-amber-100 text-amber-800",
  PROCESS: "bg-blue-100 text-blue-800",
  AFTER: "bg-emerald-100 text-emerald-800",
  MEASUREMENT: "bg-purple-100 text-purple-800",
  DEMOLITION: "bg-red-100 text-red-800",
  OTHER: "bg-zinc-200 text-zinc-700",
};

const CATEGORIES: PhotoCategoryKey[] = [
  "BEFORE",
  "PROCESS",
  "AFTER",
  "MEASUREMENT",
  "DEMOLITION",
  "OTHER",
];

export function PhotoGallery({
  clientId,
  initialPhotos,
}: {
  clientId: string;
  initialPhotos: ObjectPhoto[];
}) {
  const [photos, setPhotos] = useState<ObjectPhoto[]>(initialPhotos);
  const [filter, setFilter] = useState<PhotoCategoryKey | "ALL">("ALL");
  const [uploading, setUploading] = useState(false);
  const [pendingCategory, setPendingCategory] =
    useState<PhotoCategoryKey>("PROCESS");
  const [viewing, setViewing] = useState<ObjectPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return photos;
    return photos.filter((p) => p.category === filter);
  }, [photos, filter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { ALL: photos.length };
    for (const p of photos) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [photos]);

  function pickFiles() {
    fileInputRef.current?.click();
  }

  async function uploadFiles(files: FileList) {
    setError(null);
    setUploading(true);
    const uploaded: ObjectPhoto[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("clientId", clientId);
        fd.append("category", pendingCategory);
        const res = await fetch("/api/object-photos", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Ошибка загрузки");
        }
        const photo = await res.json();
        uploaded.push(photo as ObjectPhoto);
      }
      setPhotos((prev) => [...uploaded, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deletePhoto(id: string) {
    if (!confirm("Удалить это фото?")) return;
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/object-photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setPhotos(prev);
      setError("Не удалось удалить");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (filter === "ALL"
                ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                : "border-border bg-white text-muted-foreground hover:border-[#1e3a5f]/40")
            }
          >
            Все · {counts.ALL ?? 0}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (filter === c
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-border bg-white text-muted-foreground hover:border-[#1e3a5f]/40")
              }
            >
              {CATEGORY_LABELS[c]} · {counts[c] ?? 0}
            </button>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-2">
            Категория для новых фото
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setPendingCategory(c)}
                className={
                  "rounded-md border px-3 py-1.5 text-xs transition-colors " +
                  (pendingCategory === c
                    ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                    : "border-border bg-white text-muted-foreground")
                }
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <Button
            onClick={pickFiles}
            disabled={uploading}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Загружаю…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" /> Добавить фото
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadFiles(e.target.files);
              }
            }}
          />
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {photos.length === 0
              ? "Фото пока нет — добавьте первые"
              : "В этой категории пусто"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer"
              onClick={() => setViewing(photo)}
            >
              <Image
                src={photo.blobUrl}
                alt={photo.caption || ""}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 33vw"
                unoptimized
              />
              <div className="absolute top-1.5 left-1.5">
                <span
                  className={
                    "text-[10px] font-medium rounded px-1.5 py-0.5 " +
                    CATEGORY_COLORS[photo.category]
                  }
                >
                  {CATEGORY_LABELS[photo.category]}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePhoto(photo.id);
                }}
                className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Удалить"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {photo.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2">
                  {photo.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-4xl">
          {viewing && (
            <div className="space-y-3">
              <div className="relative aspect-video bg-black rounded-md overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewing.blobUrl}
                  alt={viewing.caption ?? ""}
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={() => setViewing(null)}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-2 text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className={
                      "text-xs font-medium rounded px-2 py-1 " +
                      CATEGORY_COLORS[viewing.category]
                    }
                  >
                    {CATEGORY_LABELS[viewing.category]}
                  </span>
                  {viewing.caption && (
                    <p className="text-sm mt-1">{viewing.caption}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(viewing.takenAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
