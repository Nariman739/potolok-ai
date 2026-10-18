import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveCalendarLink, verifyOAuthState } from "@/lib/google-calendar";
import { sendTelegramMessage } from "@/lib/telegram";
import { reportError } from "@/lib/report-error";

/**
 * Возврат с экрана согласия Google (17.10.2026): проверяем state, меняем code
 * на токены, сохраняем связь чат ↔ календарь, пишем в Telegram «подключён»
 * и показываем страницу «Вернитесь в Telegram».
 */
export const dynamic = "force-dynamic";

const BOT_URL = "https://t.me/potolokaiBot";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chatId = verifyOAuthState(q.get("state"));
  const code = q.get("code");
  const googleError = q.get("error");

  if (!chatId) {
    return htmlPage({
      ok: false,
      title: "Ссылка устарела",
      text: "Вернитесь в Telegram-бот и нажмите «Подключить Google Календарь» ещё раз.",
    });
  }
  if (googleError || !code) {
    // Пользователь нажал «Отмена» на экране Google.
    return htmlPage({
      ok: false,
      title: "Доступ не выдан",
      text: "Календарь не подключён. Если передумаете — кнопка в боте работает снова.",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const { email } = await saveCalendarLink(chatId, tokens);
    await sendTelegramMessage(
      chatId,
      `✅ <b>Google Календарь подключён${email ? ` (${escapeHtml(email)})` : ""}</b>\n\n` +
        `Теперь просто напишите или наговорите голосом, что и когда:\n` +
        `🎙 «замер завтра в 15:00, Сейфуллина 12, Айгерим»\n` +
        `🎙 «монтаж в пятницу с 10 утра, Абая 5, Серик, 8 777 123 45 67»\n` +
        `🎙 «позвонить Марату в понедельник в 9»\n\n` +
        `Я покажу карточку — проверьте и нажмите «Сохранить». Событие появится в вашем Google Календаре с напоминанием.\n\n` +
        `/calendar_off — отключить календарь`,
    );
    return htmlPage({
      ok: true,
      title: "Готово!",
      text: email ? `Календарь ${email} подключён. Вернитесь в Telegram и наговорите первое событие.` : "Календарь подключён. Вернитесь в Telegram и наговорите первое событие.",
    });
  } catch (e) {
    reportError(e, "google-callback", "exchange/save failed");
    await sendTelegramMessage(
      chatId,
      "⚠️ Не удалось подключить календарь. Попробуйте ещё раз: /calendar",
    );
    return htmlPage({
      ok: false,
      title: "Что-то пошло не так",
      text: "Не удалось подключить календарь. Вернитесь в Telegram и попробуйте ещё раз командой /calendar.",
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlPage(p: { ok: boolean; title: string; text: string }) {
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)} — PotolokAI</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827}
  .card{background:#fff;border-radius:20px;padding:36px 28px;max-width:420px;width:calc(100% - 32px);text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  .icon{font-size:56px;line-height:1;margin-bottom:12px}
  h1{font-size:24px;margin:0 0 10px}
  p{color:#4b5563;line-height:1.5;margin:0 0 24px}
  a.btn{display:inline-block;background:#229ED9;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:12px;font-size:16px}
  .small{margin-top:18px;font-size:13px;color:#9ca3af}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${p.ok ? "✅" : "⚠️"}</div>
    <h1>${escapeHtml(p.title)}</h1>
    <p>${escapeHtml(p.text)}</p>
    <a class="btn" href="${BOT_URL}">Вернуться в Telegram</a>
    <div class="small">PotolokAI · potolok.ai</div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
