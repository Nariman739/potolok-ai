"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type CopyFieldKind =
  | "tagline"
  | "bio"
  | "quick.heroTitle"
  | "quick.pricePreLabel"
  | "quick.priceDisclaimer"
  | "quick.itemsTitle"
  | "quick.itemTitle"
  | "quick.itemBody"
  | "quick.ctaLabel"
  | "warranties.itemTitle"
  | "warranties.itemValue"
  | "faq.q"
  | "faq.a"
  | "about.title"
  | "about.body"
  | "portfolio.title"
  | "portfolio.description";

type CopyContext = {
  template?: string;
  companyName?: string;
  ownerName?: string;
  city?: string;
  currentValue?: string;
  client?: { name?: string; address?: string; area?: number; rooms?: number };
  item?: { kind?: string; position?: number };
  question?: string;
};

type CopySuggestion = { text: string; rationale?: string };

// Универсальная AI-кнопка: показывает Sheet с 3 вариантами текста для поля.
export function AiSuggestButton({
  field,
  context,
  onPick,
  size = "sm",
  variant = "ghost",
  label,
}: {
  field: CopyFieldKind;
  context: CopyContext;
  onPick: (text: string) => void;
  size?: "sm" | "default" | "xs";
  variant?: "ghost" | "outline" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CopySuggestion[]>([]);

  async function fetchSuggestions() {
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/ai/copy-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, context, n: 3 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Ошибка");
      }
      const { suggestions: list } = (await res.json()) as {
        suggestions: CopySuggestion[];
      };
      setSuggestions(list || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next) fetchSuggestions();
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => handleOpen(true)}
        className="gap-1 text-violet-700 hover:text-violet-800"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {label ?? "Подсказать"}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6">
          <SheetHeader className="px-0">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-700" />
              AI-подсказки
            </SheetTitle>
            <SheetDescription>
              Выберите вариант — он подставится в поле. Можно отредактировать после.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading &&
              suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onPick(s.text);
                    setOpen(false);
                  }}
                  className="block w-full rounded-lg border bg-card p-3 text-left text-sm hover:border-violet-400 hover:bg-violet-50/40 transition-colors"
                >
                  {s.text}
                </button>
              ))}

            {!loading && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSuggestions}
                className="w-full"
              >
                Ещё варианты
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
