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
import { answerAsAssistant, type AssistantMaster } from "@/lib/telegram-assistant";
import { handleNote, handleMoney, handleAsk } from "@/lib/bot-memory";

/** Модель для расшифровки голоса: принимает audio (ogg/opus) напрямую, рус/каз. */
export const VOICE_MODEL = "google/gemini-2.5-flash";
/** Пояс для разбора голосовых без подключённого календаря (нет link.timeZone). */
export const DEFAULT_TIMEZONE_FOR_BOT = DEFAULT_TIMEZONE;

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
  /**
   * Дата есть, времени мастер не назвал («замер завтра у Айгерим»). Не
   * переспрашиваем (правило Наримана 19.10.2026: бот не докапывается) —
   * в карточке «время не указано», в Google уходит событие на весь день.
   */
  timeUnknown?: boolean;
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
 * Любой текст/голос мастера (не команда). Вызывается из webhook после /start,
 * кодов, телефона и команд. Один классификатор на входе (extractEvent):
 *  - note / money / ask → память и бухгалтер (src/lib/bot-memory.ts), работает без календаря и аккаунта;
 *  - event → карточка события (календарь подключён) или предложение подключить;
 *  - question / chat → ответ ассистента.
 */
export async function handleIncomingMessage(
  chatId: string,
  msg: IncomingCalendarMessage,
  ctx: { master?: (AssistantMaster & { id?: string }) | null } = {},
): Promise<void> {
  const link = isGoogleConfigured() ? await getCalendarLink(chatId) : null;
  const timeZone = link?.timeZone || DEFAULT_TIMEZONE;

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

  // 2. Есть черновик, ждущий правки / уточнения? Тогда правим его (только с календарём).
  const pending = link
    ? await prisma.calendarDraft.findFirst({
        where: { telegramChatId: chatId, awaitingEdit: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  await sendTypingAction(chatId);

  const heard = msg.voiceFileId ? `🎙 Услышал: «${escapeHtml(text)}»` : "";
  const prefix = heard ? heard + "\n\n" : "";

  let result: ExtractResult;
  try {
    result = await extractEvent({
      text,
      timeZone,
      current: pending ? (pending.payload as CalendarEventDraft) : null,
    });
  } catch (e) {
    reportAiError(e, "calendar-bot", "extract failed");
    await sendTelegramMessage(chatId, "⚠️ ИИ сейчас недоступен. Попробуйте через минуту.");
    return;
  }

  // Память и бухгалтер (22.10.2026) — без календаря и без аккаунта.
  const memCtx = { masterId: ctx.master?.id ?? null, timeZone };
  if (result.intent === "note" && result.note) {
    await handleNote(chatId, result.note, memCtx, prefix);
    return;
  }
  if (result.intent === "money" && result.money) {
    await handleMoney(chatId, result.money, memCtx, prefix);
    return;
  }
  if (result.intent === "ask" && result.ask) {
    await handleAsk(chatId, result.ask, memCtx, prefix);
    return;
  }

  const draft = result.intent === "event" ? result.draft : null;
  if (!draft) {
    // Не событие («что ты умеешь», «привет», «как отправить КП») — отвечает
    // ассистент, а не «назовите событие». Черновик, если ждал правки, не трогаем.
    await answerAsAssistant(chatId, text, {
      master: ctx.master,
      calendarConnected: Boolean(link),
      prefix: heard,
      buttons: link || !isGoogleConfigured() ? undefined : connectButton(chatId),
    });
    return;
  }

  if (!link) {
    // Событие, а календаря нет — предлагаем подключить (один раз, тут же).
    await sendCalendarConnectPrompt(
      chatId,
      `${prefix}Похоже на событие. Подключите Google Календарь — и я добавлю его туда с напоминанием.`,
    );
    return;
  }

  // 3. Сохраняем черновик (старые — убираем)
  if (pending) {
    await prisma.calendarDraft.deleteMany({ where: { telegramChatId: chatId, id: { not: pending.id } } });
  } else {
    await prisma.calendarDraft.deleteMany({ where: { telegramChatId: chatId } });
  }
  // Единственный вопрос — когда даты нет совсем, и только ОДИН раз: если уже
  // спрашивали (pending) и ответа про дату не было — показываем карточку с
  // кнопками, человек сам нажмёт «Изменить». Адрес, имя, телефон, время не
  // переспрашиваем никогда (правило Наримана 19.10.2026).
  const needsClarification = !draft.start && !pending;
  const saved = pending
    ? await prisma.calendarDraft.update({
        where: { id: pending.id },
        data: {
          payload: draft as unknown as Prisma.InputJsonValue,
          sourceText: [pending.sourceText, text].filter(Boolean).join("\n"),
          // Без даты черновик остаётся «ждущим»: следующий текст его дополнит.
          awaitingEdit: !draft.start,
        },
      })
    : await prisma.calendarDraft.create({
        data: {
          telegramChatId: chatId,
          payload: draft as unknown as Prisma.InputJsonValue,
          sourceText: text,
          awaitingEdit: !draft.start,
        },
      });

  // 4. Даты нет совсем — один вопрос
  if (needsClarification) {
    await sendTelegramMessage(
      chatId,
      (heard ? heard + "\n\n" : "") + `${formatDraftCard(draft, timeZone)}\n\n❓ Когда? (например, завтра в 15:00)`,
    );
    return;
  }

  // 5. Карточка с кнопками — всегда, даже неполная
  await sendTelegramMessageWithButtons(
    chatId,
    (heard ? heard + "\n\n" : "") + formatDraftCard(draft, timeZone),
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
      await sendTelegramMessage(chatId, "❓ Когда? (например, завтра в 15:00)");
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

export type MessageIntent = "event" | "question" | "chat" | "note" | "money" | "ask";

export type MoneyKind = "income" | "expense" | "debt_to_me" | "debt_mine" | "debt_closed";
export type AskKind = "notes" | "debts" | "money_period" | "money_search";
export type AskPeriod = "today" | "week" | "month";

/** Деньги/долг (22.10.2026): «заработал 120 тысяч от Асель», «Марат занял 50, отдаст в пятницу». */
export type MoneyDraft = {
  kind: MoneyKind;
  /** В тенге. «85» про деньги = 85 000 (мастера говорят в тысячах) — правит код. */
  amount: number | null;
  counterparty: string | null;
  /** «YYYY-MM-DD» — срок долга. */
  dueAt: string | null;
  /** Коротко, о чём запись: «материалы», «остаток за зал», «монтажникам». */
  text: string;
};

export type AskDraft = { ask: AskKind; period: AskPeriod | null; query: string | null };

export type ExtractResult = {
  intent: MessageIntent;
  draft: CalendarEventDraft | null;
  /** intent=note: что запомнить. */
  note?: string | null;
  money?: MoneyDraft | null;
  ask?: AskDraft | null;
};

export async function extractEvent(args: {
  text: string;
  timeZone: string;
  current: CalendarEventDraft | null;
}): Promise<ExtractResult> {
  const now = new Date();
  const nowLocal = formatLocalIso(now, args.timeZone);
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: args.timeZone, weekday: "long" }).format(now);

  // Правило Наримана (19.10.2026): бот НЕ докапывается — записывает, что
  // сказали; адрес, телефон, имя, длительность не спрашивает. Единственный
  // вопрос (задаёт код, не модель) — когда даты нет совсем.
  const system =
    `Ты ассистент-календарь мастера по натяжным потолкам в Казахстане. Определи, что это за сообщение (русский, казахский или смесь), ` +
    `и верни СТРОГО JSON без пояснений.\n\n` +
    `Сейчас: ${nowLocal} (${weekday}), часовой пояс ${args.timeZone}. Все даты и времена — локальные в этом поясе.\n\n` +
    `Схема:\n` +
    `{"intent": "event|note|money|ask|question|chat",\n` +
    `   // event — заявка на событие С ДАТОЙ или временем (замер, монтаж, встреча, звонок, день рождения, «надо съездить к… завтра»);\n` +
    `   // note — «запомни …», «не забыть …», факт без даты и без денег («у Серика ключ от склада», «не забыть позвонить Болату», «Айгерим хочет сатин»);\n` +
    `   // money — деньги мастера: заработал/получил/пришло/остаток/предоплата (income), потратил/заплатил/отдал/купил (expense), «X занял у меня / должен мне / отдаст» (debt_to_me), «я должен X / занял у X» (debt_mine), «X отдал / вернул / рассчитался» (debt_closed). Долг с датой возврата — тоже money, не event;\n` +
    `   // ask — вопрос про СВОИ записи и деньги: «что я записывал?», «кто мне должен?», «кому я должен?», «сколько заработал за неделю?», «сколько потратил на материалы?»;\n` +
    `   // question — вопрос про бота, приложение, potolok.ai («что ты умеешь», «как сделать КП», «сколько стоит подписка»); chat — приветствие, благодарность, прочее\n` +
    ` "note": string|null,          // при intent=note: что запомнить, своими словами мастера, без «запомни»\n` +
    ` "money": {                    // только при intent=money, иначе null\n` +
    `  "kind": "income|expense|debt_to_me|debt_mine|debt_closed",\n` +
    `  "amount": number|null,      // в тенге. «120 тысяч», «120к», «120 000» → 120000; «1,5 млн» → 1500000; «85» в разговоре о деньгах → 85000 (мастера называют тысячи). Нет суммы — null\n` +
    `  "counterparty": string|null, // имя человека/клиента В ИМЕНИТЕЛЬНОМ падеже: «Ерлану» → "Ерлан", «от Асель» → "Асель", «монтажникам» → "монтажники"; нет — null\n` +
    `  "dueAt": "YYYY-MM-DD"|null, // срок долга («отдаст в пятницу» → ближайшая пятница); иначе null\n` +
    `  "text": string              // 1–4 слова, о чём: «материалы», «остаток за зал», «монтажникам», «долг»\n` +
    ` } | null,\n` +
    ` "ask": {                      // только при intent=ask, иначе null\n` +
    `  "ask": "notes|debts|money_period|money_search", // notes — что записывал; debts — кто/кому должен; money_period — сколько заработал/потратил/итог за период; money_search — траты/доходы по теме («на материалы», «от Асель»)\n` +
    `  "period": "today|week|month"|null,              // «сегодня», «за неделю», «за месяц»; не названо — null\n` +
    `  "query": string|null                           // тема поиска для money_search: «материалы», «Асель»\n` +
    ` } | null,\n` +
    ` "event": {                    // только при intent=event, иначе null\n` +
    `  "kind": "measure|install|meeting|call|birthday|other",   // замер → measure, монтаж/установка → install, встреча → meeting, позвонить/звонок → call, день рождения → birthday\n` +
    `  "title": string,            // короткое название без имени клиента: "Замер", "Монтаж", "Встреча", "Звонок", "День рождения" или своё ("Забрать полотно")\n` +
    `  "clientName": string|null,  // имя клиента/человека, как сказано (Айгерим, Серик, Марат Петрович)\n` +
    `  "address": string|null,     // адрес/место: "Сейфуллина 12", "Абая 5, кв 14". Исправь очевидные ошибки расшифровки улиц Казахстана (Сифулина → Сейфуллина)\n` +
    `  "phone": string|null,       // телефон цифрами, если назван\n` +
    `  "start": "YYYY-MM-DDTHH:mm"|null, // начало. "завтра", "послезавтра", "в пятницу" (ближайшая будущая), "через час", "в 3" днём → 15:00, если контекст рабочий день; "утром" → 10:00, "вечером" → 18:00, "в обед" → 13:00. Дата ясна, а время не названо — поставь 10:00 и timeUnknown=true. Дата НЕ названа вообще (нет «завтра», дня недели, числа, «через …», «в пятницу») — СТРОГО null, дату не угадывай\n` +
    `  "timeUnknown": boolean,     // true, если дата есть, а время мастер не назвал\n` +
    `  "durationMin": number,      // замер 60, монтаж 240, встреча 60, звонок 15, иначе 60; если сказано «с 10 до 12» — посчитай\n` +
    `  "allDay": boolean,          // true для дня рождения или события на весь день (start тогда "YYYY-MM-DDT00:00")\n` +
    `  "notes": string|null        // прочие детали: этаж, «два уровня», «клиент просил позвонить до», и т.п.\n` +
    `} | null}\n\n` +
    `Приоритет: деньги или долг (даже с датой) → money; «запомни»/факт без даты и денег → note; есть дата/время и это встреча, замер, монтаж, звонок, ДР → event; вопрос про свои записи/деньги → ask. ` +
    `«Заработал» без суммы → note. Примеры: «запомни: у Серика ключ от склада» → note; «сегодня заработал 120 тысяч от Асель» → money income 120000 Асель; ` +
    `«потратил 30 на материалы» → money expense 30000 «материалы»; «заплатил монтажникам 40 тысяч» → money expense 40000 «монтажникам»; ` +
    `«Марат занял 50 тысяч, отдаст в пятницу» → money debt_to_me 50000 Марат dueAt=пятница; «я должен Ерлану 20 тысяч» → money debt_mine 20000 Ерлан; ` +
    `«Марат отдал» → money debt_closed Марат; «кто мне должен?» → ask debts; «сколько заработал за неделю?» → ask money_period week; «сколько потратил на материалы?» → ask money_search «материалы».\n` +
    `Никаких уточняющих вопросов: чего не сказали — null. Нет адреса — address null, нет имени — clientName null.\n` +
    (args.current
      ? `Есть ТЕКУЩИЙ черновик, пользователь присылает ПРАВКУ или ответ на вопрос о дате. intent всегда "event". ` +
        `Верни event, где изменено ТОЛЬКО то, о чём говорит сообщение; поля, о которых сообщение молчит, верни как в черновике. ` +
        `«Не знаю», «пока нет», «без адреса» — это ответ про поле, а не правка остальных: ничего не обнуляй. ` +
        `Чтобы ОЧИСТИТЬ поле по явной просьбе («убери адрес»), верни пустую строку "".\nТекущий черновик: ${JSON.stringify(args.current)}\n`
      : `Если названо время, но не дата («в 3 часа») — считай сегодня, если это время ещё впереди, иначе завтра. ` +
        `Если нет ни даты, ни времени («замер у Айгерим на Сейфуллина 12», «позвонить Серику») — start null, timeUnknown false.\n`) +
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
  const rawIntent = parsed.intent;
  // Правка черновика — всегда событие; без черновика верим модели, а если она
  // не дала intent, судим по наличию event.
  const intent: MessageIntent = args.current
    ? "event"
    : rawIntent === "question" || rawIntent === "chat" || rawIntent === "note" || rawIntent === "money" || rawIntent === "ask"
      ? rawIntent
      : ev
        ? "event"
        : "chat";
  if (intent === "note") {
    const note = strOrNull(parsed.note) ?? args.text.replace(/^\s*(запомни|не забыть|не забудь)[:,\s]*/i, "").trim();
    return note ? { intent, draft: null, note } : { intent: "chat", draft: null };
  }
  if (intent === "money") {
    const money = parseMoney(parsed.money);
    return money ? { intent, draft: null, money } : { intent: "chat", draft: null };
  }
  if (intent === "ask") {
    const ask = parseAsk(parsed.ask);
    return ask ? { intent, draft: null, ask } : { intent: "question", draft: null };
  }
  if (intent !== "event") return { intent, draft: null };
  if (!ev) return { intent: args.current ? "event" : "chat", draft: args.current };

  const cur = args.current;
  const kind = (["measure", "install", "meeting", "call", "birthday", "other"] as EventKind[]).includes(ev.kind as EventKind)
    ? (ev.kind as EventKind)
    : cur?.kind ?? "other";
  const modelStart =
    typeof ev.start === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ev.start) ? ev.start.slice(0, 16) : null;
  // Правка: поле, о котором сообщение молчит, модель вернула null — берём из
  // черновика (19.10.2026: «ещё не знаю» на вопрос про адрес обнуляло дату).
  // Пустая строка — явная просьба очистить.
  const merge = (v: unknown, prev: string | null | undefined): string | null => {
    if (v === "") return null;
    const s = strOrNull(v);
    return s ?? (cur ? prev ?? null : null);
  };
  const start = modelStart ?? (cur?.start ?? null);
  const startChanged = modelStart !== null && modelStart !== cur?.start;
  const phoneRaw = merge(ev.phone, cur?.phone);
  const phone = phoneRaw ? normalizePhone(phoneRaw) || phoneRaw : null;

  const draft: CalendarEventDraft = {
    kind,
    title: (typeof ev.title === "string" && ev.title.trim()) || cur?.title || KIND_LABEL[kind],
    clientName: merge(ev.clientName, cur?.clientName),
    address: merge(ev.address, cur?.address),
    phone,
    start,
    durationMin:
      typeof ev.durationMin === "number" && ev.durationMin >= 5 && ev.durationMin <= 24 * 60
        ? Math.round(ev.durationMin)
        : cur?.durationMin ?? DEFAULT_DURATION[kind],
    allDay: cur && !startChanged ? cur.allDay === true : ev.allDay === true,
    timeUnknown: cur && !startChanged ? cur.timeUnknown === true : ev.timeUnknown === true && ev.allDay !== true,
    notes: merge(ev.notes, cur?.notes),
  };
  return { intent: "event", draft };
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

const MONEY_KINDS: MoneyKind[] = ["income", "expense", "debt_to_me", "debt_mine", "debt_closed"];
const ASK_KINDS: AskKind[] = ["notes", "debts", "money_period", "money_search"];

/** Сумма из ответа модели → тенге. Мастера говорят «85» про 85 тысяч: до 1000 умножаем. */
export function normalizeAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.,-]/g, "").replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const abs = Math.round(Math.abs(n));
  return abs < 1000 ? abs * 1000 : abs;
}

