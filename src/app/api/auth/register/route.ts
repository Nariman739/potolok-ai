import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { PRODUCT_ITEMS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, firstName, companyName } = body;

    if (!email || !password || !firstName) {
      return NextResponse.json(
        { error: "Email, пароль и имя обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль минимум 6 символов" },
        { status: 400 }
      );
    }

    const existing = await prisma.master.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Этот email уже зарегистрирован" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const master = await prisma.master.create({
      data: {
        email,
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
      email: master.email,
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
