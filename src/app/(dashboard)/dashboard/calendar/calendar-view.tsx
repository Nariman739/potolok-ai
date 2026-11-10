"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayTitle, monthTitle, shiftMonth, type CalendarEntry } from "@/lib/crm-calendar";
import type { CalendarClient } from "@/lib/crm-calendar-data";
import { useClock } from "@/components/use-clock";
import { AddEntryDialog, type PlanTarget } from "./add-entry-dialog";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CELL_LIMIT = 3;

const navLink = "inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-sm hover:bg-muted";

function entryClass(e: CalendarEntry) {
  if (e.kind === "install") {
    return e.done ? "text-amber-900/55 hover:bg-amber-50" : "bg-amber-100 text-amber-900 hover:bg-amber-200";
  }
  return e.done ? "text-blue-900/55 hover:bg-blue-50" : "bg-blue-100 text-blue-900 hover:bg-blue-200";
}

// Объект без клиента и адреса подписан «Без адреса» — одним словом не понять, что это за запись
function entryLabel(e: CalendarEntry) {
  if (!e.clientId && e.label === "Без адреса") return e.kind === "install" ? "Монтаж без адреса" : "Замер без адреса";
  return e.label;
}

function Entry({ entry, onEdit }: { entry: CalendarEntry; onEdit?: (e: CalendarEntry) => void }) {
  const label = entryLabel(entry);
  const body = (
    <>
      <span className="font-medium">{entry.time}</span> {label}
    </>
  );
  const className = `block truncate rounded px-1.5 py-0.5 text-xs leading-4 ${entryClass(entry)}`;
  if (!entry.clientId) {
    return (
      <div
        title={`${label} — объект без клиента`}
        onClick={(e) => e.stopPropagation()}
        className={`${className} cursor-default`}
      >
        {body}
      </div>
    );
  }
  const link = (
    <Link
      href={`/dashboard/clients/${entry.clientId}`}
      title={label}
      onClick={(e) => e.stopPropagation()}
      className={onEdit ? `${className} min-w-0 flex-1` : className}
    >
      {body}
    </Link>
  );
  if (!onEdit) return link;
  return (
    <div className="flex items-center gap-0.5">
      {link}
      <button
        type="button"
        data-edit={entry.id}
        aria-label="Перенести или отменить"
        title="Перенести или отменить"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(entry);
        }}
        className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// Перенести можно будущую запись-план; замер из объекта — это факт, его дату не двигаем
function isPlanned(e: CalendarEntry) {
  return !e.done && !!e.clientId && (e.id.startsWith("e:") || e.id.startsWith("i:"));
}

function targetOf(e: CalendarEntry): PlanTarget {
  const id = e.id.slice(2);
  return e.id.startsWith("e:") ? { at: e.at, eventId: id } : { at: e.at, objectId: id, objectLabel: e.label };
}

// ───────────────────────── Телефон ─────────────────────────

type MobileMode = "today" | "week" | "month";
const MODES: { key: MobileMode; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
];

// Режим живёт в sessionStorage как внешнее хранилище: на сервере его нет, гидратация не расходится
const MOBILE_MODE_KEY = "calendar-mode-v1";
const modeListeners = new Set<() => void>();
function readMode(): MobileMode | null {
  try {
    const v = sessionStorage.getItem(MOBILE_MODE_KEY);
    return v === "today" || v === "week" || v === "month" ? v : null;
  } catch {
    return null;
  }
}
function subscribeMode(cb: () => void) {
  modeListeners.add(cb);
  return () => {
    modeListeners.delete(cb);
  };
}
function writeMode(m: MobileMode) {
  try {
    sessionStorage.setItem(MOBILE_MODE_KEY, m);
  } catch {}
  modeListeners.forEach((fn) => fn());
}

