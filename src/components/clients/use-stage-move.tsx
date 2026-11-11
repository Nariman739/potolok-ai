"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClock } from "@/components/use-clock";
import type { Clock } from "@/lib/crm-calendar";
import { installColumnFor, type CrmColumn } from "@/lib/crm-columns";
import { formatPhone } from "@/lib/phone-format";

/** Что нужно знать о клиенте, чтобы перенести его на другой этап. */
export type MoveItem = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  column: CrmColumn;
  /** Главный объект — в него пишется дата монтажа */
  objectId: string | null;
  installAt: string | null;
};

// Клиента часто заводят одним номером: тогда номер и есть заголовок
export function clientLines(item: { name: string; phone: string | null; address: string | null }) {
  const name = item.name.trim();
  const nameDigits = name.replace(/\D/g, "");
  const nameIsPhone = /^[\d\s+()-]+$/.test(name) && nameDigits.length >= 7;
  const phoneDigits = item.phone?.replace(/\D/g, "") ?? "";
  const title = nameIsPhone ? formatPhone(name) : name || (item.phone ? formatPhone(item.phone) : "Без имени");
  const phone = item.phone && name && !(nameIsPhone && nameDigits === phoneDigits) ? formatPhone(item.phone) : null;
  const address = item.address && item.address.trim().toLowerCase() !== name.toLowerCase() ? item.address : null;
  return { title, phone, address };
}

// Значение для <input type="datetime-local"> в часах мастера
function inputValue(clock: Clock, iso: string) {
  const d = new Date(iso);
  return `${clock.day(d)}T${clock.time(d)}`;
}

function presetValue(clock: Clock, days: number) {
  return `${clock.day(new Date(Date.now() + days * 86_400_000))}T10:00`;
}

/**
 * Один путь переноса на другой этап — для доски (drag-and-drop и меню «⋯»)
 * и для карточки клиента («Сменить этап»). Колонка пишется через PATCH /api/clients/:id
 * (сервер подтягивает статус), монтажные этапы следуют за датой: перенос в «Монтаж
 * запланирован» или расходящийся с датой «Монтаж» сначала спрашивает дату.
 */
export function useStageMove({
  onColumn,
  onInstallAt,
  onMoved,
}: {
  /** Оптимистично показать колонку (и вернуть при ошибке) */
  onColumn: (id: string, column: CrmColumn) => void;
  onInstallAt?: (id: string, installAt: string | null) => void;
  /** Перенос записан на сервере */
  onMoved?: (id: string, column: CrmColumn) => void;
}): { requestMove: (item: MoveItem, target: CrmColumn) => void; installDialog: ReactNode } {
  const clock = useClock();
  const [pending, setPending] = useState<{ item: MoveItem; from: CrmColumn; target: "install_planned" | "install" } | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  // installAt: строка — новая дата, null — убрать дату, undefined — не трогать
  async function commitMove(item: MoveItem, from: CrmColumn, target: CrmColumn, installAt?: string | null) {
    onColumn(item.id, target);
    try {
      const res = await fetch(`/api/clients/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmColumn: target }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onColumn(item.id, from);
      toast.error("Не удалось перенести карточку");
      return;
    }
    if (installAt !== undefined && item.objectId) {
      try {
        const res = await fetch(`/api/objects/${item.objectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installAt }),
        });
        if (!res.ok) throw new Error();
        onInstallAt?.(item.id, installAt);
      } catch {
        toast.error("Карточка перенесена, но дату сохранить не удалось");
      }
    }
    onMoved?.(item.id, target);
  }

  function requestMove(item: MoveItem, target: CrmColumn) {
    if (target === item.column) return;
    // Монтаж следует за датой: перенос, расходящийся с датой, без её правки откатился бы при перезагрузке
    const dateDisagrees = !!item.installAt && installColumnFor(new Date(item.installAt)) !== target;
    const needsDate = target === "install_planned" || (target === "install" && dateDisagrees);
    // Перенос с датой записываем только после ответа в диалоге: крестик и Esc его отменяют
    if (needsDate && item.objectId) {
      onColumn(item.id, target);
      setValue(item.installAt && !dateDisagrees ? inputValue(clock, item.installAt) : presetValue(clock, target === "install" ? 0 : 1));
      setPending({ item, from: item.column, target });
      return;
    }
    commitMove(item, item.column, target);
  }

  function cancel() {
    if (pending) onColumn(pending.item.id, pending.from);
    setPending(null);
  }

  async function confirm(withDate: boolean) {
    if (!pending) return;
    setSaving(true);
    const { item, from, target } = pending;
    if (withDate) {
      const [day, time] = value.split("T");
      const at = clock.instant(day, time);
      // Колонка по выбранной дате: «запланирован» на сегодня — это уже «Монтаж»
      await commitMove(item, from, installColumnFor(at), at.toISOString());
    } else {
      await commitMove(item, from, target, item.installAt ? null : undefined);
    }
    setSaving(false);
    setPending(null);
  }

  const lines = pending ? clientLines(pending.item) : null;
  const installDialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && cancel()}>
      <DialogContent aria-describedby={undefined} className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Когда монтаж?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {lines?.title}
          {lines?.address ? ` · ${lines.address}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setValue(presetValue(clock, 0))}>
            Сегодня
          </Button>
          <Button variant="outline" size="sm" onClick={() => setValue(presetValue(clock, 1))}>
            Завтра
          </Button>
          <Button variant="outline" size="sm" onClick={() => setValue(presetValue(clock, 2))}>
            Послезавтра
          </Button>
        </div>
        <Input type="datetime-local" className="min-w-0" value={value} onChange={(e) => setValue(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => confirm(false)}>
            Без даты
          </Button>
          <Button disabled={saving || !value} onClick={() => confirm(true)}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestMove, installDialog };
}
