// Память и бухгалтер @potolokaiBot (22.10.2026).
//
// Видение Наримана: бот — личный ассистент мастера, чтобы «ничего не держать в
// голове»: «запомни: у Серика ключ от склада», «заработал 120 тысяч от Асель»,
// «потратил 30 на материалы», «Марат занял 50, отдаст в пятницу», «кто мне
// должен?», «сколько заработал за неделю?». Вечером бот сам спрашивает, как день.
//
// Правила: бот НЕ докапывается — записал что сказали, вопросов не задаёт. Ключ —
// чат Telegram (работает без аккаунта приложения, как календарь). Ответы на
// вопросы — из базы, без модели. Про приложение в ответах не упоминаем
// (решение Наримана 22.10: бот пока самостоятельный ассистент).

import { prisma } from "@/lib/prisma";
import { aiLogOnce } from "@/lib/ai-log";
import { reportError } from "@/lib/report-error";
import { sendTelegramMessage, sendTelegramMessageWithButtons, editTelegramMessage } from "@/lib/telegram";
import { createCalendarEvent, getCalendarLink, isGoogleConfigured, DEFAULT_TIMEZONE } from "@/lib/google-calendar";
import type { MoneyDraft, AskDraft, AskPeriod } from "@/lib/calendar-assistant";
import type { BotNote } from "@/generated/prisma/client";

/** Сколько последних записей показываем на «что я записывал?». */
const NOTES_LIMIT = 10;
/** Сколько строк в ответе «сколько заработал…». */
const MONEY_LINES = 10;

export type MemoryCtx = { masterId?: string | null; timeZone?: string | null };

// ── Форматирование ────────────────────────────────────────────────────────

