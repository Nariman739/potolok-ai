import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramShareContactRequest,
  sendTelegramMessageRemoveKeyboard,
} from "@/lib/telegram";
import { answerCallbackQuery } from "@/lib/telegram";
import { handleBotCommand, BOT_HELP } from "@/lib/telegram-bot";
import { normalizePhone, looksLikePhone } from "@/lib/phone";
import { activateSubscription, rejectPayment, notifyUserAboutPaymentDecision } from "@/lib/payment";

/**
 * Webhook Telegram-бота. Бот — только уведомления (14.10.2026):
 *  - /start, привязка по коду из профиля или по номеру телефона;
 *  - /start reset → поделиться номером → код сброса пароля;
 *  - кнопки ✅/❌ по оплатам (только владелец);
 *  - /kp, /help; всё остальное (фото, текст) — справка.
 */
export const maxDuration = 30;

// TELEGRAM_WEBHOOK_SECRET is REQUIRED — without it any attacker who knows the
// webhook URL can replay updates and impersonate any linked master.
//
// Проверка в handler, а не на module-load (раньше throw валил каждый
// Preview-деплой): нет/короткая env → 503, неверный header → 401.

export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || secret.length < 16) {
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

    // ── Callback queries (inline-кнопки) ──
    const callbackQuery = body?.callback_query;
    if (callbackQuery) {
      const cbChatId = String(callbackQuery.message?.chat?.id ?? "");
      const cbData = callbackQuery.data || "";
      const cbId = callbackQuery.id;

      // Acknowledge the button press immediately
      await answerCallbackQuery(cbId);

      // pay:approve:<id> / pay:reject:<id> — только владелец
      if (cbData.startsWith("pay:")) {
        try {
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
      }
      // Остальные callback'и (старые ig_/smm_ кнопки в истории чатов) — молча игнорируем.
      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat?.id ?? "");
    const text: string = (message.text ?? "").trim();

    // ── Привязан ли чат к мастеру ──
    const linkedMaster = await prisma.master.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, firstName: true },
    });

    // ── /start — приветствие + привязка ──
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const code = parts[1]?.trim();

      // /start reset — восстановление пароля: просим поделиться номером
      // (request_contact), по номеру находим мастера и шлём OTP в чат.
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

      // /start CODE — код привязки со страницы профиля
      if (code) {
        const master = await prisma.master.findUnique({
          where: { telegramLinkCode: code },
          select: { id: true, firstName: true },
        });

        if (!master) {
          await sendTelegramMessage(chatId, "❌ Код не найден или уже использован.");
          return NextResponse.json({ ok: true });
        }

        await prisma.master.update({
          where: { id: master.id },
          data: { telegramChatId: chatId, telegramLinkCode: null },
        });

        await sendLinkedMessage(chatId, master.firstName);
        return NextResponse.json({ ok: true });
      }

      // /start без кода
      if (linkedMaster) {
        await sendTelegramMessage(
          chatId,
          `👋 <b>${linkedMaster.firstName}, с возвращением!</b>\n\n` + BOT_HELP,
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

    // ── Контакт — восстановление пароля. Юзер нажал «📱 Поделиться номером»
    // после /start reset. Telegram прислал реальный номер из аккаунта — он
    // гарантированно принадлежит этому юзеру (подделать через webhook нельзя).
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
      // (личный +79261234567 / старый номер). Последних 9 цифр достаточно для
      // уникальности в Казахстане/СНГ (код оператора + 7 личных цифр).
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

      // OTP на 10 минут — в чат
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

    // ── Привязка по номеру — не привязан и текст похож на телефон ──
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

    // ── Не привязан и не телефон — просим номер ──
    if (!linkedMaster) {
      await sendTelegramMessage(
        chatId,
        `Для начала работы напишите <b>номер телефона</b> от аккаунта potolok.ai\n\n` +
        `Например: <code>+7 700 123 4567</code>`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Привязан: команды, всё остальное — справка ──
    if (text.startsWith("/")) {
      const command = text.split(" ")[0].split("@")[0];
      await handleBotCommand(chatId, command, linkedMaster.id);
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(chatId, BOT_HELP);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

// ── «Аккаунт привязан» ──
async function sendLinkedMessage(chatId: string, firstName: string) {
  await sendTelegramMessage(
    chatId,
    `✅ <b>${firstName}, аккаунт привязан!</b>\n\n` + BOT_HELP,
  );
}
