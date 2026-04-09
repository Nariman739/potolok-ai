import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { answerCallbackQuery } from "@/lib/telegram";
import {
  handleTelegramBotMessage,
  handleBotCommand,
  handleInstagramPhoto,
  handleInstagramVideo,
  handleInstagramText,
  handleInstagramVoice,
  handleInstagramCallbackQuery,
  isInInstagramPostMode,
} from "@/lib/telegram-bot";
import { normalizePhone, looksLikePhone } from "@/lib/phone";

// Allow up to 60s for AI processing (vision + conversation)
export const maxDuration = 60;

// Telegram sends POST requests to this endpoint
export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
    }

    const body = await request.json();

    // ── Handle callback queries (inline keyboard button presses) ──
    const callbackQuery = body?.callback_query;
    if (callbackQuery) {
      const cbChatId = String(callbackQuery.message?.chat?.id ?? "");
      const cbData = callbackQuery.data || "";
      const cbId = callbackQuery.id;

      // Acknowledge the button press immediately
      await answerCallbackQuery(cbId);

      // Handle Instagram callbacks
      if (cbData.startsWith("ig_")) {
        try {
          await handleInstagramCallbackQuery(cbChatId, cbData);
        } catch (err) {
          console.error("Instagram callback error:", err);
        }
      }

      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat?.id ?? "");
    const text: string = (message.text ?? "").trim();

    // ── Check if user is already linked ──
    const linkedMaster = await prisma.master.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, firstName: true },
    });

    // ── /start — greeting + link flow ──
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const code = parts[1]?.trim();

      // /start CODE — link code flow (from profile page)
      if (code) {
        const master = await prisma.master.findUnique({
          where: { telegramLinkCode: code },
          select: { id: true, firstName: true },
        });

        if (!master) {
          await sendTelegramMessage(
            chatId,
            "❌ Код не найден или уже использован."
          );
          return NextResponse.json({ ok: true });
        }

        await prisma.master.update({
          where: { id: master.id },
          data: { telegramChatId: chatId, telegramLinkCode: null },
        });

        await sendLinkedMessage(chatId, master.firstName);
        return NextResponse.json({ ok: true });
      }

      // /start without code
      if (linkedMaster) {
        await sendTelegramMessage(
          chatId,
          `👋 <b>${linkedMaster.firstName}, с возвращением!</b>\n\n` +
          `📸 Отправьте <b>фото или видео</b> потолка — я подготовлю пост для Instagram!\n\n` +
          `💡 Для лучшего качества отправляйте как <b>файл</b> (📎 → Файл)\n` +
          `📹 Видео до 20 МБ\n\n` +
          `/post — начать сбор медиа\n` +
          `/help — все команды`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `👋 Привет! Это бот <b>PotolokAI</b>.\n\n` +
          `Чтобы начать, напишите <b>номер телефона</b> от аккаунта potolok.ai\n\n` +
          `Например: <code>+7 700 123 4567</code>\n\n` +
          `Ещё нет аккаунта? Зарегистрируйтесь на potolok.ai`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── Phone linking — if not linked and text looks like phone ──
    if (!linkedMaster && looksLikePhone(text)) {
      const phone = normalizePhone(text);

      if (!phone) {
        await sendTelegramMessage(
          chatId,
          `❌ Неверный формат номера.\n\nНапишите в формате: <code>+7 700 123 4567</code>`
        );
        return NextResponse.json({ ok: true });
      }

      const master = await prisma.master.findUnique({
        where: { phone },
        select: { id: true, firstName: true, telegramChatId: true },
      });

      if (!master) {
        await sendTelegramMessage(
          chatId,
          `❌ Аккаунт с номером <b>${phone}</b> не найден.\n\n` +
          `Проверьте номер или зарегистрируйтесь на potolok.ai`
        );
        return NextResponse.json({ ok: true });
      }

      if (master.telegramChatId && master.telegramChatId !== chatId) {
        await sendTelegramMessage(
          chatId,
          `⚠️ Этот аккаунт уже привязан к другому Telegram.\n\n` +
          `Отвяжите старый в <b>Профиль → Telegram</b> на сайте, потом попробуйте снова.`
        );
        return NextResponse.json({ ok: true });
      }

      await prisma.master.update({
        where: { id: master.id },
        data: { telegramChatId: chatId, telegramLinkCode: null },
      });

      await sendLinkedMessage(chatId, master.firstName);
      return NextResponse.json({ ok: true });
    }

    // ── Not linked and not phone — prompt to link ──
    if (!linkedMaster) {
      await sendTelegramMessage(
        chatId,
        `Для начала работы напишите <b>номер телефона</b> от аккаунта potolok.ai\n\n` +
        `Например: <code>+7 700 123 4567</code>`
      );
      return NextResponse.json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // From here — user is linked (linkedMaster exists)
    // ══════════════════════════════════════════════════

    // ── Bot commands ──
    if (text.startsWith("/")) {
      const command = text.split(" ")[0].split("@")[0];
      await handleBotCommand(chatId, command, linkedMaster.id);
      return NextResponse.json({ ok: true });
    }

    // ── Photo message ──
    const photo = message.photo;
    const photoFileId = photo
      ? photo[photo.length - 1]?.file_id
      : null;

    // ── Voice message ──
    const voiceFileId = message.voice?.file_id || message.audio?.file_id || null;

    // ── Video file ID (regular video or video_note) ──
    const videoFileId = message.video?.file_id || message.video_note?.file_id || null;

    // ── Document (file) — for full-quality photos/videos sent as files ──
    const doc = message.document;
    const docMime = doc?.mime_type || "";
    const docFileId = doc?.file_id || null;
    const isDocPhoto = docFileId && docMime.startsWith("image/");
    const isDocVideo = docFileId && docMime.startsWith("video/");

    // ── Auto-enter Instagram mode when media is received ──
    // (Bot is currently Instagram-only — no measurement mode)
    const hasMedia = photoFileId || videoFileId || isDocPhoto || isDocVideo;
    if (hasMedia && !isInInstagramPostMode(chatId)) {
      // Silently start Instagram post mode — first media will be collected below
      const { startInstagramPostModeSilent } = await import("@/lib/telegram-bot");
      startInstagramPostModeSilent(chatId);
    }

    // ── Instagram post mode: intercept photos, videos, documents, text, and voice ──
    if (isInInstagramPostMode(chatId)) {
      try {
        // Photos sent as regular photo
        if (photoFileId) {
          await handleInstagramPhoto(chatId, linkedMaster.id, photoFileId);
          return NextResponse.json({ ok: true });
        }
        // Photos sent as document (file) — full quality, no Telegram compression
        if (isDocPhoto && docFileId) {
          await handleInstagramPhoto(chatId, linkedMaster.id, docFileId);
          return NextResponse.json({ ok: true });
        }
        // Videos sent as regular video
        if (videoFileId) {
          await handleInstagramVideo(chatId, linkedMaster.id, videoFileId);
          return NextResponse.json({ ok: true });
        }
        // Videos sent as document (file) — full quality
        if (isDocVideo && docFileId) {
          await handleInstagramVideo(chatId, linkedMaster.id, docFileId);
          return NextResponse.json({ ok: true });
        }
        if (voiceFileId) {
          await handleInstagramVoice(chatId, linkedMaster.id, voiceFileId);
          return NextResponse.json({ ok: true });
        }
        const textContent = text || message.caption || null;
        if (textContent && !textContent.startsWith("/")) {
          await handleInstagramText(chatId, linkedMaster.id, textContent);
          return NextResponse.json({ ok: true });
        }
      } catch (err) {
        console.error("Instagram collection error:", err);
      }
    }

    // ── Text without media — show help (Instagram-only mode) ──
    const textContent = text || message.caption || null;
    if (textContent && !textContent.startsWith("/")) {
      await sendTelegramMessage(
        chatId,
        `📸 Отправьте <b>фото или видео</b> потолка — я подготовлю пост для Instagram!\n\n` +
        `💡 Для лучшего качества отправляйте как <b>файл</b> (📎 скрепка → Файл)\n\n` +
        `/post — начать сбор медиа\n` +
        `/help — все команды`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

// ── Helper: send "linked successfully" message ──
async function sendLinkedMessage(chatId: string, firstName: string) {
  await sendTelegramMessage(
    chatId,
    `✅ <b>${firstName}, аккаунт привязан!</b>\n\n` +
    `Теперь можете:\n` +
    `📸 Отправить фото/видео потолка — AI сделает пост для Instagram\n` +
    `🎤 Наговорить описание голосом\n` +
    `✏️ Написать описание текстом\n\n` +
    `Попробуйте — отправьте фото! 👆`
  );
}
