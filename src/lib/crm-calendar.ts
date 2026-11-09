/**
 * Календарь замеров и монтажей на сайте (09.11.2026, «Небо в подарок»).
 * Без Prisma — файл импортируется и в клиентские компоненты; запросы в crm-calendar-data.ts.
 *
 * Всё считается по Астане (UTC+5): сетка месяца, «сегодня», день и время записи.
 */

export type CalendarKind = "measure" | "install";

export type CalendarEntry = {
  id: string;
  kind: CalendarKind;
  /** Уже прошло — показываем приглушённо */
  done: boolean;
  at: string;
  /** YYYY-MM-DD по Астане */
  day: string;
  /** HH:MM по Астане */
  time: string;
  label: string;
  /** null — объект без клиента, открывать нечего */
  clientId: string | null;
  mine: boolean;
};

export type RawCalendarEvent = {
  id: string;
  type: string;
  scheduledAt: Date;
  client: { id: string; name: string; address: string | null; masterId: string };
};

export type RawCalendarObject = {
  id: string;
  masterId: string;
  address: string;
  /** "saved" — замер завершён, "active" — незавершённый черновик */
  status: string;
  measuredAt: Date | null;
  createdAt: Date;
  installAt: Date | null;
  client: { id: string; name: string; address: string | null; masterId: string } | null;
};

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

function almatyIso(d: Date): string {
  return new Date(d.getTime() + ALMATY_OFFSET_MS).toISOString();
}

export function almatyDay(d: Date): string {
  return almatyIso(d).slice(0, 10);
}

export function almatyTime(d: Date): string {
  return almatyIso(d).slice(11, 16);
}

