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
import { dayTitle, plannedAt, type CalendarKind } from "@/lib/crm-calendar";
import type { CalendarClient } from "@/lib/crm-calendar-data";
import { useClock } from "@/components/use-clock";

const SEARCH_LIMIT = 6;

export type PlanTarget = { at: string; eventId?: string; objectId?: string; objectLabel?: string };

function clientTitle(c: CalendarClient) {
  return c.name.trim() || c.phone || "Без имени";
}

export function AddEntryDialog({
  day,
  clients = [],
  fixedClient,
  target,
  initialKind = "measure",
  initialTime = "10:00",
  onClose,
}: {
  /** День в часах мастера; null — диалог закрыт */
  day: string | null;
  clients?: CalendarClient[];
  /** Открыт из карточки клиента или записи календаря: клиент уже выбран и не меняется */
  fixedClient?: CalendarClient;
  /** Конкретная запись календаря, которую переносят */
  target?: PlanTarget;
  initialKind?: CalendarKind;
  initialTime?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const clock = useClock();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [kind, setKind] = useState<CalendarKind>(initialKind);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CalendarClient | null>(null);
  const [saving, setSaving] = useState(false);
  const client = fixedClient ?? picked;

  useEffect(() => {
    if (!day) return;
    setDate(day);
    setTime(initialTime);
    setKind(initialKind);
    setSearch("");
    setPicked(null);
  }, [day, initialKind, initialTime]);

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
  const currentIso = target?.at ?? (client ? plannedAt(client, kind) : null);
  const replaced = currentIso ? new Date(currentIso) : null;
  const noun = kind === "install" ? "монтаж" : "замер";
  const zone = clock.local ? "" : " по Астане";
  // Дата монтажа пишется в один объект — при нескольких видно, в какой
  const objectAddress =
    kind === "install" && !target?.eventId && client && client.objectCount > 1
      ? target?.objectLabel || client.objectAddress || "Без адреса"
      : null;

  async function send(at: string | null, done: string, note?: string) {
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, at, eventId: target?.eventId, objectId: target?.objectId, note }),
      });
      if (!res.ok) throw new Error();
      const { moved } = await res.json();
      if (moved === false) toast.error("Дата сохранена, но карточку на доске перенести не удалось");
      else toast.success(done);
      onClose();
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  function cancelPlan() {
    if (!replaced || !confirm(`Отменить ${noun}?`)) return;
    const done = kind === "install" ? "Монтаж отменён" : "Замер отменён";
    send(null, done, `${done}: ${dayTitle(clock.day(replaced))} в ${clock.time(replaced)}${zone}`);
  }

  return (
    <Dialog open={!!day} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {fixedClient ? `${replaced ? "Перенести" : "Назначить"} ${noun}` : "Добавить в календарь"}
          </DialogTitle>
        </DialogHeader>

        {!target && (
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="entry-date">Дата</Label>
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entry-time">Время{zone}</Label>
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
              {!fixedClient && (
                <button className="flex-shrink-0 text-xs text-[#1e3a5f] underline" onClick={() => setPicked(null)}>
                  Изменить
                </button>
              )}
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
                    onClick={() => setPicked(c)}
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

        {objectAddress && (
          <p data-object-address className="text-xs text-muted-foreground">
            Дата запишется в объект: {objectAddress}
          </p>
        )}

        {replaced && (
          <p className="text-xs text-amber-800">
            Сейчас {noun} {dayTitle(clock.day(replaced))} в {clock.time(replaced)} — дата заменится.
          </p>
        )}

        {date && time && (
          <p data-summary className="text-sm font-medium">
            {kind === "install" ? "Монтаж" : "Замер"}: {dayTitle(date)} в {time}{zone}
          </p>
        )}

        <DialogFooter>
          {replaced && (
            <Button variant="ghost" className="text-red-700 sm:mr-auto" disabled={saving} onClick={cancelPlan}>
              Отменить {noun}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => send(clock.instant(date, time).toISOString(), replaced ? "Дата перенесена" : "Добавлено в календарь")}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
