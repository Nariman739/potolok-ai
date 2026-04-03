import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
      return NextResponse.json(
        { error: `Слишком много попыток. Попробуйте через ${Math.ceil(retryAfterSec / 60)} мин.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json();
    const { phone: rawPhone, password } = body;

    if (!rawPhone || !password) {
      return NextResponse.json(
        { error: "Введите телефон и пароль" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json(
        { error: "Неверный формат телефона" },
        { status: 400 }
      );
    }

    const master = await prisma.master.findUnique({ where: { phone } });
    if (!master) {
      return NextResponse.json(
        { error: "Неверный телефон или пароль" },
        { status: 401 }
      );
    }

    if (!master.isActive) {
      return NextResponse.json(
        { error: "Аккаунт деактивирован" },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, master.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Неверный телефон или пароль" },
        { status: 401 }
      );
    }

    const token = await createSession(master.id);

    return NextResponse.json({
      id: master.id,
      phone: master.phone,
      firstName: master.firstName,
      companyName: master.companyName,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Ошибка входа" },
      { status: 500 }
    );
  }
}
