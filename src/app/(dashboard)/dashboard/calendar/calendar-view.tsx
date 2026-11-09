"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayTitle, monthTitle, shiftMonth, type CalendarEntry } from "@/lib/crm-calendar";
import type { CalendarClient } from "@/lib/crm-calendar-data";
import { AddEntryDialog } from "./add-entry-dialog";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CELL_LIMIT = 3;

const navLink = "inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-sm hover:bg-muted";

function entryClass(e: CalendarEntry) {
  if (e.kind === "install") return "bg-amber-100 text-amber-900 hover:bg-amber-200";
  return e.done ? "text-blue-900/55 hover:bg-blue-50" : "bg-blue-100 text-blue-900 hover:bg-blue-200";
}

function Entry({ entry }: { entry: CalendarEntry }) {
  const body = (
    <>
      <span className="font-medium">{entry.time}</span> {entry.label}
    </>
  );
  const className = `block truncate rounded px-1.5 py-0.5 text-xs leading-4 ${entryClass(entry)}`;
  if (!entry.clientId) {
    return (
      <div
        title={`${entry.label} — объект без клиента`}
        onClick={(e) => e.stopPropagation()}
        className={`${className} cursor-default`}
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={`/dashboard/clients/${entry.clientId}`}
      title={entry.label}
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {body}
    </Link>
  );
}

export function CalendarView({
  month,
  days,
  today,
  entries,
  clients,
  isTeam,
}: {
  month: string;
  days: string[];
  today: string;
  entries: CalendarEntry[];
  clients: CalendarClient[];
  isTeam: boolean;
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const defaultDay = today.startsWith(month) ? today : `${month}-01`;

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (onlyMine && !e.mine) continue;
      map.set(e.day, [...(map.get(e.day) ?? []), e]);
    }
    return map;
  }, [entries, onlyMine]);

  const monthDays = days.filter((d) => d.startsWith(month) && byDay.has(d));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold whitespace-nowrap">{monthTitle(month)}</h1>
        <div className="flex items-center gap-1">
          <Link href={`/dashboard/calendar?m=${shiftMonth(month, -1)}`} aria-label="Предыдущий месяц" className={navLink}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link href="/dashboard/calendar" className={navLink}>
            Сегодня
          </Link>
          <Link href={`/dashboard/calendar?m=${shiftMonth(month, 1)}`} aria-label="Следующий месяц" className={navLink}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {isTeam && (
          <div className="flex gap-1">
            <Button size="sm" variant={onlyMine ? "ghost" : "secondary"} onClick={() => setOnlyMine(false)}>
              Все
            </Button>
            <Button size="sm" variant={onlyMine ? "secondary" : "ghost"} onClick={() => setOnlyMine(true)}>
              Мои
            </Button>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground md:ml-auto">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-200" />
            Замер
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-blue-200" />
            Замер прошёл
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-200" />
            Монтаж
          </span>
          <span>Время по Астане</span>
        </div>
        <Button onClick={() => setAddDay(defaultDay)} className="bg-[#1e3a5f] hover:bg-[#152d4a]">
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const shown = list.length > CELL_LIMIT ? list.slice(0, CELL_LIMIT - 1) : list;
            const outside = !day.startsWith(month);
            return (
              <div
                key={day}
                data-day={day}
                onClick={() => setAddDay(day)}
                className={`min-h-24 min-w-0 cursor-pointer space-y-0.5 border-b border-r p-1 hover:bg-muted/40 ${
                  outside ? "bg-muted/30" : ""
                }`}
              >
                <div
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
                    day === today
                      ? "bg-[#1e3a5f] font-semibold text-white"
                      : outside
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground"
                  }`}
                >
                  {Number(day.slice(8))}
                </div>
                {shown.map((e) => (
                  <Entry key={e.id} entry={e} />
                ))}
                {list.length > shown.length && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDay(day);
                    }}
                    className="block w-full rounded px-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    ещё {list.length - shown.length}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {monthDays.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            В этом месяце записей нет
          </p>
        )}
        {monthDays.map((day) => (
          <div key={day} className="space-y-1">
            <p className={`text-sm font-medium ${day === today ? "text-[#1e3a5f]" : ""}`}>{dayTitle(day)}</p>
            {byDay.get(day)!.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </div>
        ))}
      </div>

      <Dialog open={!!openDay} onOpenChange={(open) => !open && setOpenDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="first-letter:uppercase">{openDay ? dayTitle(openDay) : ""}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {(openDay ? byDay.get(openDay) ?? [] : []).map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AddEntryDialog day={addDay} clients={clients} onClose={() => setAddDay(null)} />
    </div>
  );
}