// Сдвиг дня YYYY-MM-DD на n суток — только для навигации по сетке, без часовых поясов
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Точки-счётчики по типам записей дня: синяя — замер, янтарная — монтаж */
function Dots({ list, onDark }: { list: CalendarEntry[]; onDark: boolean }) {
  const measure = list.filter((e) => e.kind === "measure").length;
  const install = list.filter((e) => e.kind === "install").length;
  return (
    <span className="flex h-3 items-center justify-center gap-1 text-[9px] font-semibold leading-none">
      {measure > 0 && (
        <span className={`inline-flex items-center gap-px ${onDark ? "text-white" : "text-blue-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${onDark ? "bg-blue-200" : "bg-blue-400"}`} />
          {measure > 1 ? measure : ""}
        </span>
      )}
      {install > 0 && (
        <span className={`inline-flex items-center gap-px ${onDark ? "text-white" : "text-amber-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${onDark ? "bg-amber-200" : "bg-amber-400"}`} />
          {install > 1 ? install : ""}
        </span>
      )}
    </span>
  );
}

/**
 * Календарь на телефоне: «Сегодня» — записи на сегодня, «Неделя» — полоска пн–вс с точками,
 * «Месяц» — компактная сетка. Тап по дню показывает его записи ниже, свайп листает неделю/месяц.
 * Данные те же, что у десктопной сетки.
 */
