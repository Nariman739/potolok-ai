"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KpConfig, KpFormat } from "@/lib/kp/types";

// Превью PDF через POST /api/kp/preview-pdf — отдаёт blob, делаем object URL.
// Дебаунс 500ms на изменения конфига.
export function PdfPreview({
  config,
  brandColor,
  tagline,
  coverPhotoUrl,
}: {
  config: KpConfig;
  brandColor?: string | null;
  tagline?: string | null;
  coverPhotoUrl?: string | null;
}) {
  const [format, setFormat] = useState<KpFormat>("full");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);

  // Объединённый объект, по которому делаем дебаунс
  const payload = useMemo(
    () => ({
      config: { ...config, format },
      brandColor,
      tagline,
      coverPhotoUrl,
    }),
    [config, format, brandColor, tagline, coverPhotoUrl]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/kp/preview-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        // Освобождаем старый blob URL чтобы не утекало
        if (lastBlobUrlRef.current) {
          URL.revokeObjectURL(lastBlobUrlRef.current);
        }
        lastBlobUrlRef.current = url;
        setPdfUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка превью");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [payload]);

  // Освободить blob URL при размонтировании
  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) URL.revokeObjectURL(lastBlobUrlRef.current);
    };
  }, []);

  return (
    <div className="space-y-3 sticky top-4">
      <div className="flex items-center justify-between">
        <Tabs value={format} onValueChange={(v) => setFormat(v as KpFormat)}>
          <TabsList>
            <TabsTrigger value="full">Полное КП</TabsTrigger>
            <TabsTrigger value="quick">Быстрое</TabsTrigger>
          </TabsList>
        </Tabs>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="relative rounded-lg border bg-muted/30 overflow-hidden" style={{ aspectRatio: "210 / 297", minHeight: 600 }}>
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            className="absolute inset-0 h-full w-full"
            title="Превью КП"
          />
        )}
        {!pdfUrl && loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Генерируем превью...
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-red-700 gap-2 p-4 text-center">
            <span>Не удалось сгенерировать PDF: {error}</span>
            <Button variant="outline" size="sm" onClick={() => setPdfUrl(null)}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Повторить
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
