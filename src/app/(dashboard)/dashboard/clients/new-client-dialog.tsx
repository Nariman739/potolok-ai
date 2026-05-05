"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS, type ClientSourceKey } from "./constants";

const SOURCES: ClientSourceKey[] = [
  "INSTAGRAM",
  "WHATSAPP",
  "REFERRAL",
  "SITE",
  "KASPI",
  "OTHER",
];

export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (c: { id: string; name: string; phone: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [source, setSource] = useState<ClientSourceKey | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setAddress("");
    setSource("");
    setNotes("");
    setError(null);
  }

  async function submit() {
    if (!name.trim() && !phone.trim()) {
      setError("Заполни имя или телефон");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          source: source || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Ошибка");
      }
      const created = await res.json();
      reset();
      onCreated({
        id: created.id,
        name: created.name,
        phone: created.phone ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый клиент</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cli-name">Имя</Label>
            <Input
              id="cli-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван"
            />
          </div>
          <div>
            <Label htmlFor="cli-phone">Телефон</Label>
            <Input
              id="cli-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 777 123-45-67"
              type="tel"
            />
          </div>
          <div>
            <Label htmlFor="cli-address">Адрес</Label>
            <Input
              id="cli-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Алматы, мкр Самал-2"
            />
          </div>
          <div>
            <Label>Источник</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(source === s ? "" : s)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                    (source === s
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                      : "border-border bg-white text-muted-foreground hover:border-[#1e3a5f]/40")
                  }
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="cli-notes">Заметка</Label>
            <Input
              id="cli-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Опционально"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {submitting ? "Сохраняю…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
