import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { reminderDate } from "@/lib/crm-calendar";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";

// 01.11.2026: ВЫКЛЮЧЕН из vercel.json — за 90 дней 0 напоминаний (мастера не
// ставят события со временем), а крон каждые 5 минут не давал Neon засыпать
// ночью (~$7/мес). Роут оставлен: вернуть = строка в vercel.json.
//
// Vercel Cron (каждые 5 минут): напоминания за час до scheduledAt
// Окно [now+60min .. now+65min], чтобы попадать ровно один раз.
//
// 14.10.2026: в vercel.json стояло «0 9 * * *» (раз в сутки, со времён Hobby)
// — окно в 5 минут проверялось один раз в день, напоминания почти никогда не
// уходили. Теперь на Pro расписание снова */5, и напоминание дублируется
// пушем в приложение (Telegram привязан у 51 мастера из 568).
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
  // Проверка cron secret (нет секрета — 401, src/lib/cron-auth.ts)
  if (!isCronAuthorized(request)) {
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
    const eventTypeLabel = EVENT_TYPE_LABELS[ev.type] ?? ev.type;
    const dateStr = reminderDate(ev.scheduledAt!, master.currency);
    const lines = [
      `🔔 <b>Через час:</b> ${eventTypeLabel}`,
      `👤 ${ev.client.name ?? "Клиент"}`,
    ];
    if (dateStr) lines.push(`📅 ${dateStr}`);
    if (ev.client.address) lines.push(`📍 ${ev.client.address}`);
    if (ev.client.phone) lines.push(`📞 ${ev.client.phone}`);
    const text = lines.join("\n");
    try {
      // Пуш без адреса и телефона — он виден на заблокированном экране.
      await sendPushToMaster(master.id, {
        title: `Через час: ${eventTypeLabel.toLowerCase()}`,
        body: [ev.client.name ?? "Клиент", dateStr].filter(Boolean).join(", "),
        data: { screen: `/client/${ev.client.id}` },
      });
      if (master.telegramChatId) await sendTelegramMessage(master.telegramChatId, text);
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
