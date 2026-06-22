import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramShareContactRequest,
  sendTelegramMessageRemoveKeyboard,
} from "@/lib/telegram";
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
  startInstagramPostModeSilent,
  handleSmmOnboarding,
  handleSmmOnboardingCallback,
  handleSmmUspAnswer,
} from "@/lib/telegram-bot";
import { normalizePhone, looksLikePhone } from "@/lib/phone";
import { activateSubscription, rejectPayment, notifyUserAboutPaymentDecision } from "@/lib/payment";

// Allow up to 60s for AI processing (vision + conversation)
export const maxDuration = 60;

// TELEGRAM_WEBHOOK_SECRET is REQUIRED — without it any attacker who knows the
// webhook URL can replay updates and impersonate any linked master.
//
// Проверка перенесена в handler (раньше throw на module-load, что валило
// КАЖДЫЙ Preview-деплой и блокировало бы Production-деплой если кто-то
// случайно удалит env). Теперь:
//   - если env не задана  → возвращаем 503 (видно в Sentry / Vercel logs)
//   - если задана слишком короткая → тоже 503
//   - запросы без правильного header → 401 как и раньше
// Билд проходит независимо.

// Telegram sends POST requests to this endpoint
export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || secret.length < 16) {
      // Critical misconfiguration — алертим в логи. Возвращаем 503 а не 401,
      // чтобы оператор сразу понял что это конфиг, а не атака.
      console.error(
        "[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is not set or too short. " +
        "Webhook is REJECTING ALL traffic. Set env on Vercel and reload.",
      );
      return NextResponse.json({ ok: false, error: "Webhook misconfigured" }, { status: 503 });
    }
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
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

      // Handle payment approval/rejection callbacks (pay:approve:<id>, pay:reject:<id>)
      if (cbData.startsWith("pay:")) {
        try {
          // Только владелец (isOwner) может одобрять оплаты
          const admin = await prisma.master.findUnique({
            where: { telegramChatId: cbChatId },
            select: { id: true, isOwner: true },
          });
          if (!admin?.isOwner) {
            await sendTelegramMessage(cbChatId, "❌ Нет прав на одобрение оплат");
            return NextResponse.json({ ok: true });
          }

          const [, action, paymentId] = cbData.split(":");
          if (!paymentId) {
            return NextResponse.json({ ok: true });
          }

          if (action === "approve") {
            const result = await activateSubscription({ paymentId, adminId: admin.id });
            await sendTelegramMessage(
              cbChatId,
              `✅ Активировано: ${result.master.firstName} (+${result.payment.activatedDays ?? 30} дней)`,
            );
            try {
              await notifyUserAboutPaymentDecision({
                master: result.master,
                payment: result.payment,
                approved: true,
                firstApproved: result.firstApproved,
              });
            } catch (err) {
              console.error("notifyUserAboutPaymentDecision failed:", err);
            }
          } else if (action === "reject") {
            const result = await rejectPayment({ paymentId, adminId: admin.id });
            await sendTelegramMessage(
              cbChatId,
              `❌ Отклонено: ${result.master.firstName}`,
            );
            try {
              await notifyUserAboutPaymentDecision({
                master: result.master,
                payment: result.payment,
                approved: false,
              });
            } catch (err) {
              console.error("notifyUserAboutPaymentDecision failed:", err);
            }
          }
        } catch (err) {
          console.error("Payment callback error:", err);
          await sendTelegramMessage(cbChatId, "⚠️ Ошибка обработки оплаты");
        }
        return NextResponse.json({ ok: true });
      }

      // Handle SMM onboarding callbacks (smm_tone:xxx, smm_aud:xxx)
      if (cbData.startsWith("smm_")) {
        try {
          const cbLinked = await prisma.master.findUnique({
            where: { telegramChatId: cbChatId },
            select: { id: true },
          });
          if (cbLinked) {
            await handleSmmOnboardingCallback(cbChatId, cbLinked.id, cbData);
          }
        } catch (err) {
          console.error("SMM onboarding callback error:", err);
        }
        return NextResponse.json({ ok: true });
      }

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

      // /start reset — flow восстановления пароля.
      // Просим юзера поделиться номером (request_contact). По номеру
      // находим мастера и шлём ему OTP прямо в чат.
      if (code === "reset") {
        await sendTelegramShareContactRequest(
          chatId,
          `🔐 <b>Восстановление пароля PotolokAI</b>\n\n` +
          `Нажмите кнопку ниже, чтобы поделиться номером телефона. ` +
          `Я отправлю код подтверждения сюда же в чат.\n\n` +
          `Никаких SMS или ввода номера руками — Telegram сам передаст ваш номер.`,
          "📱 Поделиться номером"
        );
        return NextResponse.json({ ok: true });
      }

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

    // ── Contact share — flow восстановления пароля.
    // Юзер нажал «📱 Поделиться номером» после /start reset.
    // Telegram прислал реальный номер из аккаунта — он гарантированно
    // принадлежит этому юзеру (подделать через webhook нельзя).
    if (message.contact?.phone_number) {
      const rawContactPhone: string = String(message.contact.phone_number);
      const contactPhone = normalizePhone(
        rawContactPhone.startsWith("+") ? rawContactPhone : `+${rawContactPhone}`
      );
      if (!contactPhone) {
        await sendTelegramMessageRemoveKeyboard(
          chatId,
          "❌ Не смог распознать номер. Попробуйте ещё раз: /start reset"
        );
        return NextResponse.json({ ok: true });
      }

      let master = await prisma.master.findUnique({
        where: { phone: contactPhone },
        select: { id: true, firstName: true, telegramChatId: true },
      });

      // Fuzzy fallback (Нариман 2026-06-22): если точного совпадения нет —
      // ищем по последним 9 цифрам. Сценарий: мастер регистрировался с одним
      // номером (например рабочий +77001234567), а Telegram у него на другом
      // (личный +79261234567 / старый номер). Findfirst по `endsWith` найдёт
      // если последние 9 цифр совпадают — этого достаточно для уникальности
      // в Казахстане/СНГ (код страны + код оператора + 7 личных цифр).
      // 90% наших мастеров (95 из 105) не привязаны к TG — без fuzzy они
      // никак не восстановят пароль если в БД и в Telegram разные номера.
      if (!master) {
        const digits = contactPhone.replace(/\D/g, "");
        if (digits.length >= 9) {
          const last9 = digits.slice(-9);
          master = await prisma.master.findFirst({
            where: { phone: { endsWith: last9 } },
            select: { id: true, firstName: true, telegramChatId: true },
          });
        }
      }

      if (!master) {
        await sendTelegramMessageRemoveKeyboard(
          chatId,
          `❌ Аккаунт с номером <b>${contactPhone}</b> не найден.\n\n` +
          `Возможно, в аккаунте potolok.ai указан другой номер. ` +
          `Зарегистрируйтесь на potolok.ai или проверьте номер.`
        );
        return NextResponse.json({ ok: true });
      }

      // Auto-link telegramChatId если не привязан или сменился
      if (master.telegramChatId !== chatId) {
        await prisma.master.update({
          where: { id: master.id },
          data: { telegramChatId: chatId, telegramLinkCode: null },
        });
      }

      // Сгенерить OTP, сохранить (10 мин), отправить в чат
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.master.update({
        where: { id: master.id },
        data: { resetOtp: otp, resetOtpExpiresAt: expiresAt },
      });

      await sendTelegramMessageRemoveKeyboard(
        chatId,
        `🔐 <b>${master.firstName}, ваш код сброса пароля:</b>\n\n` +
        `<code>${otp}</code>\n\n` +
        `Код действует 10 минут. Введите его в приложении или на potolok.ai, ` +
        `затем задайте новый пароль.\n\n` +
        `Никому не сообщайте этот код.`
      );
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

    // ── SMM onboarding text answers (city, usp) ──
    if (text && !text.startsWith("/")) {
      // Check city answer first, then USP answer
      const handled = await handleSmmOnboarding(chatId, linkedMaster.id, text)
        || await handleSmmUspAnswer(chatId, linkedMaster.id, text);
      if (handled) return NextResponse.json({ ok: true });
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
    const alreadyInIgMode = await isInInstagramPostMode(chatId);
    let justEnteredIgMode = false;
    if (hasMedia && !alreadyInIgMode) {
      // Silently start Instagram post mode (checks subscription — shows upsell if needed)
      justEnteredIgMode = await startInstagramPostModeSilent(chatId, linkedMaster.id);
      if (!justEnteredIgMode) {
        // Subscription check failed — upsell message already sent
        return NextResponse.json({ ok: true });
      }
    }

    // ── Instagram post mode: intercept photos, videos, documents, text, and voice ──
    const inIgMode = justEnteredIgMode || alreadyInIgMode;
    if (inIgMode) {
      try {
        // Extract caption from media messages (Telegram puts text in caption, not text)
        const caption = message.caption?.trim() || null;

        // Photos sent as regular photo
        if (photoFileId) {
          await handleInstagramPhoto(chatId, linkedMaster.id, photoFileId);
          // Also capture caption if present (e.g. "Вот софиты ВН 53")
          if (caption) await handleInstagramText(chatId, linkedMaster.id, caption);
          return NextResponse.json({ ok: true });
        }
        // Photos sent as document (file) — full quality, no Telegram compression
        if (isDocPhoto && docFileId) {
          await handleInstagramPhoto(chatId, linkedMaster.id, docFileId);
          if (caption) await handleInstagramText(chatId, linkedMaster.id, caption);
          return NextResponse.json({ ok: true });
        }
        // Videos sent as regular video
        if (videoFileId) {
          await handleInstagramVideo(chatId, linkedMaster.id, videoFileId);
          if (caption) await handleInstagramText(chatId, linkedMaster.id, caption);
          return NextResponse.json({ ok: true });
        }
        // Videos sent as document (file) — full quality
        if (isDocVideo && docFileId) {
          await handleInstagramVideo(chatId, linkedMaster.id, docFileId);
          if (caption) await handleInstagramText(chatId, linkedMaster.id, caption);
          return NextResponse.json({ ok: true });
        }
        if (voiceFileId) {
          await handleInstagramVoice(chatId, linkedMaster.id, voiceFileId);
          return NextResponse.json({ ok: true });
        }
        // Text-only message (no media) — user description
        const textContent = text || null;
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
