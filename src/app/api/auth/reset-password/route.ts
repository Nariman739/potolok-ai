import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { hashPassword } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`reset:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток." }, { status: 429 });
    }

    const { phone: rawPhone, otp, newPassword } = await request.json();

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: "Неверный формат телефона" }, { status: 400 });
    }
    // Лимит по IP один атакующий обходит дешёвыми прокси, а номера мастеров
    // видны на публичных страницах портфолио. Считаем попытки и на номер
    // (аудит 24.09.2026): код шестизначный, живёт 10 минут.
    const byPhone = await checkRateLimit(`reset-phone:${phone}`, 10, 15 * 60 * 1000);
    if (!byPhone.allowed) {
      return NextResponse.json({ error: "Слишком много попыток. Запросите код заново позже." }, { status: 429 });
    }
    if (!otp || !newPassword) {
      return NextResponse.json({ error: "Введите код и новый пароль" }, { status: 400 });
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: "Пароль минимум 4 символа" }, { status: 400 });
    }

    const master = await prisma.master.findUnique({
      where: { phone },
      select: { id: true, resetOtp: true, resetOtpExpiresAt: true },
    });

    if (!master || master.resetOtp !== otp) {
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    if (!master.resetOtpExpiresAt || master.resetOtpExpiresAt < new Date()) {
      return NextResponse.json({ error: "Код истёк. Запросите новый." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.master.update({
      where: { id: master.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiresAt: null },
    });
    // Пароль меняют в том числе потому, что телефон потеряли или увели доступ.
    // Старые сессии живут до 30 дней, поэтому обрываем их все (24.09.2026).
    await prisma.session.deleteMany({ where: { masterId: master.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
