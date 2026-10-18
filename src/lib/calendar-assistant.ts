// Голосовой ассистент-календарь в Telegram-боте (17.10.2026).
//
// Мастер наговаривает «замер завтра в 15:00, Сейфуллина 12, Айгерим» →
// расшифровка (Gemini принимает ogg/opus из Telegram напрямую) → ИИ вынимает
// что/когда/где/кто/телефон → карточка [Сохранить][Изменить][Отмена] →
// событие в Google Календаре с напоминанием за час и за день.
//
// Черновики — в таблице CalendarDraft (на Vercel in-memory не живёт).
// Сценарий «Изменить» и уточняющий вопрос: awaitingEdit=true → следующий
// текст/голос применяется к черновику, а не создаёт новый.

import { prisma } from "@/lib/prisma";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { aiLogOnce } from "@/lib/ai-log";
import { reportAiError, reportError } from "@/lib/report-error";
import { normalizePhone, formatPhone } from "@/lib/phone";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  editTelegramMessage,
  downloadTelegramFile,
  sendTypingAction,
} from "@/lib/telegram";
import {
  connectUrlForChat,
  createCalendarEvent,
  deleteCalendarLink,
  getCalendarLink,
  isGoogleConfigured,
  siteBaseUrl,
  CalendarUnlinkedError,
  DEFAULT_TIMEZONE,
} from "@/lib/google-calendar";
import type { Prisma } from "@/generated/prisma/client";

/** Модель для расшифровки голоса: принимает audio (ogg/opus) напрямую, рус/каз. */
export const VOICE_MODEL = "google/gemini-2.5-flash";

export type EventKind = "measure" | "install" | "meeting" | "call" | "birthday" | "other";

export type CalendarEventDraft = {
  kind: EventKind;
  /** Заголовок без имени клиента: «Замер», «Монтаж», «Встреча», «Звонок», «День рождения», либо своё. */
  title: string;
  clientName: string | null;
  address: string | null;
  phone: string | null;
  /** Локальное время «YYYY-MM-DDTHH:mm» в timeZone. null — не понято. */
  start: string | null;
  durationMin: number;
  /** Весь день (день рождения, «в субботу выходной») — время не нужно, в Google уходит date. */
  allDay?: boolean;
  notes: string | null;
};

const KIND_LABEL: Record<EventKind, string> = {
  measure: "Замер",
  install: "Монтаж",
  meeting: "Встреча",
  call: "Звонок",
  birthday: "День рождения",
  other: "Событие",
};

const KIND_EMOJI: Record<EventKind, string> = {
  measure: "📐",
  install: "🛠",
  meeting: "🤝",
  call: "📞",
  birthday: "🎂",
  other: "📅",
};

const DEFAULT_DURATION: Record<EventKind, number> = {
  measure: 60,
  install: 240,
  meeting: 60,
  call: 15,
  birthday: 60,
  other: 60,
};

export const CALENDAR_HELP_LINES =
  `📅 <b>Календарь</b> — напишите или наговорите голосом «замер завтра в 15:00, Сейфуллина 12, Айгерим» — ` +
  `событие попадёт в ваш Google Календарь с напоминанием.\n` +
  `/calendar — подключить или проверить календарь\n` +
  `/calendar_off — отключить`;

// ── Кнопка «Подключить» ───────────────────────────────────────────────────

export function connectButton(chatId: string) {
  return [[{ text: "📅 Подключить Google Календарь", url: connectUrlForChat(chatId) }]];
}

/** Предложение подключить календарь (для /start, /calendar, и на голос/текст без календаря). */
export async function sendCalendarConnectPrompt(chatId: string, intro?: string): Promise<void> {
  if (!isGoogleConfigured()) {
    await sendTelegramMessage(chatId, "📅 Подключение календаря временно недоступно. Попробуйте позже.");
    return;
  }
  const text =
    (intro ? intro + "\n\n" : "") +
    `📅 <b>Личный ассистент-календарь</b>\n\n` +
    `Подключите Google Календарь одной кнопкой — и дальше просто говорите боту голосом:\n` +
    `🎙 «замер завтра в 15:00, Сейфуллина 12, Айгерим»\n` +
    `🎙 «монтаж в пятницу с 10 утра, Абая 5, Серик»\n\n` +
    `Я создам событие в вашем календаре и напомню за час и за день.`;
  await sendTelegramMessageWithButtons(chatId, text, connectButton(chatId));
}

