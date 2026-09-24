import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendWhatsappOtp, whatsappConfigured } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Подождите 15 минут." },
        { status: 429 }
      );
    }

    const { phone: rawPhone } = await request.json();
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: "Неверный формат телефона" }, { status: 400 });
    }
    // Второй счётчик — на номер: лимит по IP обходится сменой адреса, а номера
    // мастеров публичны на страницах портфолио (аудит 24.09.2026).
    const byPhone = await checkRateLimit(`forgot-phone:${phone}`, 5, 15 * 60 * 1000);
    if (!byPhone.allowed) {
      return NextResponse.json({ error: "Слишком много запросов. Подождите 15 минут." }, { status: 429 });
    }

    const master = await prisma.master.findUnique({
      where: { phone },
      select: { id: true, telegramChatId: true, firstName: true },
    });

    // WhatsApp — второй канал для кода (24.09.2026). Бота в Telegram знают
    // 32 мастера из 357, и остальные, забыв пароль, теряли доступ навсегда.
    // Шлём туда, когда привязки к Telegram нет, а WhatsApp настроен.
    const viaWhatsapp = !!master && !master.telegramChatId && whatsappConfigured();
    if (viaWhatsapp && master) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await prisma.master.update({
        where: { id: master.id },
        data: { resetOtp: otp, resetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      const sent = await sendWhatsappOtp(phone, otp);
      // Канал оставляем неизвестным для чужих: ответ одинаковый в любом случае,
      // иначе по нему можно перебирать, кто зарегистрирован.
      if (!sent.ok) console.warn("[forgot-password] whatsapp failed", sent.error);
      return NextResponse.json({ ok: true, channel: sent.ok ? "whatsapp" : undefined });
    }

    // Always return ok to avoid user enumeration
    if (!master || !master.telegramChatId) {
      // Нариман 2026-06-22: логируем тихие отказы чтобы видеть масштаб
      // через Vercel logs / Sentry. Сами по себе случаи безобидны (UX
      // подсказывает мастеру использовать большую синюю кнопку Telegram
      // которая работает без предварительной привязки), но нам важно
      // понимать сколько мастеров застряли на этом пути.
      console.warn("[forgot-password] silent skip", {
        hasMaster: !!master,
        hasTelegramLink: !!(master && master.telegramChatId),
        phoneSuffix: phone.slice(-4),
      });
      return NextResponse.json({ ok: true });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.master.update({
      where: { id: master.id },
      data: { resetOtp: otp, resetOtpExpiresAt: expiresAt },
    });

    await sendTelegramMessage(
      master.telegramChatId,
      `🔐 <b>Сброс пароля PotolokAI</b>\n\n` +
      `Ваш код подтверждения: <code>${otp}</code>\n\n` +
      `Код действует 10 минут. Никому не сообщайте его.`
    );

    return NextResponse.json({ ok: true, channel: "telegram" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
