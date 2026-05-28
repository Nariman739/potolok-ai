import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { DealStatus } from "@/generated/prisma/client";

// Vercel Cron (раз в сутки, 9:00 Asia/Almaty = 4:00 UTC):
// утренний дайджест клиентов, которым мастер должен позвонить.
// Бакеты "Просрочено" + "Сегодня" в одном сообщении на мастера.
//
// Дубликатов не боимся: каждое утро перечисляем актуальное состояние.
// Если мастер закрыл клиента (WON/LOST) или поставил nextContactAt в будущее —
// на следующий день он уже не попадёт в дайджест.
//
// Не путать с /api/cron/tg-reminders — тот шлёт за час до ClientEvent.scheduledAt
// (замеры, встречи, монтажи).
export const maxDuration = 60;

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

function endOfTodayAlmaty(): Date {
  const nowZ = new Date(Date.now() + ALMATY_OFFSET_MS);
  nowZ.setUTCHours(23, 59, 59, 999);
  return new Date(nowZ.getTime() - ALMATY_OFFSET_MS);
}

const EXCLUDED_STATUSES: DealStatus[] = ["WON", "LOST"];

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prisma groupBy не умеет relation filter — берём мастеров, потом по каждому.
  const masters = await prisma.master.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });

  const todayEnd = endOfTodayAlmaty();
  const now = new Date();
  let sentCount = 0;

  for (const m of masters) {
    if (!m.telegramChatId) continue;

    const clients = await prisma.client.findMany({
      where: {
        masterId: m.id,
        nextContactAt: { lte: todayEnd },
        status: { notIn: EXCLUDED_STATUSES },
      },
      orderBy: { nextContactAt: "asc" },
      take: 20,
      select: { name: true, phone: true, nextContactAt: true },
    });
    if (clients.length === 0) continue;

    const overdue = clients.filter((c) => c.nextContactAt! < now);
    const today = clients.filter((c) => c.nextContactAt! >= now);

    const parts: string[] = [];
    if (overdue.length) {
      parts.push(
        `🔴 <b>Просрочено (${overdue.length})</b>:\n` +
          overdue
            .map((c) => `• ${c.name}${c.phone ? " — " + c.phone : ""}`)
            .join("\n"),
      );
    }
    if (today.length) {
      parts.push(
        `🟡 <b>Сегодня (${today.length})</b>:\n` +
          today
            .map((c) => `• ${c.name}${c.phone ? " — " + c.phone : ""}`)
            .join("\n"),
      );
    }

    try {
      await sendTelegramMessage(m.telegramChatId, parts.join("\n\n"));
      sentCount++;
    } catch (e) {
      console.warn("[tg-followups] failed for master", m.id, e);
    }
  }

  return NextResponse.json({ masters: masters.length, sent: sentCount });
}