/** /calendar — статус или кнопка подключения. */
export async function sendCalendarStatus(chatId: string): Promise<void> {
  const link = await getCalendarLink(chatId);
  if (!link) {
    await sendCalendarConnectPrompt(chatId);
    return;
  }
  await sendTelegramMessage(
    chatId,
    `📅 <b>Календарь подключён ✅</b>${link.email ? `\n${escapeHtml(link.email)}` : ""}\n` +
      `Событий создано: ${link.eventsCreated}\n\n` +
      `Напишите или наговорите голосом, что и когда — я добавлю в календарь.\n\n` +
      `/calendar_off — отключить календарь`,
  );
}

/** /calendar_off — удалить связь и токены. */
export async function calendarOff(chatId: string): Promise<void> {
  const removed = await deleteCalendarLink(chatId);
  await sendTelegramMessage(
    chatId,
    removed
      ? "📅 Календарь отключён, доступ к Google отозван, токены удалены.\n\nПодключить снова — /calendar"
      : "Календарь и так не подключён. Подключить — /calendar",
  );
}

// ── Входящее сообщение (текст или голос) ──────────────────────────────────

export type IncomingCalendarMessage = {
  text?: string | null;
  /** file_id голосового сообщения Telegram (ogg/opus). */
  voiceFileId?: string | null;
  voiceDurationSec?: number | null;
};

/**
 * Обработать текст/голос в чате с подключённым календарём. Вызывается из
 * webhook как fallback после команд и привязки — ничего в старых сценариях не меняет.
 */
export async function handleCalendarMessage(chatId: string, msg: IncomingCalendarMessage): Promise<void> {
  const link = await getCalendarLink(chatId);
  if (!link) {
    await sendCalendarConnectPrompt(chatId);
    return;
  }
  const timeZone = link.timeZone || DEFAULT_TIMEZONE;

  await sendTypingAction(chatId);

  // 1. Текст: как есть или расшифровка голоса
  let text = (msg.text ?? "").trim();
  if (!text && msg.voiceFileId) {
    if ((msg.voiceDurationSec ?? 0) > 120) {
      await sendTelegramMessage(chatId, "🎙 Голосовое длиннее 2 минут. Скажите короче: что, когда, где и кто.");
      return;
    }
    const transcript = await transcribeVoice(msg.voiceFileId);
    if (!transcript) {
      await sendTelegramMessage(chatId, "🎙 Не разобрал голосовое. Попробуйте ещё раз или напишите текстом.");
      return;
    }
    text = transcript;
  }
  if (!text) return;

  // 2. Есть черновик, ждущий правки / уточнения? Тогда правим его.
  const pending = await prisma.calendarDraft.findFirst({
    where: { telegramChatId: chatId, awaitingEdit: true },
    orderBy: { createdAt: "desc" },
  });

  await sendTypingAction(chatId);

  let draft: CalendarEventDraft | null;
  let question: string | null;
  try {
    const result = await extractEvent({
      text,
      timeZone,
      current: pending ? (pending.payload as CalendarEventDraft) : null,
    });
    draft = result.draft;
    question = result.question;
  } catch (e) {
    reportAiError(e, "calendar-bot", "extract failed");
    await sendTelegramMessage(chatId, "⚠️ ИИ сейчас недоступен. Попробуйте через минуту.");
    return;
  }

  if (!draft) {
    // Совсем не похоже на событие (например «привет»)
    await sendTelegramMessage(
      chatId,
      (msg.voiceFileId ? `🎙 Услышал: «${escapeHtml(text)}»\n\n` : "") +
        `Не понял, какое событие создать. Скажите, что, когда и где — например: «замер завтра в 15:00, Сейфуллина 12, Айгерим».`,
    );
    return;
  }

  // 3. Сохраняем черновик (старые — убираем)
  if (pending) {
    await prisma.calendarDraft.deleteMany({ where: { telegramChatId: chatId, id: { not: pending.id } } });
  } else {
    await prisma.calendarDraft.deleteMany({ where: { telegramChatId: chatId } });
  }
  const needsClarification = !draft.start || Boolean(question);
  const saved = pending
    ? await prisma.calendarDraft.update({
        where: { id: pending.id },
        data: {
          payload: draft as unknown as Prisma.InputJsonValue,
          sourceText: [pending.sourceText, text].filter(Boolean).join("\n"),
          awaitingEdit: needsClarification,
        },
      })
    : await prisma.calendarDraft.create({
        data: {
          telegramChatId: chatId,
          payload: draft as unknown as Prisma.InputJsonValue,
          sourceText: text,
          awaitingEdit: needsClarification,
        },
      });

  // 4. Не поняли дату/время — один уточняющий вопрос
  if (needsClarification) {
    const q = question || "Когда? Назовите день и время — например «завтра в 15:00» или «в пятницу в 10 утра».";
    await sendTelegramMessage(
      chatId,
      (msg.voiceFileId ? `🎙 Услышал: «${escapeHtml(text)}»\n\n` : "") +
        `${formatDraftCard(draft, timeZone)}\n\n❓ ${escapeHtml(q)}`,
    );
    return;
  }

  // 5. Карточка с кнопками
  await sendTelegramMessageWithButtons(
    chatId,
    (msg.voiceFileId ? `🎙 Услышал: «${escapeHtml(text)}»\n\n` : "") + formatDraftCard(draft, timeZone),
    draftButtons(saved.id),
  );
}

