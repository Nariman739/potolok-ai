import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToMaster } from "@/lib/push";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatPrice } from "@/lib/format";

/**
 * «Посчитал, но не отправил» (14.10.2026). Раз в сутки, 09:00 по Алматы.
 *
 * Зачем: с 19.09 по 14.10 из 528 КП в приложении отправлено клиенту 90, а
 * 367 так и остались черновиками — четыре замера из пяти не превращаются в
 * отправленное КП. Утром напоминаем мастеру про вчерашние черновики.
 *
 * Дублей нет без отдельного поля: берём только КП, созданные ВЧЕРА (по
 * Алматы) и всё ещё DRAFT — каждое КП попадает в напоминание ровно один раз.
 * Текст без телефонов и адресов: пуш виден на заблокированном экране.
 */
export const maxDuration = 60;

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Границы вчерашнего дня по Алматы в UTC. */
function yesterdayAlmaty(): { from: Date; to: Date } {
  const nowZ = new Date(Date.now() + ALMATY_OFFSET_MS);
  nowZ.setUTCHours(0, 0, 0, 0);
  const to = new Date(nowZ.getTime() - ALMATY_OFFSET_MS);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { from, to } = yesterdayAlmaty();
  const drafts = await prisma.estimate.findMany({
    where: {
      status: "DRAFT",
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      total: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, masterId: true, clientName: true, total: true },
    take: 2000,
  });

  const byMaster = new Map<string, typeof drafts>();
  for (const d of drafts) {
    const list = byMaster.get(d.masterId) ?? [];
    list.push(d);
    byMaster.set(d.masterId, list);
  }

  let sent = 0;
  for (const [masterId, list] of byMaster) {
    const master = await prisma.master.findUnique({
      where: { id: masterId },
      select: { currency: true, telegramChatId: true },
    });
    if (!master) continue;

    const label = (d: (typeof list)[number]) =>
      `${d.clientName?.trim() || "КП"} — ${formatPrice(d.total, master.currency)}`;

    const msg =
      list.length === 1
        ? {
            title: "КП не отправлено клиенту",
            body: `Вчера посчитали: ${label(list[0])}. Отправить?`,
            data: { screen: `/estimate/${list[0].id}` },
          }
        : {
            title: `${list.length} КП не отправлены клиентам`,
            body: `Вчера посчитали: ${list.slice(0, 3).map(label).join(", ")}${list.length > 3 ? " и ещё" : ""}.`,
            data: { screen: "/(tabs)/estimates" },
          };

    await sendPushToMaster(masterId, msg);
    if (master.telegramChatId) {
      const lines = list.map((d) => `• ${label(d)}`).join("\n");
      await sendTelegramMessage(
        master.telegramChatId,
        `<b>${msg.title}</b>\nВчера посчитали, но клиент ещё не получил:\n${lines}\n\nОткрыть: https://potolok.ai/dashboard/estimates`,
      ).catch(() => {});
    }
    sent++;
  }

  return NextResponse.json({ drafts: drafts.length, masters: byMaster.size, sent });
}
