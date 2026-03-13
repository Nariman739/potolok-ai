import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { hashPassword } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`reset:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток." }, { status: 429 });
    }

    const { phone: rawPhone, otp, newPassword } = await request.json();

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: "Неверный формат телефона" }, { status: 400 });
    }
    if (!otp || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "Введите код и новый пароль (мин. 6 символов)" }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