function draftButtons(draftId: string) {
  return [
    [
      { text: "✅ Сохранить", callback_data: `cal:save:${draftId}` },
      { text: "✏️ Изменить", callback_data: `cal:edit:${draftId}` },
    ],
    [{ text: "❌ Отмена", callback_data: `cal:cancel:${draftId}` }],
  ];
}

// ── Кнопки карточки ───────────────────────────────────────────────────────

/** Возвращает true, если callback наш (cal:*). */
export async function handleCalendarCallback(
  chatId: string,
  data: string,
  messageId: number | null,
): Promise<boolean> {
  if (!data.startsWith("cal:")) return false;
  const [, action, draftId] = data.split(":");
  if (!draftId) return true;

  const draft = await prisma.calendarDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.telegramChatId !== chatId) {
    if (messageId) await editTelegramMessage(chatId, messageId, "Черновик устарел. Наговорите событие ещё раз.");
    else await sendTelegramMessage(chatId, "Черновик устарел. Наговорите событие ещё раз.");
    return true;
  }
  const payload = draft.payload as CalendarEventDraft;

  if (action === "cancel") {
    await prisma.calendarDraft.delete({ where: { id: draft.id } }).catch(() => {});
    if (messageId) await editTelegramMessage(chatId, messageId, "❌ Отменено.");
    else await sendTelegramMessage(chatId, "❌ Отменено.");
    return true;
  }

  if (action === "edit") {
    await prisma.calendarDraft.update({ where: { id: draft.id }, data: { awaitingEdit: true } });
    await sendTelegramMessage(
      chatId,
      "✏️ Напишите или скажите, что поправить — например «в 16:30», «адрес Абая 5», «это монтаж», «телефон 8 777 …».",
    );
    return true;
  }

  if (action === "save") {
    const link = await getCalendarLink(chatId);
    if (!link) {
      await sendCalendarConnectPrompt(chatId, "Календарь не подключён — событие не сохранено.");
      return true;
    }
    if (!payload.start) {
      await prisma.calendarDraft.update({ where: { id: draft.id }, data: { awaitingEdit: true } });
      await sendTelegramMessage(chatId, "❓ Когда? Назовите день и время.");
      return true;
    }
    const timeZone = link.timeZone || DEFAULT_TIMEZONE;
    try {
      const created = await createCalendarEvent(chatId, buildEventInput(payload, timeZone));
      await prisma.calendarDraft.delete({ where: { id: draft.id } }).catch(() => {});
      const text = `${formatDraftCard(payload, timeZone)}\n\n✅ <b>Добавлено в календарь</b>`;
      const buttons = created.htmlLink ? [[{ text: "📅 Открыть в Google Календаре", url: created.htmlLink }]] : [];
      if (messageId) await editTelegramMessage(chatId, messageId, text, buttons);
      else await sendTelegramMessageWithButtons(chatId, text, buttons);
    } catch (e) {
      if (e instanceof CalendarUnlinkedError) {
        await sendCalendarConnectPrompt(
          chatId,
          "⚠️ Google отозвал доступ к календарю — подключите его заново, затем нажмите «Сохранить» ещё раз.",
        );
        return true;
      }
      reportError(e, "calendar-bot", "events.insert failed");
      await sendTelegramMessage(chatId, "⚠️ Не удалось сохранить в Google Календарь. Попробуйте ещё раз через минуту.");
    }
    return true;
  }

  return true;
}

