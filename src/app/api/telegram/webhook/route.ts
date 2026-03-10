import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { handleTelegramBotMessage, handleBotCommand } from "@/lib/telegram-bot";
import { normalizePhone, looksLikePhone } from "@/lib/phone";

// Allow up to 60s for AI processing (vision + conversation)
export const maxDuration = 60;

// Telegram sends POST requests to this endpoint
export async function POST(request: Request) {
  try {
    const body = await request.json();
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
          `📸 Отправьте фото замеров — посчитаю стоимость\n` +
          `🎤 Или наговорите голосом\n` +
          `✏️ Или напишите размеры текстом\n\n` +
          `/new — новый расчёт\n` +
          `/kp — ваши КП\n` +
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

    // ── Process message (text / photo / voice) ──
    // MUST await — Vercel kills serverless function after return
    const textContent = text || message.caption || null;

    try {
      await handleTelegramBotMessage(chatId, textContent, photoFileId, voiceFileId);
    } catch (err) {
      console.error("Telegram bot processing error:", err);
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
    `📸 Отправить фото замеров — AI посчитает\n` +
    `🎤 Наговорить размеры голосом\n` +
    `✏️ Написать размеры текстом\n\n` +
    `Попробуйте прямо сейчас — отправьте фото! 👆`
  );
}
