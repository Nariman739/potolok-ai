import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { handleTelegramBotMessage, handleBotCommand } from "@/lib/telegram-bot";

// Telegram sends POST requests to this endpoint
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat?.id ?? "");
    const text: string = message.text ?? "";

    // ── /start CODE — link master account ──
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const code = parts[1]?.trim();

      if (!code) {
        await sendTelegramMessage(
          chatId,
          "👋 Привет! Это бот <b>PotolokAI</b>.\n\n" +
          "📸 Отправьте фото замеров — посчитаю стоимость\n" +
          "🎤 Или наговорите голосом\n" +
          "✏️ Или напишите размеры текстом\n\n" +
          "Чтобы привязать аккаунт, перейдите в <b>Профиль → Telegram</b> на potolok.ai и нажмите «Привязать».\n\n" +
          "/help — все команды"
        );
        return NextResponse.json({ ok: true });
      }

      // Find master by link code
      const master = await prisma.master.findUnique({
        where: { telegramLinkCode: code },
        select: { id: true, firstName: true, telegramChatId: true },
      });

      if (!master) {
        await sendTelegramMessage(
          chatId,
          "❌ Код не найден или уже использован.\n\nСгенерируйте новый код в профиле PotolokAI."
        );
        return NextResponse.json({ ok: true });
      }

      // Save chat_id, clear link code
      await prisma.master.update({
        where: { id: master.id },
        data: {
          telegramChatId: chatId,
          telegramLinkCode: null,
        },
      });

      await sendTelegramMessage(
        chatId,
        `✅ <b>${master.firstName}, аккаунт PotolokAI привязан!</b>\n\n` +
        `Теперь вы можете:\n` +
        `📸 Отправить фото замеров — AI посчитает\n` +
        `🎤 Наговорить размеры голосом\n` +
        `✏️ Написать размеры текстом\n\n` +
        `/help — все команды`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Bot commands ──
    if (text.startsWith("/")) {
      const command = text.split(" ")[0].split("@")[0]; // strip @botname
      const master = await prisma.master.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true },
      });

      if (master) {
        await handleBotCommand(chatId, command, master.id);
      } else {
        await sendTelegramMessage(
          chatId,
          "❌ Аккаунт не привязан.\n\nПерейдите в <b>Профиль → Telegram</b> на potolok.ai."
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── Photo message ──
    const photo = message.photo;
    const photoFileId = photo
      ? photo[photo.length - 1]?.file_id // largest resolution
      : null;

    // ── Voice message ──
    const voiceFileId = message.voice?.file_id || message.audio?.file_id || null;

    // ── Process message (text / photo / voice) ──
    // Run in background — respond 200 immediately so Telegram doesn't retry
    const chatIdCopy = chatId;
    const textCopy = text || message.caption || null;
    const photoCopy = photoFileId;
    const voiceCopy = voiceFileId;

    // Use waitUntil-like pattern: start processing but don't await
    handleTelegramBotMessage(chatIdCopy, textCopy, photoCopy, voiceCopy).catch(
      (err) => console.error("Telegram bot processing error:", err)
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // always 200 to Telegram
  }
}
