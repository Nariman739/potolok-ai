import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEveningQuestion, EVENING_QUESTION } from "@/lib/bot-memory";

// Vercel Cron (ежедневно 20:30 Asia/Almaty = 15:30 UTC): вечерний вопрос бота
// «Как прошёл день? Сколько получил, сколько потратил?» (22.10.2026).
//
// Кому: чаты, которые писали боту за последние 14 дней (BotSettings.lastUserMsgAt;
// пока настроек нет — по последней записи BotNote или подключению календаря) и
// не выключили /evening_off. Если 3 вечера подряд без ответа — шлём только по
// понедельникам. Никаких «вы не ответили»: один вопрос, один раз в день.
//
// ?dry=1 — показать получателей, ничего не отправлять.
export const maxDuration = 60;

const ACTIVE_DAYS = 14;
const MISSED_LIMIT = 3;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const now = new Date();
  const since = new Date(now.getTime() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getTime() - 12 * 60 * 60 * 1000); // крон раз в сутки; защита от повтора
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Almaty", weekday: "short" }).format(now);
  const isMonday = weekday === "Mon";

  // Активные чаты: настройки бота ∪ записи ∪ календарь (за 14 дней).
  const [settings, notes, links] = await Promise.all([
    prisma.botSettings.findMany({ where: { lastUserMsgAt: { gte: since } } }),
    prisma.botNote.findMany({
      where: { createdAt: { gte: since } },
      select: { telegramChatId: true },
      distinct: ["telegramChatId"],
    }),
    prisma.googleCalendarLink.findMany({ where: { updatedAt: { gte: since } }, select: { telegramChatId: true } }),
  ]);
  const settingsByChat = new Map(settings.map((s) => [s.telegramChatId, s]));
  const candidates = new Set<string>([
    ...settings.map((s) => s.telegramChatId),
    ...notes.map((n) => n.telegramChatId),
    ...links.map((l) => l.telegramChatId),
  ]);
  // Чаты с настройками, но неактивные (lastUserMsgAt старше 14 дней) — не трогаем.
  const stale = await prisma.botSettings.findMany({
    where: { telegramChatId: { in: [...candidates] }, lastUserMsgAt: { lt: since } },
    select: { telegramChatId: true },
  });
  for (const s of stale) candidates.delete(s.telegramChatId);
  const offRows = await prisma.botSettings.findMany({
    where: { telegramChatId: { in: [...candidates] }, eveningOff: true },
    select: { telegramChatId: true },
  });
  for (const s of offRows) candidates.delete(s.telegramChatId);

  const recipients: string[] = [];
  const skipped: Array<{ chatId: string; reason: string }> = [];
  for (const chatId of candidates) {
    const s = settingsByChat.get(chatId);
    if (s?.lastEveningAt && s.lastEveningAt > todayStart) {
      skipped.push({ chatId, reason: "already-today" });
      continue;
    }
    if ((s?.eveningMissed ?? 0) >= MISSED_LIMIT && !isMonday) {
      skipped.push({ chatId, reason: `missed-${s?.eveningMissed}-weekly` });
      continue;
    }
    recipients.push(chatId);
  }

  if (dry) {
    return NextResponse.json({ dry: true, text: EVENING_QUESTION, isMonday, recipients, skipped });
  }

  let sent = 0;
  const failed: string[] = [];
  for (const chatId of recipients) {
    try {
      await sendEveningQuestion(chatId);
      sent++;
    } catch (e) {
      console.warn("[tg-evening] failed for chat", chatId, e);
      failed.push(chatId);
    }
  }
  return NextResponse.json({ candidates: candidates.size, sent, failed, skipped });
}
