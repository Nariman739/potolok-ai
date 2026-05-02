"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MessageCircle, Loader2, Lightbulb, Bug, Send } from "lucide-react";
import { toast } from "sonner";

type FeedbackType = "idea" | "bug" | "other";

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: React.ElementType }[] = [
  { value: "idea", label: "Идея", icon: Lightbulb },
  { value: "bug", label: "Баг", icon: Bug },
  { value: "other", label: "Другое", icon: Send },
];

interface FeedbackButtonProps {
  variant?: "sidebar" | "compact";
}

export function FeedbackButton({ variant = "sidebar" }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), type }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Ошибка отправки");
        return;
      }

      toast.success("Спасибо за обратную связь!");
      setMessage("");
      setOpen(false);
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Обратная связь
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Есть идея?
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Обратная связь</DialogTitle>
            <DialogDescription>
              Расскажите что улучшить или какую фичу добавить
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon as React.ComponentType<{ className?: string }>;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      type === opt.value
                        ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                        : "hover:bg-muted border-border"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "idea"
                  ? "Было бы круто если бы..."
                  : type === "bug"
                  ? "Опишите что пошло не так..."
                  : "Ваше сообщение..."
              }
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Отправить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
