import { NextResponse } from "next/server";
import { requireAuth, deleteSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// DELETE /api/account
// Body: { password: string, confirmPhrase: string }
//
// Двойная защита от случайного удаления:
//   1) пароль мастера (bcrypt verify)
//   2) точная фраза "УДАЛИТЬ АККАУНТ"
//
// Раньше DELETE стирал аккаунт по одному только session-cookie. Случайный
// тап в UI / перехват сессии = безвозвратная потеря всех данных
// (замеры, КП, договоры). Soft-delete не помогал, т.к. Master сам
// уносил за собой связанные записи через onDelete:Cascade.
const CONFIRM_PHRASE = "УДАЛИТЬ АККАУНТ";

export async function DELETE(request: Request) {
  try {
    const master = await requireAuth();

    const rl = await checkRateLimit(`account-delete:${master.id}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте через час." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { password, confirmPhrase } = body as {
      password?: string;
      confirmPhrase?: string;
    };

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Введите пароль для подтверждения" },
        { status: 400 },
      );
    }

    if (confirmPhrase !== CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          error: `Подтвердите удаление: введите фразу «${CONFIRM_PHRASE}»`,
          requiredPhrase: CONFIRM_PHRASE,
        },
        { status: 400 },
      );
    }

    const fresh = await prisma.master.findUnique({
      where: { id: master.id },
      select: { passwordHash: true },
    });
    if (!fresh) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }

    const valid = await verifyPassword(password, fresh.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    await prisma.master.delete({ where: { id: master.id } });

    try {
      await deleteSession();
    } catch {
      // session cookie may already be gone — игнорим
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Не удалось удалить аккаунт" },
      { status: 500 },
    );
  }
}
