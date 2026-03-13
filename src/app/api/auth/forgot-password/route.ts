import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { sendTelegramMessage } from "@/lib/telegram";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
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

    const master = await prisma.master.findUnique({
      where: { phone },
      select: { id: true, telegramChatId: true, firstName: true },
    });

    // Always return ok to avoid user enumeration
    if (!master || !master.telegramChatId) {
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