// ── Расшифровка голоса ────────────────────────────────────────────────────

export async function transcribeVoice(fileId: string): Promise<string | null> {
  const buf = await downloadTelegramFile(fileId);
  if (!buf || buf.length === 0) return null;
  const t0 = Date.now();
  try {
    const client = getOpenRouter();
    const res = await client.chat.completions.create({
      model: VOICE_MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Расшифруй голосовое сообщение дословно. Язык — русский, казахский или их смесь; пиши на том языке, на котором говорят. " +
                "Числа пиши цифрами (время «в три» → «в 3», телефон — цифрами подряд). Только текст расшифровки, без комментариев и кавычек. " +
                "Если речи нет или не разобрать — ответь пустой строкой.",
            },
            // openai SDK типизирует format только как wav|mp3; OpenRouter/Gemini принимают ogg (проверено 17.10.2026)
            {
              type: "input_audio",
              input_audio: { data: buf.toString("base64"), format: "ogg" as unknown as "wav" },
            },
          ],
        },
      ],
    });
    const text = (res.choices[0]?.message?.content ?? "").trim();
    const cost = (res.usage as { cost?: number } | undefined)?.cost ?? null;
    await aiLogOnce({
      feature: "voice-transcribe",
      input: `[voice ${buf.length} bytes, ${Date.now() - t0} ms]`,
      output: text,
      ok: true,
      model: VOICE_MODEL,
      costUsd: cost,
      platform: "telegram",
    });
    return text || null;
  } catch (e) {
    reportAiError(e, "voice-transcribe", "gemini failed");
    await aiLogOnce({
      feature: "voice-transcribe",
      input: `[voice ${buf.length} bytes]`,
      ok: false,
      error: e,
      model: VOICE_MODEL,
      platform: "telegram",
    });
    return null;
  }
}

// ── Извлечение события из текста ──────────────────────────────────────────

type ExtractResult = { draft: CalendarEventDraft | null; question: string | null };

