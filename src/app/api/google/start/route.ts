import { NextRequest, NextResponse } from "next/server";
import { googleAuthUrl, isGoogleConfigured, verifyOAuthState } from "@/lib/google-calendar";

/**
 * Старт подключения Google Календаря из Telegram-бота (17.10.2026).
 * s = подписанный state (chatId + срок 24 ч). Проверяем подпись и
 * отправляем на экран согласия Google; тот же state вернётся в callback.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("s");
  if (!isGoogleConfigured()) {
    return new NextResponse("Подключение календаря временно недоступно.", { status: 503 });
  }
  if (!verifyOAuthState(state)) {
    return new NextResponse(
      "Ссылка устарела. Вернитесь в Telegram-бот @potolokaiBot и нажмите «Подключить Google Календарь» ещё раз.",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return NextResponse.redirect(googleAuthUrl(state as string), 302);
}
