// Ответ ассистента в Telegram-боте (19.10.2026).
//
// Бот — ассистент, календарь — одна из функций. Любой текст или голос, не
// похожий на событие («что ты умеешь», «привет», «как отправить КП»), получает
// ответ того же помощника, что живёт в приложении (src/lib/assistant-prompt.ts),
// а не «не понял, какое событие создать».
//
// CRM-агент (src/lib/telegram-agent.ts) сюда НЕ подключён — не раздуваем.

import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { aiLogOnce } from "@/lib/ai-log";
import { reportAiError } from "@/lib/report-error";
import { buildTelegramAssistantPrompt } from "@/lib/assistant-prompt";
import { quickAnswer } from "@/lib/assistant-quick";
import { BOT_HELP } from "@/lib/telegram-bot";
import { sendTelegramMessage, sendTelegramMessageWithButtons, sendTypingAction } from "@/lib/telegram";

export type TgButtons = Array<Array<{ text: string; callback_data?: string; url?: string }>>;

export type AssistantMaster = { firstName: string; language?: string | null } | null | undefined;

/** Длиннее — не вопрос ассистенту, а вставленный текст; модель не дёргаем. */
const MAX_INPUT = 1000;

export function assistantLang(master: AssistantMaster, text: string): "ru" | "kk" {
  if (master?.language === "kk") return "kk";
  if (master?.language === "ru") return "ru";
  // Без аккаунта — по буквам, которых нет в русском алфавите.
  return /[әіңғүұқөһ]/i.test(text) ? "kk" : "ru";
}

/**
 * Ответить на сообщение как ассистент. Ничего не бросает — бот не должен
 * падать из-за ИИ; при сбое мастер получит короткое «попробуйте позже».
 */
export async function answerAsAssistant(
  chatId: string,
  text: string,
  opts: {
    master?: AssistantMaster;
    calendarConnected: boolean;
    /** Строка «🎙 Услышал: …» для голосовых — ставится перед ответом. */
    prefix?: string;
    /** Кнопки под ответом (например «Подключить Google Календарь»). */
    buttons?: TgButtons;
  },
): Promise<void> {
  const send = async (html: string) => {
    const body = (opts.prefix ? opts.prefix + "\n\n" : "") + html;
    if (opts.buttons?.length) await sendTelegramMessageWithButtons(chatId, body, opts.buttons);
    else await sendTelegramMessage(chatId, body);
  };

  const clean = text.trim();
  if (!clean) return;
  if (clean.length > MAX_INPUT) {
    await send("Коротко, пожалуйста — в 2–3 предложения, что нужно?");
    return;
  }

  await sendTypingAction(chatId);
  const reply = await assistantReply(clean, { master: opts.master, calendarConnected: opts.calendarConnected });
  await send(toTelegramHtml(reply));
}

/**
 * Текст ответа ассистента (без Telegram) — чтобы проверять в selftest.
 * Типовые «где/как» отвечаются мгновенно без модели, как в приложении.
 */
export async function assistantReply(
  text: string,
  opts: { master?: AssistantMaster; calendarConnected: boolean },
): Promise<string> {
  const clean = text.trim();
  const lang = assistantLang(opts.master, clean);

  const quick = quickAnswer(clean, false, lang);
  if (quick) {
    await aiLogOnce({
      feature: "telegram-assistant",
      input: clean,
      output: quick.answer,
      ok: true,
      model: "quick-answer",
      costUsd: 0,
      lang,
      platform: "telegram",
    });
    return quick.answer;
  }

  const system = buildTelegramAssistantPrompt({
    lang,
    masterName: opts.master?.firstName ?? null,
    calendarConnected: opts.calendarConnected,
    botHelpPlain: BOT_HELP.replace(/<[^>]+>/g, ""),
  });

  try {
    const res = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      temperature: 0.3,
      max_tokens: 450,
      messages: [
        { role: "system", content: system },
        { role: "user", content: clean },
      ],
    });
    const answer = (res.choices[0]?.message?.content ?? "").trim();
    const cost = (res.usage as { cost?: number } | undefined)?.cost ?? null;
    await aiLogOnce({
      feature: "telegram-assistant",
      input: clean,
      output: answer,
      ok: Boolean(answer),
      model: AI_MODEL,
      costUsd: cost,
      lang,
      platform: "telegram",
    });
    return answer || (lang === "kk" ? "Түсінбедім. Басқаша айтып көріңіз." : "Не понял. Скажите иначе?");
  } catch (e) {
    reportAiError(e, "telegram-assistant", "chat failed");
    await aiLogOnce({ feature: "telegram-assistant", input: clean, ok: false, error: e, model: AI_MODEL, lang, platform: "telegram" });
    return "⚠️ ИИ сейчас недоступен. Попробуйте через минуту.";
  }
}

/** Текст модели → безопасный HTML Telegram: экранируем, **жирный** → <b>. */
export function toTelegramHtml(s: string): string {
  const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*/gm, "");
}
