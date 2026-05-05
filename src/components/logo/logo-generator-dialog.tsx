"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Send,
  Trash2,
  History,
} from "lucide-react";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

type HistoryItem = {
  id: string;
  blobUrl: string;
  isCurrent: boolean;
  createdAt: string;
};

export function LogoGeneratorDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (url: string) => void;
}) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [readyPrompt, setReadyPrompt] = useState<string | null>(null);
  const [readyBrief, setReadyBrief] = useState<Record<string, unknown> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastLogos, setPastLogos] = useState<HistoryItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Старт диалога — задаём первый вопрос + грузим историю
  useEffect(() => {
    if (!open) return;
    if (history.length === 0 && !readyPrompt) {
      askNext([]);
    }
    fetch("/api/logo/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPastLogos(data as HistoryItem[]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Авто-скролл вниз
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, readyPrompt]);

  function reset() {
    setHistory([]);
    setDraft("");
    setReadyPrompt(null);
    setReadyBrief(null);
    setGeneratedUrl(null);
    setError(null);
  }

  async function askNext(currentHistory: ChatMessage[]) {
    setChatBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/logo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: currentHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка");

      if (data.ready) {
        setReadyPrompt(data.promptEnglish);
        setReadyBrief(data.brief ?? null);
        generate(data.promptEnglish, data.brief);
      } else if (data.nextQuestion) {
        setHistory([
          ...currentHistory,
          { role: "assistant", content: data.nextQuestion },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setChatBusy(false);
    }
  }

  async function sendAnswer() {
    if (!draft.trim() || chatBusy) return;
    const newHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: draft.trim() },
    ];
    setHistory(newHistory);
    setDraft("");
    askNext(newHistory);
  }

  async function generate(
    prompt: string,
    brief: Record<string, unknown> | null,
  ) {
    setGenerating(true);
    setGeneratedUrl(null);
    setError(null);
    try {
      const res = await fetch("/api/logo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptEnglish: prompt, brief }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка генерации");
      setGeneratedUrl(data.url);
      // Обновим историю — добавим новый
      setPastLogos((prev) => [
        {
          id: data.id,
          blobUrl: data.url,
          isCurrent: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGenerating(false);
    }
  }

  async function regenerate() {
    if (!readyPrompt) return;
    generate(readyPrompt, readyBrief);
  }

  async function saveUrl(url: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/logo/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error();
      onSaved(url);
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function deletePastLogo(id: string) {
    if (!confirm("Удалить этот логотип из истории?")) return;
    setPastLogos((prev) => prev.filter((l) => l.id !== id));
    try {
      await fetch(`/api/logo/history/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1e3a5f]" />
            Логотип через AI
          </DialogTitle>
        </DialogHeader>

        {/* Чат / результат */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 space-y-3 pb-3">
          {/* История диалога */}
          {history.map((m, i) => (
            <div
              key={i}
              className={
                "flex " + (m.role === "user" ? "justify-end" : "justify-start")
              }
            >
              <div
                className={
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
                  (m.role === "user"
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-muted text-foreground")
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {chatBusy && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-muted-foreground">думаю…</span>
              </div>
            </div>
          )}

          {/* Сгенерированный логотип */}
          {(generating || generatedUrl) && (
            <div className="flex justify-center py-3">
              <div className="rounded-xl border bg-white p-3 max-w-[280px] w-full">
                <div className="aspect-square relative bg-muted rounded-md overflow-hidden mb-2">
                  {generating ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          AI рисует логотип…
                          <br />
                          ~10-20 секунд
                        </p>
                      </div>
                    </div>
                  ) : generatedUrl ? (
                    <Image
                      src={generatedUrl}
                      alt="Logo"
                      fill
                      className="object-contain"
                      sizes="280px"
                      unoptimized
                    />
                  ) : null}
                </div>
                {generatedUrl && !generating && (
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => saveUrl(generatedUrl)}
                      disabled={saving}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      size="sm"
                    >
                      {saving ? (
                        "Сохраняю…"
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Это мой логотип
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={regenerate}
                      disabled={generating}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className="h-3 w-3 mr-2" /> Сгенерировать ещё
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
          )}

          {/* История логотипов (показываем только если есть какие-то ранее, и не во время генерации) */}
          {pastLogos.length > 0 && !generating && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <History className="h-3 w-3" />
                Предыдущие логотипы
              </div>
              <div className="grid grid-cols-3 gap-2">
                {pastLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className={
                      "relative group rounded-lg border bg-white p-1 cursor-pointer hover:border-[#1e3a5f] transition-colors " +
                      (logo.isCurrent ? "border-emerald-500 border-2" : "")
                    }
                    onClick={() => saveUrl(logo.blobUrl)}
                  >
                    <div className="aspect-square relative">
                      <Image
                        src={logo.blobUrl}
                        alt=""
                        fill
                        className="object-contain"
                        sizes="120px"
                        unoptimized
                      />
                    </div>
                    {logo.isCurrent && (
                      <div className="absolute top-1 left-1 rounded-full bg-emerald-500 p-0.5">
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePastLogo(logo.id);
                      }}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Кликни на любой чтобы поставить текущим
              </p>
            </div>
          )}
        </div>

        {/* Поле ввода */}
        {!readyPrompt && (
          <div className="px-6 pb-6 pt-2 border-t bg-white">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ваш ответ…"
                disabled={chatBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendAnswer();
                  }
                }}
              />
              <Button
                onClick={sendAnswer}
                disabled={!draft.trim() || chatBusy}
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
