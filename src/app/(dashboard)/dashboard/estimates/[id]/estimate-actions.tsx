"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Share2, MessageCircle, Check, Trash2, Download, FileText, ClipboardCheck, RotateCcw, Copy, Calendar } from "lucide-react";
import { toast } from "sonner";

interface EstimateActionsProps {
  estimateId: string;
  publicId: string;
  clientPhone?: string | null;
  status?: string;
  contractConfigured?: boolean;
  validUntil?: Date | null;
}

export function EstimateActions({
  estimateId,
  publicId,
  clientPhone,
  status,
  contractConfigured,
  validUntil,
}: EstimateActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}/kp/${publicId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("input");
      el.value = `${window.location.origin}/kp/${publicId}`;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    const url = `${window.location.origin}/kp/${publicId}`;
    const text = encodeURIComponent(`Ваш расчёт потолка готов! Посмотрите здесь: ${url}`);
    const phone = clientPhone?.replace(/\D/g, "");
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(waUrl, "_blank");
  };

  const handleDelete = async () => {
    if (!confirm("Удалить этот расчёт? Это действие нельзя отменить.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Расчёт удалён");
        router.push("/dashboard/estimates");
      } else {
        toast.error("Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/duplicate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success("КП скопировано");
        router.push(`/dashboard/estimates/${data.id}`);
      } else {
        toast.error("Ошибка копирования");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setDuplicating(false);
    }
  };

  const handleValidUntil = async (dateStr: string) => {
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntil: dateStr || null }),
      });
      if (res.ok) {
        toast.success(dateStr ? "Срок действия установлен" : "Срок действия убран");
        router.refresh();
      } else {
        toast.error("Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  const validUntilValue = validUntil
    ? new Date(validUntil).toISOString().split("T")[0]
    : "";

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-2 text-green-600" />
            Скопировано!
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4 mr-2" />
            Скопировать ссылку
          </>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={handleWhatsApp}>
        <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
        WhatsApp
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/estimates/${estimateId}/pdf`}>
          <Download className="h-4 w-4 mr-2" />
          Скачать КП
        </a>
      </Button>
      {contractConfigured && (
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/estimates/${estimateId}/contract`}>
            <FileText className="h-4 w-4 mr-2" />
            Договор
          </a>
        </Button>
      )}
      {contractConfigured && status === "CONFIRMED" && (
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/estimates/${estimateId}/act`}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Акт
          </a>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDuplicate}
        disabled={duplicating}
      >
        <Copy className="h-4 w-4 mr-2" />
        {duplicating ? "..." : "Дублировать"}
      </Button>
      {(status === "CONFIRMED" || status === "SENT" || status === "VIEWED") && (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (!confirm("Пометить КП как пересмотренное? Клиент увидит, что оно недействительно.")) return;
            setRevising(true);
            try {
              const res = await fetch(`/api/estimates/${estimateId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "REVISED" }),
              });
              if (res.ok) {
                toast.success("КП помечено как пересмотренное");
                router.refresh();
              } else {
                toast.error("Ошибка");
              }
            } catch {
              toast.error("Ошибка соединения");
            } finally {
              setRevising(false);
            }
          }}
          disabled={revising}
          className="text-orange-600 hover:text-orange-700"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {revising ? "..." : "Пересмотреть"}
        </Button>
      )}

      {/* Срок действия КП */}
      <div className="flex items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-sm bg-background">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <label className="text-muted-foreground text-xs whitespace-nowrap">Действительно до:</label>
        <input
          type="date"
          defaultValue={validUntilValue}
          className="text-sm bg-transparent outline-none w-32"
          onChange={(e) => handleValidUntil(e.target.value)}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={deleting}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {deleting ? "Удаляем..." : "Удалить"}
      </Button>
    </div>
  );
}
