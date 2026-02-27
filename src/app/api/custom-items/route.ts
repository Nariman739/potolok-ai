import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const master = await requireAuth();

    const items = await prisma.customItem.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get custom items error:", error);
    return NextResponse.json(
      { error: "Ошибка получения позиций" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { name, unit, price } = body as {
      name: string;
      unit: string;
      price: number;
    };

    if (!name || !unit || price == null) {
      return NextResponse.json(
        { error: "Заполните все поля" },
        { status: 400 }
      );
    }

    const code = `custom_${crypto.randomUUID().slice(0, 8)}`;

    const item = await prisma.customItem.create({
      data: {
        masterId: master.id,
        code,
        name,
        unit,
        price,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create custom item error:", error);
    return NextResponse.json(
      { error: "Ошибка создания позиции" },
      { status: 500 }
    );
  }
}
