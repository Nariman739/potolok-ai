import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Промокоды закрыты (12.10.2026). FEST2026 (3 месяца бесплатно) и POTOLOKFEST
 * (скидка основателя) больше не действуют: цену основателя теперь получает
 * каждый, кто оплатил до дедлайна, без кода. Роут оставлен, чтобы старые
 * версии приложения получали понятный ответ, а не 404.
 */
export async function POST(request: Request) {
  try {
    const me = await requireAuth();
    const rl = await checkRateLimit(`promocode:${me.id}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }
    await request.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Промокоды больше не действуют. Стартовая цена и так доступна всем до 31 декабря." },
      { status: 410 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
