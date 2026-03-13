import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { PRODUCT_ITEMS } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток регистрации. Попробуйте через час." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { phone: rawPhone, password, firstName, companyName } = body;

    if (!rawPhone || !password || !firstName) {
      return NextResponse.json(
        { error: "Телефон, пароль и имя обязательны" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json(
        { error: "Неверный формат телефона. Пример: +7 700 123 4567" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль минимум 6 символов" },
        { status: 400 }
      );
    }

    const existing = await prisma.master.findUnique({ where: { phone } });
    if (existing) {
      return NextResponse.json(
        { error: "Этот номер уже зарегистрирован" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const master = await prisma.master.create({
      data: {
        phone,
        passwordHash,
        firstName,
        companyName: companyName || null,
        prices: {
          create: PRODUCT_ITEMS.map((item) => ({
            itemCode: item.code,
            price: item.defaultPrice,
          })),
        },
      },
    });

    await createSession(master.id);

    return NextResponse.json({
      id: master.id,
      phone: master.phone,
      firstName: master.firstName,
      companyName: master.companyName,
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Ошибка регистрации" },
      { status: 500 }
    );
  }
}