function MobileCalendar({
  month,
  days,
  today,
  byDay,
  initialDay,
  editHandler,
  onAdd,
}: {
  month: string;
  days: string[];
  today: string;
  byDay: Map<string, CalendarEntry[]>;
  initialDay: string;
  editHandler: (e: CalendarEntry) => ((e: CalendarEntry) => void) | undefined;
  onAdd: (day: string) => void;
}) {
  const router = useRouter();
  const savedMode = useSyncExternalStore(subscribeMode, readMode, () => null);
  const [localMode, setLocalMode] = useState<MobileMode | null>(null);
  const mode: MobileMode = localMode ?? savedMode ?? "week";
  const [selected, setSelected] = useState(initialDay);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);
  const weekIndex = Math.max(0, weeks.findIndex((w) => w.includes(selected)));
  const week = weeks[weekIndex] ?? weeks[0];
  const todayInGrid = days.includes(today);
  const shownDay = mode === "today" ? today : selected;
  const list = byDay.get(shownDay) ?? [];

  function goTo(day: string) {
    // День внутри сетки — просто выбираем; снаружи — соседний месяц с этим днём в адресе
    if (days.includes(day)) setSelected(day);
    else router.push(`/dashboard/calendar?m=${day.slice(0, 7)}&d=${day}`);
  }

  function setMode(next: MobileMode) {
    setLocalMode(next);
    writeMode(next);
    if (next === "today") {
      if (todayInGrid) setSelected(today);
      else router.push(`/dashboard/calendar?d=${today}`);
    }
  }

  function swipe(delta: number) {
    if (mode === "week") goTo(addDays(selected, 7 * delta));
    else if (mode === "month") router.push(`/dashboard/calendar?m=${shiftMonth(month, delta)}`);
  }
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) swipe(dx < 0 ? 1 : -1);
  }

  const dayCell = (day: string, compact: boolean) => {
    const isSelected = day === shownDay;
    const isToday = day === today;
    const outside = !day.startsWith(month);
    return (
      <button
        key={day}
        type="button"
        data-mday={day}
        aria-pressed={isSelected}
        onClick={() => setSelected(day)}
        className={`flex flex-col items-center gap-0.5 rounded-lg ${compact ? "py-1" : "py-1.5"} ${
          isSelected ? "bg-[#1e3a5f] text-white" : outside ? "text-muted-foreground/50" : "text-foreground hover:bg-muted"
        }`}
      >
        {!compact && <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>{WEEKDAYS[days.indexOf(day) % 7]}</span>}
        <span
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${
            isToday && !isSelected ? "border border-[#1e3a5f] font-semibold text-[#1e3a5f]" : isToday ? "font-semibold" : ""
          }`}
        >
          {Number(day.slice(8))}
        </span>
        <Dots list={byDay.get(day) ?? []} onDark={isSelected} />
      </button>
    );
  };

  return (
    <div className="space-y-3 md:hidden" data-cal-mobile={mode}>
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            data-mode={m.key}
            aria-pressed={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${mode === m.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="space-y-3">
        {mode === "week" && (
          <div className="grid grid-cols-7 gap-0.5 rounded-lg border p-1" data-week={week[0]}>
            {week.map((day) => dayCell(day, false))}
          </div>
        )}

        {mode === "month" && (
          <div className="rounded-lg border p-1" data-month-grid>
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-0.5 text-center text-[10px] text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">{days.map((day) => dayCell(day, true))}</div>
          </div>
        )}

        {mode === "today" && !todayInGrid && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Открыт другой месяц.{" "}
            <button type="button" onClick={() => setMode("today")} className="font-medium text-[#1e3a5f] underline">
              К сегодняшнему дню
            </button>
          </p>
        )}

        {(mode !== "today" || todayInGrid) && (
          <div className="space-y-1.5" data-day-entries={shownDay}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-medium first-letter:uppercase ${shownDay === today ? "text-[#1e3a5f]" : ""}`}>
                {dayTitle(shownDay)}
              </p>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onAdd(shownDay)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Добавить
              </Button>
            </div>
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">На этот день записей нет</p>
            ) : (
              list.map((e) => <Entry key={e.id} entry={e} onEdit={editHandler(e)} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Общий вид ─────────────────────────

export function CalendarView({
  month,
  days,
  today: almatyToday,
  entries: serverEntries,
  clients,
  isTeam,
  initialDay,
}: {
  month: string;
  days: string[];
  today: string;
  entries: CalendarEntry[];
  clients: CalendarClient[];
  isTeam: boolean;
  /** День из адреса (?d=), выбранный на телефоне; null — сегодня или 1-е число */
  initialDay?: string | null;
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const clock = useClock();
  const today = clock.local ? clock.day(new Date()) : almatyToday;
  const defaultDay = today.startsWith(month) ? today : `${month}-01`;

  // Сервер раскладывает по Астане; мастеру из России — по его времени
  const entries = useMemo(
    () =>
      clock.local
        ? serverEntries.map((e) => ({ ...e, day: clock.day(new Date(e.at)), time: clock.time(new Date(e.at)) }))
        : serverEntries,
    [serverEntries, clock],
  );
  const clientFor = (e: CalendarEntry) => clients.find((c) => c.id === e.clientId);
  const editHandler = (e: CalendarEntry) => (isPlanned(e) && clientFor(e) ? setEditing : undefined);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (onlyMine && !e.mine) continue;
      map.set(e.day, [...(map.get(e.day) ?? []), e]);
    }
    return map;
  }, [entries, onlyMine]);

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
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-200" />
            Монтаж
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/40" />
            Прошло — бледнее
          </span>
          {!clock.local && <span>Время по Астане</span>}
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
                  <Entry key={e.id} entry={e} onEdit={editHandler(e)} />
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

      {/* key: переход через границу месяца (?m=&d=) не пересоздаёт компонент сам по себе,
          и выбранный день оставался старым — месяц и день из адреса пересобирают мобильный блок */}
      <MobileCalendar
        key={`${month}:${initialDay ?? ""}`}
        month={month}
        days={days}
        today={today}
        byDay={byDay}
        initialDay={initialDay && days.includes(initialDay) ? initialDay : defaultDay}
        editHandler={editHandler}
        onAdd={setAddDay}
      />

      <Dialog open={!!openDay} onOpenChange={(open) => !open && setOpenDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="first-letter:uppercase">{openDay ? dayTitle(openDay) : ""}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {(openDay ? byDay.get(openDay) ?? [] : []).map((e) => (
              <Entry
                key={e.id}
                entry={e}
                onEdit={
                  editHandler(e) &&
                  ((x) => {
                    setOpenDay(null);
                    setEditing(x);
                  })
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AddEntryDialog day={addDay} clients={clients} onClose={() => setAddDay(null)} />
      <AddEntryDialog
        day={editing?.day ?? null}
        fixedClient={editing ? clientFor(editing) : undefined}
        target={editing ? targetOf(editing) : undefined}
        initialKind={editing?.kind}
        initialTime={editing?.time}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
