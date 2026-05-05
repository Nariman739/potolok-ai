"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSignature,
  Copy,
  ExternalLink,
  Download,
  CheckCircle2,
  Loader2,
  Clock,
  ClipboardCheck,
} from "lucide-react";

type Props = {
  estimateId: string;
  actPublicId: string | null;
  actCreatedAt: string | null;
  actSignedAt: string | null;
  actSignerName: string | null;
  actCompletionDate: string | null;
  clientPhone: string | null;
  estimateStatus: string;
  contractConfigured: boolean;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function ActSection({
  estimateId,
  actPublicId,
  actCreatedAt,
  actSignedAt,
  actSignerName,
  actCompletionDate,
  clientPhone,
  estimateStatus,
  contractConfigured,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [completionDate, setCompletionDate] = useState<string>(
    actCompletionDate ? actCompletionDate.slice(0, 10) : todayStr(),
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAct() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/estimates/${estimateId}/act/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completionDate: new Date(completionDate).toISOString(),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка");
      setDateOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  }

  function getActUrl() {
    if (!actPublicId || typeof window === "undefined") return "";
    return `${window.location.origin}/act/${actPublicId}`;
  }

  async function copyLink() {
    const url = getActUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function whatsappShare() {
    const url = getActUrl();
    if (!url) return;
    const text = `Здравствуйте! Акт выполненных работ: ${url}\n\nОткройте по ссылке и подтвердите приёмку.`;
    const phone = clientPhone?.replace(/\D/g, "");
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank");
  }

  // Условие появления раздела — КП должен быть подтверждён + договор настроен
  if (!contractConfigured) return null;
  if (estimateStatus !== "CONFIRMED" && !actPublicId) return null;

  if (!actPublicId) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Акт выполненных работ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              После завершения монтажа создайте акт и отправьте клиенту. Клиент откроет в браузере и подпишет электронно — без распечатки.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              onClick={() => setDateOpen(true)}
              disabled={creating}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Создаю…
                </>
              ) : (
                <>
                  <FileSignature className="h-4 w-4 mr-2" /> Создать Акт выполненных работ
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Dialog open={dateOpen} onOpenChange={setDateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Дата выполнения работ</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <div>
                <Label htmlFor="completion-date">
                  Когда работы фактически выполнены
                </Label>
                <Input
                  id="completion-date"
                  type="date"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Эта дата будет указана в акте. По умолчанию — сегодня.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDateOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={createAct}
                disabled={creating}
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                {creating ? "Создаю…" : "Создать акт"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const isSigned = !!actSignedAt;

  return (
    <Card className={isSigned ? "border-emerald-300" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Акт выполненных работ
          {isSigned ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" variant="secondary">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Подписан
            </Badge>
          ) : (
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              Ожидает подписи
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSigned ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-800">
                  {actSignerName}
                </p>
                <p className="text-xs text-emerald-700">
                  {actSignedAt
                    ? new Date(actSignedAt).toLocaleString("ru-RU")
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Создан{" "}
            {actCreatedAt
              ? new Date(actCreatedAt).toLocaleString("ru-RU")
              : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {copied ? "Скопировано" : "Копировать ссылку"}
          </Button>
          <Button variant="outline" size="sm" onClick={whatsappShare}>
            WhatsApp
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/act/${actPublicId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Открыть
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/estimates/${estimateId}/act`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