function parseMoney(v: unknown): MoneyDraft | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (!MONEY_KINDS.includes(m.kind as MoneyKind)) return null;
  const due = typeof m.dueAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(m.dueAt) ? m.dueAt.slice(0, 10) : null;
  return {
    kind: m.kind as MoneyKind,
    amount: normalizeAmount(m.amount),
    counterparty: strOrNull(m.counterparty),
    dueAt: due,
    text: strOrNull(m.text) ?? "",
  };
}

function parseAsk(v: unknown): AskDraft | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (!ASK_KINDS.includes(a.ask as AskKind)) return null;
  const period = a.period === "today" || a.period === "week" || a.period === "month" ? a.period : null;
  return { ask: a.ask as AskKind, period, query: strOrNull(a.query) };
}

// ── Карточка и событие ────────────────────────────────────────────────────

export function formatDraftCard(d: CalendarEventDraft, timeZone: string): string {
  const head = `${KIND_EMOJI[d.kind]} <b>${escapeHtml(d.title)}${d.clientName ? ` — ${escapeHtml(d.clientName)}` : ""}</b>`;
  const lines = [head];
  if (d.start && (d.allDay || d.timeUnknown)) {
    const startDate = zonedLocalToDate(d.start, timeZone);
    const day = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(startDate);
    const capDay = day.charAt(0).toUpperCase() + day.slice(1).replace(/\.$/, "");
    lines.push(d.allDay ? `🗓 ${capDay}, весь день` : `🗓 ${capDay}, <i>время не указано</i>`);
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
  // Время не названо — событие на весь день, мастер поправит в календаре.
  if (d.allDay || d.timeUnknown) {
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
