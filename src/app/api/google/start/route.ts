import { NextRequest, NextResponse } from "next/server";
import {
  googleAuthUrl,
  isGoogleConfigured,
  makeOAuthState,
  verifyConnectToken,
  verifyOAuthState,
} from "@/lib/google-calendar";

/**
 * Старт подключения Google Календаря из Telegram-бота (17.10.2026).
 * c = постоянный подписанный chatId из кнопки (без срока). В момент нажатия
 * создаём свежий OAuth-state (10 мин) и отправляем на экран согласия Google;
 * state вернётся в callback. s = старый формат (state в самой кнопке) —
 * оставлен для сообщений, отправленных до 18.10.2026.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return new NextResponse("Подключение календаря временно недоступно.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const q = request.nextUrl.searchParams;
  const chatId = verifyConnectToken(q.get("c")) ?? verifyOAuthState(q.get("s"));
  if (!chatId) {
    return new NextResponse(
      "Ссылка не подходит. Вернитесь в Telegram-бот @potolokaiBot, отправьте /calendar и нажмите «Подключить Google Календарь».",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const state = makeOAuthState(chatId);
  return NextResponse.redirect(googleAuthUrl(state), { status: 302, headers: { "Cache-Control": "no-store" } });
}
