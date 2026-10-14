import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import type { DealStatus } from "@/generated/prisma/client";

// Vercel Cron (раз в сутки, 9:00 Asia/Almaty = 4:00 UTC):
// утренний дайджест клиентов, которым мастер должен позвонить.
// Бакеты "Просрочено" + "Сегодня" в одном сообщении на мастера.
//
// Дубликатов не боимся: каждое утро перечисляем актуальное состояние.
// Если мастер закрыл клиента (WON/LOST) или поставил nextContactAt в будущее —
// на следующий день он уже не попадёт в дайджест.
//
// 14.10.2026: дайджест уходит и пушем в приложение — Telegram привязан у 51
// мастера из 568, остальные его не видели. В пуше только имена (без
// телефонов): он виден на заблокированном экране.
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

  const todayEnd = endOfTodayAlmaty();
  const now = new Date();

  // Одним запросом по всем мастерам: раньше перебирали только привязанных к
  // Telegram, по запросу на каждого.
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      nextContactAt: { lte: todayEnd },
      status: { notIn: EXCLUDED_STATUSES },
    },
    orderBy: { nextContactAt: "asc" },
    select: {
      masterId: true,
      name: true,
      phone: true,
      nextContactAt: true,
      master: { select: { telegramChatId: true } },
    },
    take: 5000,
  });

  const byMaster = new Map<string, typeof clients>();
  for (const c of clients) {
    const list = byMaster.get(c.masterId) ?? [];
    if (list.length < 20) list.push(c);
    byMaster.set(c.masterId, list);
  }

  let sentCount = 0;
  for (const [masterId, list] of byMaster) {
    const overdue = list.filter((c) => c.nextContactAt! < now);
    const today = list.filter((c) => c.nextContactAt! >= now);

    const names = list.slice(0, 3).map((c) => c.name).join(", ");
    await sendPushToMaster(masterId, {
      title: overdue.length
        ? `Позвонить: ${today.length} сегодня, ${overdue.length} просрочено`
        : `Позвонить сегодня: ${today.length}`,
      body: `${names}${list.length > 3 ? " и ещё" : ""}`,
      data: { screen: "/(tabs)/clients" },
    });

    const telegramChatId = list[0].master.telegramChatId;
    if (telegramChatId) {
      const parts: string[] = [];
      if (overdue.length) {
        parts.push(
          `🔴 <b>Просрочено (${overdue.length})</b>:\n` +
            overdue.map((c) => `• ${c.name}${c.phone ? " — " + c.phone : ""}`).join("\n"),
        );
      }
      if (today.length) {
        parts.push(
          `🟡 <b>Сегодня (${today.length})</b>:\n` +
            today.map((c) => `• ${c.name}${c.phone ? " — " + c.phone : ""}`).join("\n"),
        );
      }
      try {
        await sendTelegramMessage(telegramChatId, parts.join("\n\n"));
      } catch (e) {
        console.warn("[tg-followups] failed for master", masterId, e);
      }
    }
    sentCount++;
  }

  return NextResponse.json({ masters: byMaster.size, sent: sentCount });
}
