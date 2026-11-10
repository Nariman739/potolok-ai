"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Share2,
  MessageCircle,
  Check,
  Trash2,
  Download,
  FileText,
  ClipboardCheck,
  RotateCcw,
  Copy,
  Calendar,
  ExternalLink,
  RefreshCcw,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { APP_ESTIMATE_RECALC_MESSAGE } from "@/lib/room-edit";

interface EstimateActionsProps {
  estimateId: string;
  publicId: string;
  clientPhone?: string | null;
  status?: string;
  contractConfigured?: boolean;
  validUntil?: Date | null;
  /** Вид цен для клиента: detailed | summary (16.10.2026) */
  priceView?: string | null;
  /** Куда ведёт «Пересчитать»; null — КП из приложения, кнопка только объясняет */
  recalcHref: string | null;
  visualizationHref: string;
}

/**
 * Действия над КП. На телефоне (до sm) — три главных: «Открыть КП», «WhatsApp», «КП клиенту»,
 * остальное в меню «Ещё»; от sm — всё в ряд, как раньше. Логика кнопок одна на оба вида.
 */
export function EstimateActions({
  estimateId,
  publicId,
  clientPhone,
  status,
  contractConfigured,
  validUntil,
  priceView,
  recalcHref,
  visualizationHref,
}: EstimateActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"detailed" | "summary">(priceView === "summary" ? "summary" : "detailed");
  const [viewSaving, setViewSaving] = useState(false);
  const [validOpen, setValidOpen] = useState(false);

  // «Подробно» — количество × цена по позициям; «Кратко» — только названия и
  // итоги по комнатам, чтобы клиент не пересылал смету конкурентам.
  const handlePriceView = async (next: "detailed" | "summary") => {
    if (next === view || viewSaving) return;
    const prev = view;
    setView(next);
    setViewSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceView: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "summary" ? "Клиент увидит КП кратко, без цен за единицу" : "Клиент увидит КП подробно");
      router.refresh();
    } catch {
      setView(prev);
      toast.error("Не удалось сохранить вид КП");
    } finally {
      setViewSaving(false);
    }
  };
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
    if (!confirm("Удалить этот расчёт? Он попадёт в Корзину — можно будет восстановить.")) return;
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

  const handleRevise = async () => {
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
  // «24.11.2026» для пункта меню — из той же строки, без часового пояса
  const validUntilLabel = validUntilValue ? validUntilValue.split("-").reverse().join(".") : "не задан";

  const canRevise = status === "CONFIRMED" || status === "SENT" || status === "VIEWED";
  const showAct = contractConfigured && status === "CONFIRMED";
  const publicUrl = `/kp/${publicId}`;

  return (
    <div className="flex flex-wrap gap-3">
      {/* Главные — на любом экране */}
      <Button variant="outline" size="sm" asChild>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4 mr-2" />
          Открыть КП
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={handleWhatsApp}>
        <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
        WhatsApp
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/estimates/${estimateId}/pdf`}>
          <Download className="h-4 w-4 mr-2" />
          КП клиенту
        </a>
      </Button>

      {/* Остальное — в ряд от sm */}
      <div className="hidden sm:contents">
        {recalcHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={recalcHref}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Пересчитать
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => toast.info(APP_ESTIMATE_RECALC_MESSAGE)}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Пересчитать
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={visualizationHref}>✨ AI-фото</Link>
        </Button>
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
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/estimates/${estimateId}/installer-pdf`}>
            <FileText className="h-4 w-4 mr-2 text-blue-600" />
            КП монтажнику
          </a>
        </Button>
        {contractConfigured && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/estimates/${estimateId}/contract?web=1`}>
              <FileText className="h-4 w-4 mr-2" />
              Договор
            </a>
          </Button>
        )}
        {showAct && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/estimates/${estimateId}/act`}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Акт
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
          <Copy className="h-4 w-4 mr-2" />
          {duplicating ? "..." : "Дублировать"}
        </Button>
        {canRevise && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevise}
            disabled={revising}
            className="text-orange-600 hover:text-orange-700"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {revising ? "..." : "Пересмотреть"}
          </Button>
        )}

        {/* Вид цен для клиента */}
        <div className="flex items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-sm bg-background">
          <label className="text-muted-foreground text-xs whitespace-nowrap">Клиент увидит:</label>
          <div className="flex rounded-md bg-muted p-0.5">
            {(["detailed", "summary"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handlePriceView(v)}
                disabled={viewSaving}
                className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                  view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                title={v === "summary" ? "Только названия позиций и итог по комнате" : "Количество × цена по каждой позиции"}
              >
                {v === "detailed" ? "Подробно" : "Кратко"}
              </button>
            ))}
          </div>
        </div>

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

      {/* До sm — меню «Ещё» */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Ещё действия">
              <MoreHorizontal className="h-4 w-4 mr-2" />
              Ещё
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {recalcHref ? (
              <DropdownMenuItem asChild>
                <Link href={recalcHref}>
                  <RefreshCcw />
                  Пересчитать
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => toast.info(APP_ESTIMATE_RECALC_MESSAGE)}>
                <RefreshCcw />
                Пересчитать
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={visualizationHref}>
                <span className="w-4 text-center leading-none">✨</span>
                AI-фото
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                handleCopy();
                toast.success("Ссылка на КП скопирована");
              }}
            >
              <Share2 />
              Скопировать ссылку
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/estimates/${estimateId}/installer-pdf`}>
                <FileText className="text-blue-600" />
                КП монтажнику
              </a>
            </DropdownMenuItem>
            {contractConfigured && (
              <DropdownMenuItem asChild>
                <a href={`/api/estimates/${estimateId}/contract?web=1`}>
                  <FileText />
                  Договор
                </a>
              </DropdownMenuItem>
            )}
            {showAct && (
              <DropdownMenuItem asChild>
                <a href={`/api/estimates/${estimateId}/act`}>
                  <ClipboardCheck />
                  Акт
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleDuplicate} disabled={duplicating}>
              <Copy />
              {duplicating ? "Копируем…" : "Дублировать"}
            </DropdownMenuItem>
            {canRevise && (
              <DropdownMenuItem onSelect={handleRevise} disabled={revising} className="text-orange-600 focus:text-orange-700">
                <RotateCcw className="text-orange-600" />
                {revising ? "…" : "Пересмотреть"}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Клиент увидит</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={view} onValueChange={(v) => handlePriceView(v as "detailed" | "summary")}>
              <DropdownMenuRadioItem value="detailed" disabled={viewSaving}>
                Подробно
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="summary" disabled={viewSaving}>
                Кратко
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setValidOpen(true)}>
              <Calendar />
              <span>
                Действительно до: <span className="font-medium">{validUntilLabel}</span>
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleDelete} disabled={deleting}>
              <Trash2 />
              {deleting ? "Удаляем..." : "Удалить"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Дата в выпадающем меню на телефоне неудобна — отдельное окно с тем же обработчиком */}
        <Dialog open={validOpen} onOpenChange={setValidOpen}>
          <DialogContent aria-describedby={undefined} className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Срок действия КП</DialogTitle>
            </DialogHeader>
            <label className="text-sm text-muted-foreground" htmlFor="kp-valid-until">
              Действительно до
            </label>
            <input
              id="kp-valid-until"
              type="date"
              defaultValue={validUntilValue}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
              onChange={(e) => handleValidUntil(e.target.value)}
            />
            <DialogFooter>
              {validUntilValue && (
                <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => {
                    handleValidUntil("");
                    setValidOpen(false);
                  }}
                >
                  Убрать срок
                </Button>
              )}
              <Button onClick={() => setValidOpen(false)}>Готово</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