/** Момент времени из дня и времени по Астане, независимо от часового пояса браузера. */
export function almatyInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00+05:00`);
}

/** В чьём времени показывать и вводить даты. */
export type Clock = {
  /** true — пояс браузера, false — Астана */
  local: boolean;
  day: (d: Date) => string;
  time: (d: Date) => string;
  instant: (day: string, time: string) => Date;
};

export const ALMATY_CLOCK: Clock = { local: false, day: almatyDay, time: almatyTime, instant: almatyInstant };

const pad = (n: number) => String(n).padStart(2, "0");

export const LOCAL_CLOCK: Clock = {
  local: true,
  day: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  instant: (day, time) => new Date(`${day}T${time}:00`),
};

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** «среда, 12 ноября» */
export function dayTitle(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("ru-RU", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Дата для напоминания «через час». Пояс мастера из России серверу неизвестен,
 * время Астаны его бы запутало — «через час» там и так говорит всё.
 */
export function reminderDate(at: Date, currency: string): string | null {
  if (currency === "RUB") return null;
  return at.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  });
}

/** «12 нояб.» */
export function dayShort(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });
}

/**
 * Запрос к базе с запасом в сутки: сетка считается по Астане, а мастеру из России
 * записи раскладываются по его поясу, и крайние часы попадают в соседние дни.
 */
export function withMargin(grid: { from: Date; to: Date }): { from: Date; to: Date } {
  const day = 24 * 60 * 60 * 1000;
  return { from: new Date(grid.from.getTime() - day), to: new Date(grid.to.getTime() + day) };
}

/**
 * Параметр ?m=YYYY-MM; мусор — текущий месяц по Астане. Только 20xx: на отрицательном
 * годе дата перестаёт двигаться, и цикл в monthGrid вешал сервер (?m=0000-01).
 */
export function parseMonth(raw: string | undefined, now: Date = new Date()): string {
  if (raw && /^20\d{2}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return almatyDay(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Дни сетки целыми неделями с понедельника и границы запроса к базе. */
export function monthGrid(month: string): { days: string[]; from: Date; to: Date } {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const lastWeekday = (new Date(`${lastOfMonth}T00:00:00Z`).getUTCDay() + 6) % 7;
  const end = addDays(lastOfMonth, 6 - lastWeekday);

  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { days, from: almatyInstant(start, "00:00"), to: almatyInstant(addDays(end, 1), "00:00") };
}

function earliest(dates: (Date | null)[], now: Date): string | null {
  const future = dates.filter((d): d is Date => !!d && d > now).map((d) => d.getTime());
  return future.length ? new Date(Math.min(...future)).toISOString() : null;
}

/** Ближайшие будущие замер и монтаж клиента — по тем же источникам, что и календарь. */
export function nearestPlan(
  events: { type: string; scheduledAt: Date | null }[],
  objects: { measuredAt: Date | null; installAt: Date | null }[],
  now: Date = new Date(),
): { measure: string | null; install: string | null } {
  const ofType = (type: string) => events.filter((e) => e.type === type).map((e) => e.scheduledAt);
  return {
    measure: earliest([...ofType("MEASUREMENT"), ...objects.map((o) => o.measuredAt)], now),
    install: earliest([...ofType("INSTALL"), ...objects.map((o) => o.installAt)], now),
  };
}

/** Будущие запланированные события клиента — их и переносит повторное назначение. */
export function plannedEvents(
  events: { type: string; scheduledAt: Date | null }[],
  now: Date = new Date(),
): { measureAt: string | null; installEventAt: string | null } {
  const ofType = (type: string) => events.filter((e) => e.type === type).map((e) => e.scheduledAt);
  return { measureAt: earliest(ofType("MEASUREMENT"), now), installEventAt: earliest(ofType("INSTALL"), now) };
}

/** Какую будущую дату заменит новое назначение; прошедшая дата монтажа плановой не считается. */
export function plannedAt(
  c: { measureAt: string | null; installEventAt: string | null; installAt: string | null },
  kind: CalendarKind,
  now: Date = new Date(),
): string | null {
  if (kind === "measure") return c.measureAt;
  return c.installAt && new Date(c.installAt) > now ? c.installAt : c.installEventAt;
}

function labelOf(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => p?.trim()).find(Boolean) ?? "Без адреса";
}

/**
 * Записи календаря. Один и тот же замер или монтаж клиента может лежать и в событии CRM,
 * и в объекте — в один день Астаны показываем одну запись, объектную.
 */
export function buildCalendarEntries(
  events: RawCalendarEvent[],
  objects: RawCalendarObject[],
  masterId: string,
  grid: { from: Date; to: Date },
  now: Date = new Date(),
): CalendarEntry[] {
  const inGrid = (d: Date) => d >= grid.from && d < grid.to;
  const entry = (
    id: string,
    kind: CalendarKind,
    done: boolean,
    at: Date,
    label: string,
    clientId: string | null,
    ownerId: string,
  ): CalendarEntry => ({
    id,
    kind,
    done,
    at: at.toISOString(),
    day: almatyDay(at),
    time: almatyTime(at),
    label,
    clientId,
    mine: ownerId === masterId,
  });

  const result: CalendarEntry[] = [];
  const taken = new Set<string>();
  const key = (clientId: string, day: string, kind: CalendarKind) => `${clientId}|${day}|${kind}`;

  for (const o of objects) {
    const label = labelOf(o.address, o.client?.address, o.client?.name);
    const add = (id: string, kind: CalendarKind, done: boolean, at: Date) => {
      const e = entry(id, kind, done, at, label, o.client?.id ?? null, o.client?.masterId ?? o.masterId);
      result.push(e);
      if (e.clientId) taken.add(key(e.clientId, e.day, kind));
    };
    const measuredAt = o.measuredAt ?? o.createdAt;
    if (inGrid(measuredAt)) add(`m:${o.id}`, "measure", o.status === "saved" && measuredAt <= now, measuredAt);
    if (o.installAt && inGrid(o.installAt)) add(`i:${o.id}`, "install", o.installAt <= now, o.installAt);
  }

  for (const ev of events) {
    if (!inGrid(ev.scheduledAt)) continue;
    const kind: CalendarKind | null = ev.type === "MEASUREMENT" ? "measure" : ev.type === "INSTALL" ? "install" : null;
    if (!kind || taken.has(key(ev.client.id, almatyDay(ev.scheduledAt), kind))) continue;
    result.push(
      entry(`e:${ev.id}`, kind, ev.scheduledAt <= now, ev.scheduledAt, labelOf(ev.client.address, ev.client.name), ev.client.id, ev.client.masterId),
    );
  }

  return result.sort((a, b) => a.at.localeCompare(b.at));
}
