"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { almatyDay, almatyInstant, almatyTime, dayTitle, type CalendarKind } from "@/lib/crm-calendar";
import type { CalendarClient } from "@/lib/crm-calendar-data";

const SEARCH_LIMIT = 6;

function clientTitle(c: CalendarClient) {
  return c.name.trim() || c.phone || "Без имени";
}

export function AddEntryDialog({
  day,
  clients,
  onClose,
}: {
  /** День по Астане; null — диалог закрыт */
  day: string | null;
  clients: CalendarClient[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [kind, setKind] = useState<CalendarKind>("measure");
  const [search, setSearch] = useState("");
  const [client, setClient] = useState<CalendarClient | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!day) return;
    setDate(day);
    setTime("10:00");
    setKind("measure");
    setSearch("");
    setClient(null);
  }, [day]);

  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    const digits = q.replace(/\D/g, "");
    const found = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.address ?? "").toLowerCase().includes(q) ||
            (!!digits && (c.phone ?? "").includes(digits)),
        )
      : clients;
    return found.slice(0, SEARCH_LIMIT);
  }, [clients, search]);

  const canSave = !!client && !!date && !!time && !saving;
  // Дата монтажа живёт в объекте, новая заменит прежнюю — как и в диалоге на доске
  const replaced = kind === "install" && client?.objectId && client.installAt ? new Date(client.installAt) : null;

  async function save() {
    if (!client) return;
    setSaving(true);
    try {
      const iso = almatyInstant(date, time).toISOString();
      const res =
        kind === "install" && client.objectId
          ? await fetch(`/api/objects/${client.objectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ installAt: iso }),
            })
          : await fetch(`/api/clients/${client.id}/events`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: kind === "install" ? "INSTALL" : "MEASUREMENT", scheduledAt: iso }),
            });
      if (!res.ok) throw new Error();
      toast.success("Добавлено в календарь");
      onClose();
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!day} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить в календарь</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={kind === "measure" ? "secondary" : "outline"}
            onClick={() => setKind("measure")}
          >
            Замер
          </Button>
          <Button
            size="sm"
            variant={kind === "install" ? "secondary" : "outline"}
            onClick={() => setKind("install")}
          >
            Монтаж
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="entry-date">Дата</Label>
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entry-time">Время по Астане</Label>
            <Input id="entry-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="entry-client">Клиент</Label>
          {client ? (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {clientTitle(client)}
                {client.address ? <span className="text-muted-foreground"> · {client.address}</span> : null}
              </span>
              <button className="flex-shrink-0 text-xs text-[#1e3a5f] underline" onClick={() => setClient(null)}>
                Изменить
              </button>
            </div>
          ) : (
            <>
              <Input
                id="entry-client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Имя, телефон или адрес"
              />
              <div className="max-h-44 overflow-y-auto rounded-md border">
                {matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">Никого не нашли</p>}
                {matches.map((c) => (
                  <button
                    key={c.id}
                    data-client={c.id}
                    onClick={() => setClient(c)}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {clientTitle(c)}
                    {c.address ? <span className="text-muted-foreground"> · {c.address}</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {replaced && (
          <p className="text-xs text-amber-800">
            Сейчас монтаж {dayTitle(almatyDay(replaced))} в {almatyTime(replaced)} — дата заменится.
          </p>
        )}

        {date && time && (
          <p data-summary className="text-sm font-medium">
            {kind === "install" ? "Монтаж" : "Замер"}: {dayTitle(date)} в {time} по Астане
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!canSave} onClick={save}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
