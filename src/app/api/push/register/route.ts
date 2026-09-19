import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Приложение присылает сюда свой Expo push-токен после того, как мастер
 * разрешил уведомления. Вызывается при каждом запуске — так мы видим,
 * что устройство живо, и воскрешаем ранее отключённые токены.
 */
export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const { token, platform } = await request.json();

    if (typeof token !== "string" || !token.startsWith("ExpoPushToken[")) {
      return NextResponse.json({ error: "Некорректный токен" }, { status: 400 });
    }
    const plat = platform === "android" ? "android" : "ios";

    // Токен уникален на устройство. Если он был привязан к другому мастеру
    // (телефон передали сотруднику, зашли под другим аккаунтом) — переносим,
    // иначе пуши уйдут не тому человеку.
    await prisma.pushDevice.upsert({
      where: { token },
      create: { masterId: master.id, token, platform: plat },
      update: {
        masterId: master.id,
        platform: plat,
        lastSeenAt: new Date(),
        disabledAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Push register error:", error);
    return NextResponse.json({ error: "Ошибка регистрации устройства" }, { status: 500 });
  }
}

/** Мастер вышел из аккаунта на этом устройстве — перестаём слать ему пуши. */
export async function DELETE(request: Request) {
  try {
    const master = await requireAuth();
    const { token } = await request.json();
    if (typeof token === "string" && token) {
      // masterId обязателен: без него любой авторизованный мастер, знающий
      // чужой токен, мог отключить уведомления чужому устройству.
      await prisma.pushDevice.deleteMany({ where: { token, masterId: master.id } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