/** 120000 → «120 000 ₸» (обычный пробел: Intl даёт узкий неразрывный, он ломает поиск и копирование). */
export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount)).replace(/[  ]/g, " ")} ₸`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** «пт, 24 окт» в поясе мастера. */
function shortDate(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
  return s.replace(/\.$/, "");
}

function dayMonth(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "short" }).format(d).replace(/\.$/, "");
}

/** «YYYY-MM-DD» в поясе tz → Date полуночи этого дня (UTC-момент). Алматы без DST. */
function localDateToDate(ymd: string, tz: string): Date {
  const asUtc = Date.parse(`${ymd}T00:00:00Z`);
  const offset = tzOffsetMs(new Date(asUtc), tz);
  return new Date(asUtc - offset);
}

function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime();
}

/** Начало периода в поясе мастера: сегодня — локальная полночь, неделя — 7 дней, месяц — 1-е число. */
export function periodStart(period: AskPeriod, tz: string, now = new Date()): Date {
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  let startUtcLike: number;
  if (period === "today") startUtcLike = Date.UTC(y, m, d);
  else if (period === "week") startUtcLike = Date.UTC(y, m, d - 6);
  else startUtcLike = Date.UTC(y, m, 1);
  return new Date(startUtcLike - tzOffsetMs(new Date(startUtcLike), tz));
}

const PERIOD_LABEL: Record<AskPeriod, string> = { today: "сегодня", week: "за неделю", month: "за месяц" };

function deleteButton(noteId: string) {
  return [[{ text: "🗑 Удалить", callback_data: `note:del:${noteId}` }]];
}

async function logMemory(input: string, output: string) {
  await aiLogOnce({ feature: "bot-memory", input, output, ok: true, model: "db", costUsd: 0, platform: "telegram" });
}

// ── Заметка ───────────────────────────────────────────────────────────────

export async function handleNote(chatId: string, note: string, ctx: MemoryCtx, prefix = ""): Promise<void> {
  const row = await prisma.botNote.create({
    data: { telegramChatId: chatId, masterId: ctx.masterId ?? null, kind: "note", text: note },
  });
  const reply = `📝 Записал: ${esc(note)}`;
  await sendTelegramMessageWithButtons(chatId, prefix + reply, deleteButton(row.id));
  await logMemory(note, reply);
}

// ── Деньги и долги ────────────────────────────────────────────────────────

export async function handleMoney(chatId: string, m: MoneyDraft, ctx: MemoryCtx, prefix = ""): Promise<void> {
  const tz = ctx.timeZone || DEFAULT_TIMEZONE;

  if (m.kind === "debt_closed") {
    const reply = await closeDebt(chatId, m);
    await sendTelegramMessage(chatId, prefix + reply);
    await logMemory(`${m.kind} ${m.counterparty ?? ""} ${m.amount ?? ""}`, reply);
    return;
  }

  // Нет суммы — это не деньги, а заметка (правило: не спрашивать «сколько?»).
  if (!m.amount) {
    const text = [m.text, m.counterparty].filter(Boolean).join(" — ") || "деньги";
    await handleNote(chatId, text, ctx, prefix);
    return;
  }

  const dueAt = m.dueAt ? localDateToDate(m.dueAt, tz) : null;
  const row = await prisma.botNote.create({
    data: {
      telegramChatId: chatId,
      masterId: ctx.masterId ?? null,
      kind: m.kind,
      text: m.text || (m.kind === "income" ? "доход" : m.kind === "expense" ? "расход" : "долг"),
      amount: m.amount,
      counterparty: m.counterparty,
      dueAt,
    },
  });

  const who = m.counterparty ? esc(m.counterparty) : null;
  const what = m.text && m.text.toLowerCase() !== (m.counterparty ?? "").toLowerCase() ? esc(m.text) : null;
  let reply: string;
  if (m.kind === "income") {
    reply = `💰 +${formatMoney(m.amount)}${who ? ` — ${who}` : what ? ` — ${what}` : ""}. Записал.`;
  } else if (m.kind === "expense") {
    reply = `💸 −${formatMoney(m.amount)}${what ? ` — ${what}` : who ? ` — ${who}` : ""}. Записал.`;
  } else if (m.kind === "debt_to_me") {
    reply = `🤝 ${who ?? "Тебе"} ${who ? "должен тебе" : "должны"} ${formatMoney(m.amount)}${dueAt ? ` (до ${shortDate(dueAt, tz)})` : ""}. Записал.`;
  } else {
    reply = `🤝 Ты должен ${who ?? ""}${who ? " " : ""}${formatMoney(m.amount)}${dueAt ? ` (до ${shortDate(dueAt, tz)})` : ""}. Записал.`;
  }

  // Долг со сроком → событие в Google Календаре на этот день, чтобы напомнило.
  // Без календаря — только запись, кнопку не навязываем.
  if (dueAt && isGoogleConfigured()) {
    const reminded = await remindDebtInCalendar(chatId, m, dueAt, tz);
    if (reminded) reply += `\n📅 Добавил в календарь на ${shortDate(dueAt, tz)} — напомню накануне.`;
  }

  await sendTelegramMessageWithButtons(chatId, prefix + reply, deleteButton(row.id));
  await logMemory(`${m.kind} ${m.amount} ${m.counterparty ?? ""} ${m.text}`, reply);
}

async function remindDebtInCalendar(chatId: string, m: MoneyDraft, dueAt: Date, tz: string): Promise<boolean> {
  const link = await getCalendarLink(chatId);
  if (!link) return false;
  const next = new Date(dueAt.getTime() + 24 * 60 * 60 * 1000);
  const toYmd = (d: Date) => {
    const l = new Date(d.getTime() + tzOffsetMs(d, tz));
    return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}-${String(l.getUTCDate()).padStart(2, "0")}`;
  };
  const summary =
    m.kind === "debt_to_me"
      ? `${m.counterparty ?? "Должник"} вернёт долг${m.amount ? ` ${formatMoney(m.amount)}` : ""}`
      : `Вернуть долг${m.counterparty ? ` ${m.counterparty}` : ""}${m.amount ? ` ${formatMoney(m.amount)}` : ""}`;
  try {
    await createCalendarEvent(chatId, {
      summary,
      allDay: true,
      startLocal: toYmd(dueAt),
      endLocal: toYmd(next),
      description: "Записано через @potolokaiBot (potolok.ai)",
      // для событий на весь день минуты считаются от полуночи: 15 ч = накануне в 09:00
      reminderMinutes: [15 * 60],
    });
    return true;
  } catch (e) {
    reportError(e, "bot-memory", "debt calendar event failed");
    return false;
  }
}

