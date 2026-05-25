import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

// Vercel Cron (каждые 5 минут): напоминания за час до scheduledAt
// Окно [now+60min .. now+65min], чтобы попадать ровно один раз.
export const maxDuration = 60;

const EVENT_TYPE_LABELS: Record<string, string> = {
  CALL: "Звонок",
  MEETING: "Встреча",
  MEASUREMENT: "Замер",
  INSTALL: "Монтаж",
  WHATSAPP: "WhatsApp",
  NOTE: "Заметка",
};

export async function GET(request: NextRequest) {
  // Проверка cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inHourPlus = new Date(now.getTime() + 65 * 60 * 1000);

  const events = await prisma.clientEvent.findMany({
    where: {
      scheduledAt: { gte: inHour, lte: inHourPlus },
      reminderSentAt: null,
    },
    include: { client: { include: { master: true } } },
  });

  let sent = 0;
  for (const ev of events) {
    const master = ev.client.master;
    if (!master.telegramChatId) continue;
    const eventTypeLabel = EVENT_TYPE_LABELS[ev.type] ?? ev.type;
    const dateStr = ev.scheduledAt!.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Almaty",
    });
    const lines = [
      `🔔 <b>Через час:</b> ${eventTypeLabel}`,
      `👤 ${ev.client.name ?? "Клиент"}`,
      `📅 ${dateStr}`,
    ];
    if (ev.client.address) lines.push(`📍 ${ev.client.address}`);
    if (ev.client.phone) lines.push(`📞 ${ev.client.phone}`);
    const text = lines.join("\n");
    try {
      await sendTelegramMessage(master.telegramChatId, text);
      await prisma.clientEvent.update({
        where: { id: ev.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (e) {
      console.warn("[tg-reminder] failed:", ev.id, e);
    }
  }

  return NextResponse.json({ found: events.length, sent });
}