export async function extractEvent(args: {
  text: string;
  timeZone: string;
  current: CalendarEventDraft | null;
}): Promise<ExtractResult> {
  const now = new Date();
  const nowLocal = formatLocalIso(now, args.timeZone);
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: args.timeZone, weekday: "long" }).format(now);

  const system =
    `Ты ассистент-календарь мастера по натяжным потолкам в Казахстане. Из сообщения (русский, казахский или смесь) ` +
    `извлеки одно событие для календаря и верни СТРОГО JSON без пояснений.\n\n` +
    `Сейчас: ${nowLocal} (${weekday}), часовой пояс ${args.timeZone}. Все даты и времена — локальные в этом поясе.\n\n` +
    `Схема:\n` +
    `{"event": {\n` +
    `  "kind": "measure|install|meeting|call|birthday|other",   // замер → measure, монтаж/установка → install, встреча → meeting, позвонить/звонок → call, день рождения → birthday\n` +
    `  "title": string,            // короткое название без имени клиента: "Замер", "Монтаж", "Встреча", "Звонок", "День рождения" или своё ("Забрать полотно")\n` +
    `  "clientName": string|null,  // имя клиента/человека, как сказано (Айгерим, Серик, Марат Петрович)\n` +
    `  "address": string|null,     // адрес/место: "Сейфуллина 12", "Абая 5, кв 14". Исправь очевидные ошибки расшифровки улиц Казахстана (Сифулина → Сейфуллина)\n` +
    `  "phone": string|null,       // телефон цифрами, если назван\n` +
    `  "start": "YYYY-MM-DDTHH:mm"|null, // начало. "завтра", "послезавтра", "в пятницу" (ближайшая будущая), "через час", "в 3" днём → 15:00, если контекст рабочий день; "утром" → 10:00, "вечером" → 18:00, "в обед" → 13:00. Если дата ясна, а время нет — null\n` +
    `  "durationMin": number,      // замер 60, монтаж 240, встреча 60, звонок 15, иначе 60; если сказано «с 10 до 12» — посчитай\n` +
    `  "allDay": boolean,          // true для дня рождения или события на весь день без времени (start тогда "YYYY-MM-DDT00:00", вопрос про время НЕ задавать)\n` +
    `  "notes": string|null        // прочие детали: этаж, «два уровня», «клиент просил позвонить до», и т.п.\n` +
    `} | null,                     // null, если сообщение вообще не про событие\n` +
    ` "question": string|null}     // ОДИН короткий вопрос по-русски, если дата или время не понятны; иначе null\n\n` +
    (args.current
      ? `Есть ТЕКУЩИЙ черновик, пользователь присылает ПРАВКУ или ответ на уточнение. Верни полный обновлённый event: ` +
        `сохрани все поля черновика, измени только то, о чём говорит сообщение.\nТекущий черновик: ${JSON.stringify(args.current)}\n`
      : `Если в тексте только время без даты — считай сегодня, если это время ещё впереди, иначе завтра.\n`) +
    `Прошедшие даты не ставь: если получилось в прошлом — сдвинь на ближайшее будущее.`;

  const client = getOpenRouter();
  const res = await client.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    max_tokens: 600,
    messages: [
      { role: "system", content: system },
      { role: "user", content: args.text },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  const cost = (res.usage as { cost?: number } | undefined)?.cost ?? null;
  const parsed = parseJson(raw);
  await aiLogOnce({
    feature: "calendar-bot",
    input: (args.current ? "[edit] " : "") + args.text,
    output: raw,
    ok: Boolean(parsed),
    model: AI_MODEL,
    costUsd: cost,
    platform: "telegram",
  });
  if (!parsed) throw new Error("calendar-bot: model returned non-JSON");

  const ev = parsed.event as Partial<CalendarEventDraft> | null | undefined;
  if (!ev) return { draft: null, question: null };

  const kind = (["measure", "install", "meeting", "call", "birthday", "other"] as EventKind[]).includes(ev.kind as EventKind)
    ? (ev.kind as EventKind)
    : "other";
  const start = typeof ev.start === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ev.start) ? ev.start.slice(0, 16) : null;
  const phoneRaw = typeof ev.phone === "string" ? ev.phone.trim() : null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) || phoneRaw : null;

  const draft: CalendarEventDraft = {
    kind,
    title: (typeof ev.title === "string" && ev.title.trim()) || KIND_LABEL[kind],
    clientName: strOrNull(ev.clientName),
    address: strOrNull(ev.address),
    phone,
    start,
    durationMin:
      typeof ev.durationMin === "number" && ev.durationMin >= 5 && ev.durationMin <= 24 * 60
        ? Math.round(ev.durationMin)
        : DEFAULT_DURATION[kind],
    allDay: ev.allDay === true,
    notes: strOrNull(ev.notes),
  };
  const question = typeof parsed.question === "string" && parsed.question.trim() ? parsed.question.trim() : null;
  return { draft, question };
}

function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── Карточка и событие ────────────────────────────────────────────────────

