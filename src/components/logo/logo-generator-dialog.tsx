"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2, CheckCircle2, Send } from "lucide-react";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Старт диалога — задаём первый вопрос
  useEffect(() => {
    if (!open || history.length > 0 || readyPrompt) return;
    askNext([]);
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
        // Автоматически генерируем сразу
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
        body: JSON.stringify({
          promptEnglish: prompt,
          brief,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка генерации");
      setGeneratedUrl(data.url);
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

  async function save() {
    if (!generatedUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/logo/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: generatedUrl }),
      });
      if (!res.ok) throw new Error();
      onSaved(generatedUrl);
      reset();
      onOpenChange(false);
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1e3a5f]" />
            Логотип через AI
          </DialogTitle>
        </DialogHeader>

        {/* Чат / результат */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2">
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
                      onClick={save}
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
        </div>

        {/* Поле ввода */}
        {!readyPrompt && (
          <DialogFooter className="!flex-col !items-stretch gap-0">
            <div className="flex gap-2 pt-2">
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
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
