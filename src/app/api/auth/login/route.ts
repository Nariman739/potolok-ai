import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Введите email и пароль" },
        { status: 400 }
      );
    }

    const master = await prisma.master.findUnique({ where: { email } });
    if (!master) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
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
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    await createSession(master.id);

    return NextResponse.json({
      id: master.id,
      email: master.email,
      firstName: master.firstName,
      companyName: master.companyName,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Ошибка входа" },
      { status: 500 }
    );
  }
}