export function formatDraftCard(d: CalendarEventDraft, timeZone: string): string {
  const head = `${KIND_EMOJI[d.kind]} <b>${escapeHtml(d.title)}${d.clientName ? ` — ${escapeHtml(d.clientName)}` : ""}</b>`;
  const lines = [head];
  if (d.start && d.allDay) {
    const startDate = zonedLocalToDate(d.start, timeZone);
    const day = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(startDate);
    lines.push(`🗓 ${day.charAt(0).toUpperCase() + day.slice(1).replace(/\.$/, "")}, весь день`);
  } else if (d.start) {
    const startDate = zonedLocalToDate(d.start, timeZone);
    const endDate = new Date(startDate.getTime() + d.durationMin * 60 * 1000);
    lines.push(`🗓 ${formatRange(startDate, endDate, timeZone)}`);
  } else {
    lines.push("🗓 <i>дата и время не указаны</i>");
  }
  if (d.address) lines.push(`📍 ${escapeHtml(d.address)}`);
  if (d.phone) lines.push(`📞 ${escapeHtml(prettyPhone(d.phone))}`);
  if (d.notes) lines.push(`📝 ${escapeHtml(d.notes)}`);
  return lines.join("\n");
}

function buildEventInput(d: CalendarEventDraft, timeZone: string) {
  const startDate = zonedLocalToDate(d.start as string, timeZone);
  const endDate = new Date(startDate.getTime() + d.durationMin * 60 * 1000);
  const descLines: string[] = [];
  if (d.clientName) descLines.push(`Клиент: ${d.clientName}`);
  if (d.phone) descLines.push(`Тел: ${prettyPhone(d.phone)}`);
  if (d.address) descLines.push(`Карта: https://maps.google.com/?q=${encodeURIComponent(d.address)}`);
  if (d.notes) descLines.push(`Заметки: ${d.notes}`);
  descLines.push("", `Создано через potolok.ai (${siteBaseUrl()}) — Telegram-бот @potolokaiBot`);
  const summary = `${d.title}${d.clientName ? ` — ${d.clientName}` : ""}`;
  if (d.allDay) {
    const nextDay = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      summary,
      allDay: true,
      startLocal: formatLocalIso(startDate, timeZone).slice(0, 10),
      endLocal: formatLocalIso(nextDay, timeZone).slice(0, 10),
      location: d.address,
      description: descLines.join("\n"),
      // для событий на весь день минуты считаются от полуночи: 15 ч = накануне в 09:00
      reminderMinutes: [15 * 60],
    };
  }
  return {
    summary,
    startLocal: formatLocalIso(startDate, timeZone),
    endLocal: formatLocalIso(endDate, timeZone),
    location: d.address,
    description: descLines.join("\n"),
    reminderMinutes: [60, 24 * 60],
  };
}

function prettyPhone(p: string): string {
  try {
    return p.startsWith("+") ? formatPhone(p) : p;
  } catch {
    return p;
  }
}

// ── Время ─────────────────────────────────────────────────────────────────

/** Локальное «YYYY-MM-DDTHH:mm[:ss]» в поясе tz → Date (UTC). Без DST-сюрпризов для Алматы (UTC+5). */
export function zonedLocalToDate(local: string, tz: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  // смещение пояса в этот момент
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
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - date.getTime();
}

/** Date → локальное «YYYY-MM-DDTHH:mm:ss» в поясе tz (для Google start.dateTime + timeZone). */
export function formatLocalIso(date: Date, tz: string): string {
  const shifted = new Date(date.getTime() + tzOffsetMs(date, tz));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
  );
}

function formatRange(start: Date, end: Date, tz: string): string {
  const day = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(start);
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const sameDay =
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz, dateStyle: "short" }).format(start) ===
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz, dateStyle: "short" }).format(end);
  const endStr = sameDay
    ? time.format(end)
    : `${new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "short" }).format(end)} ${time.format(end)}`;
  const capDay = day.charAt(0).toUpperCase() + day.slice(1).replace(/\.$/, "");
  return `${capDay}, ${time.format(start)}–${endStr}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
