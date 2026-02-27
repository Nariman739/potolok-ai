"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Share2, MessageCircle, Check, Trash2, Download, FileText, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

interface EstimateActionsProps {
  estimateId: string;
  publicId: string;
  clientPhone?: string | null;
  status?: string;
  contractConfigured?: boolean;
}

export function EstimateActions({
  estimateId,
  publicId,
  clientPhone,
  status,
  contractConfigured,
}: EstimateActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        <a href={`/api/estimates/${estimateId}/pdf`} download>
          <Download className="h-4 w-4 mr-2" />
          Скачать КП
        </a>
      </Button>
      {contractConfigured && (
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/estimates/${estimateId}/contract`} download>
            <FileText className="h-4 w-4 mr-2" />
            Договор
          </a>
        </Button>
      )}
      {contractConfigured && status === "CONFIRMED" && (
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/estimates/${estimateId}/act`} download>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Акт
          </a>
        </Button>
      )}
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