/** «Марат отдал» / «Марат вернул 20» → закрыть долг (или уменьшить, если вернул часть). */
export async function closeDebt(chatId: string, m: MoneyDraft): Promise<string> {
  const open = await prisma.botNote.findMany({
    where: { telegramChatId: chatId, kind: { in: ["debt_to_me", "debt_mine"] }, closedAt: null, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const name = (m.counterparty ?? "").trim().toLowerCase();
  const stem = name.length > 3 ? name.slice(0, name.length - 1) : name; // Марат / Марата / Марату
  const debt =
    (name && open.find((n) => (n.counterparty ?? "").toLowerCase().startsWith(stem))) ??
    (open.length === 1 ? open[0] : null);
  if (!debt) {
    return name
      ? `Открытого долга с ${esc(m.counterparty as string)} не нашёл. Кто должен — спроси «кто мне должен?»`
      : `Не понял, чей долг закрыть. Скажи имя: «Марат отдал».`;
  }
  const who = esc(debt.counterparty ?? "Он");
  if (m.amount && debt.amount && m.amount < debt.amount) {
    const rest = debt.amount - m.amount;
    await prisma.botNote.update({ where: { id: debt.id }, data: { amount: rest } });
    return debt.kind === "debt_to_me"
      ? `✅ ${who} вернул ${formatMoney(m.amount)}, осталось ${formatMoney(rest)}.`
      : `✅ Долг ${who}: вернул ${formatMoney(m.amount)}, осталось ${formatMoney(rest)}.`;
  }
  await prisma.botNote.update({ where: { id: debt.id }, data: { closedAt: new Date() } });
  return debt.kind === "debt_to_me" ? `✅ ${who} рассчитался. Долг закрыт.` : `✅ Долг ${who} закрыт.`;
}

// ── Вопросы по записям ────────────────────────────────────────────────────

export async function handleAsk(chatId: string, a: AskDraft, ctx: MemoryCtx, prefix = ""): Promise<void> {
  const reply = await answerAsk(chatId, a, ctx);
  await sendTelegramMessage(chatId, prefix + reply);
  await logMemory(`${a.ask} ${a.period ?? ""} ${a.query ?? ""}`, reply);
}

/** Текст ответа (без Telegram) — для selftest. */
export async function answerAsk(chatId: string, a: AskDraft, ctx: MemoryCtx): Promise<string> {
  const tz = ctx.timeZone || DEFAULT_TIMEZONE;
  const base = { telegramChatId: chatId, deletedAt: null as null };

  if (a.ask === "notes") {
    const notes = await prisma.botNote.findMany({
      where: { ...base, kind: "note" },
      orderBy: { createdAt: "desc" },
      take: NOTES_LIMIT,
    });
    if (!notes.length) return "📝 Пока ничего не записано. Скажи «запомни: …» — запишу.";
    const lines = notes.map((n) => `• ${esc(n.text)} <i>(${dayMonth(n.createdAt, tz)})</i>`);
    return `📝 <b>Записи</b>\n${lines.join("\n")}`;
  }

  if (a.ask === "debts") {
    const debts = await prisma.botNote.findMany({
      where: { ...base, kind: { in: ["debt_to_me", "debt_mine"] }, closedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const toMe = debts.filter((d) => d.kind === "debt_to_me");
    const mine = debts.filter((d) => d.kind === "debt_mine");
    if (!debts.length) return "🤝 Открытых долгов нет.";
    const fmt = (d: BotNote) =>
      `• ${esc(d.counterparty ?? d.text)} — ${d.amount ? formatMoney(d.amount) : "сумма не указана"}${d.dueAt ? ` (до ${shortDate(d.dueAt, tz)})` : ""}`;
    const sum = (list: BotNote[]) => list.reduce((s, d) => s + (d.amount ?? 0), 0);
    const parts: string[] = [];
    if (toMe.length) parts.push(`🤝 <b>Должны тебе</b> — ${formatMoney(sum(toMe))}\n${toMe.map(fmt).join("\n")}`);
    if (mine.length) parts.push(`💳 <b>Ты должен</b> — ${formatMoney(sum(mine))}\n${mine.map(fmt).join("\n")}`);
    return parts.join("\n\n");
  }

  if (a.ask === "money_period") {
    const period: AskPeriod = a.period ?? "month";
    const since = periodStart(period, tz);
    const rows = await prisma.botNote.findMany({
      where: { ...base, kind: { in: ["income", "expense"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + (r.amount ?? 0), 0);
    const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + (r.amount ?? 0), 0);
    if (!rows.length) return `💰 ${capitalize(PERIOD_LABEL[period])} записей о деньгах нет.`;
    const lines = rows.slice(0, MONEY_LINES).map((r) => {
      const sign = r.kind === "income" ? "+" : "−";
      const who = r.counterparty && r.counterparty.toLowerCase() !== r.text.toLowerCase() ? `${esc(r.counterparty)}, ` : "";
      return `• ${sign}${formatMoney(r.amount ?? 0)} — ${who}${esc(r.text)} <i>(${dayMonth(r.createdAt, tz)})</i>`;
    });
    const more = rows.length > MONEY_LINES ? `\n… и ещё ${rows.length - MONEY_LINES}` : "";
    return (
      `💰 <b>${capitalize(PERIOD_LABEL[period])}</b>\n` +
      `Получил: ${formatMoney(income)}\nПотратил: ${formatMoney(expense)}\n<b>Итого: ${income - expense >= 0 ? "+" : "−"}${formatMoney(Math.abs(income - expense))}</b>\n\n` +
      lines.join("\n") +
      more
    );
  }

  // money_search — по теме/имени, за период если назван
  const q = (a.query ?? "").trim();
  const stem = q.length > 4 ? q.slice(0, q.length - 1) : q; // материалы / материал
  const since = a.period ? periodStart(a.period, tz) : null;
  const rows = await prisma.botNote.findMany({
    where: {
      ...base,
      kind: { in: ["income", "expense", "debt_to_me", "debt_mine"] },
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(stem
        ? { OR: [{ text: { contains: stem, mode: "insensitive" } }, { counterparty: { contains: stem, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (!rows.length) return `🔍 По «${esc(q || "деньги")}»${a.period ? ` ${PERIOD_LABEL[a.period]}` : ""} записей нет.`;
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const lines = rows.slice(0, MONEY_LINES).map((r) => {
    const sign = r.kind === "income" || r.kind === "debt_to_me" ? "+" : "−";
    return `• ${sign}${formatMoney(r.amount ?? 0)} — ${esc([r.counterparty, r.text].filter(Boolean).join(", "))} <i>(${dayMonth(r.createdAt, tz)})</i>`;
  });
  return `🔍 <b>${esc(capitalize(q || "деньги"))}</b>${a.period ? ` ${PERIOD_LABEL[a.period]}` : ""} — ${formatMoney(total)}\n${lines.join("\n")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Кнопка «Удалить» ──────────────────────────────────────────────────────

/** note:del:<id> — мягкое удаление записи; возвращает true, если callback наш. */
export async function handleMemoryCallback(chatId: string, data: string, messageId: number | null): Promise<boolean> {
  if (!data.startsWith("note:")) return false;
  const [, action, id] = data.split(":");
  if (action !== "del" || !id) return true;
  const note = await prisma.botNote.findUnique({ where: { id } });
  if (!note || note.telegramChatId !== chatId || note.deletedAt) {
    if (messageId) await editTelegramMessage(chatId, messageId, "🗑 Уже удалено.");
    return true;
  }
  await prisma.botNote.update({ where: { id }, data: { deletedAt: new Date() } });
  if (messageId) await editTelegramMessage(chatId, messageId, "🗑 Удалено.");
  else await sendTelegramMessage(chatId, "🗑 Удалено.");
  return true;
}

// ── Активность и вечерний вопрос ──────────────────────────────────────────

/** Любое сообщение мастера: обновить активность, сбросить счётчик пропущенных вечеров. */
export async function touchBotActivity(chatId: string): Promise<void> {
  try {
    await prisma.botSettings.upsert({
      where: { telegramChatId: chatId },
      create: { telegramChatId: chatId, lastUserMsgAt: new Date() },
      update: { lastUserMsgAt: new Date(), eveningMissed: 0 },
    });
  } catch (e) {
    reportError(e, "bot-memory", "touchBotActivity failed");
  }
}

export async function setEveningOff(chatId: string, off: boolean): Promise<void> {
  await prisma.botSettings.upsert({
    where: { telegramChatId: chatId },
    create: { telegramChatId: chatId, eveningOff: off, lastUserMsgAt: new Date() },
    update: { eveningOff: off },
  });
  await sendTelegramMessage(
    chatId,
    off
      ? "🌙 Вечерний вопрос выключен. Включить — /evening_on"
      : "🌙 Вечерний вопрос включён: в 20:30 спрошу, как прошёл день. Выключить — /evening_off",
  );
}

export const EVENING_QUESTION =
  "Как прошёл день? 💰 Сколько сегодня получил, сколько потратил? Наговори или напиши — запишу.";

/** Отправить вечерний вопрос и отметить. */
export async function sendEveningQuestion(chatId: string): Promise<void> {
  await sendTelegramMessage(chatId, EVENING_QUESTION);
  await prisma.botSettings.upsert({
    where: { telegramChatId: chatId },
    create: { telegramChatId: chatId, lastEveningAt: new Date(), eveningMissed: 1 },
    update: { lastEveningAt: new Date(), eveningMissed: { increment: 1 } },
  });
}

export const BOT_MEMORY_HELP_LINES =
  `📝 <b>Память</b>: «запомни: у Серика ключ от склада», «что я записывал?»\n` +
  `💰 <b>Деньги</b>: «заработал 120 тысяч от Асель», «потратил 30 на материалы», «Марат занял 50, отдаст в пятницу», «Марат отдал», ` +
  `«кто мне должен?», «сколько заработал за месяц?»\n` +
  `🌙 Вечером в 20:30 спрошу, как прошёл день (/evening_off — выключить)`;
