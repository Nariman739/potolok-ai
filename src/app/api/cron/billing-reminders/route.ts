import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToMaster } from "@/lib/push";
import { sendTelegramMessage } from "@/lib/telegram";
import { BILLING_ENABLED, FREE_UNTIL, FOUNDER_DEADLINE, daysUntil } from "@/lib/billing";

/**
 * Напоминания об оплате (12.10.2026). Раз в сутки, 10:00 по Алматы.
 *
 * Кому и когда (день = целое число дней до paidUntil):
 *   −7, −3, 0  — «PRO заканчивается», мягко;
 *   +3         — «PRO закончился, старое открыто, новые объекты — на PRO».
 * Плюс старым мастерам за 7 и 1 день до FREE_UNTIL — «бесплатный период
 * заканчивается, успейте зафиксировать цену».
 *
 * Без отдельного поля «напоминали»: запускаемся раз в сутки и бьём только в
 * точные дни, поэтому дублей нет. Текст без цен и ссылок — пуш виден в iOS
 * (App Store 3.1.1); цена и кнопка — на сайте/в Telegram.
 */
export const maxDuration = 60;

const PAID_DAYS = new Set([7, 3, 0, -3]);

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!BILLING_ENABLED) return NextResponse.json({ skipped: "billing disabled" });

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  let sent = 0;

  // ── Оплаченные: окно −8…+4 дня, точный день фильтруем в коде ──
  const paid = await prisma.master.findMany({
    where: {
      isOwner: false,
      paidUntil: { gte: new Date(now.getTime() - 4 * dayMs), lte: new Date(now.getTime() + 8 * dayMs) },
    },
    select: { id: true, paidUntil: true, telegramChatId: true },
    take: 1000,
  });
  for (const m of paid) {
    const d = daysUntil(m.paidUntil, now);
    if (d === null || !PAID_DAYS.has(d)) continue;
    const msg =
      d > 0
        ? { title: `PRO заканчивается через ${d} дн.`, body: "Продлите подписку, чтобы новые замеры и КП не останавливались. Всё старое останется открытым." }
        : d === 0
          ? { title: "PRO заканчивается сегодня", body: "Продлите подписку на сайте potolok.ai. Старые объекты и КП останутся открытыми." }
          : { title: "PRO закончился", body: "Старые замеры и КП открыты. Для новых объектов продлите PRO на сайте potolok.ai." };
    await sendPushToMaster(m.id, { ...msg, data: { screen: "/(tabs)/profile" } });
    if (m.telegramChatId) {
      await sendTelegramMessage(m.telegramChatId, `<b>${msg.title}</b>\n${msg.body}\n\nПродлить: https://potolok.ai/pricing`).catch(() => {});
    }
    sent++;
  }

  // ── Старые мастера перед концом бесплатного периода ──
  const dFree = daysUntil(FREE_UNTIL, now);
  if (dFree === 7 || dFree === 1) {
    const olds = await prisma.master.findMany({
      where: { isOwner: false, OR: [{ paidUntil: null }, { paidUntil: { lt: now } }] },
      select: { id: true, telegramChatId: true },
      take: 2000,
    });
    const founderStillOpen = now < FOUNDER_DEADLINE;
    for (const m of olds) {
      await sendPushToMaster(m.id, {
        title: dFree === 1 ? "Завтра заканчивается бесплатный период" : "Через неделю заканчивается бесплатный период",
        body: founderStillOpen
          ? "Потом — тариф PRO или первые 10 объектов бесплатно. Успейте зафиксировать цену основателя на сайте potolok.ai."
          : "Потом — тариф PRO или первые 10 объектов бесплатно. Всё, что вы сделали, останется открытым.",
        data: { screen: "/(tabs)/profile" },
      });
      if (m.telegramChatId) {
        await sendTelegramMessage(m.telegramChatId, `Бесплатный период заканчивается ${dFree === 1 ? "завтра" : "через неделю"}. Зафиксировать цену основателя: https://potolok.ai/pricing`).catch(() => {});
      }
      sent++;
    }
  }

  return NextResponse.json({ checked: paid.length, sent });
}
