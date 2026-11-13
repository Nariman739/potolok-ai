import { prisma } from "@/lib/prisma";
import { isActReplaced } from "@/lib/estimate-replace";

/**
 * Акты, по которым пора напомнить мастеру (cron/act-reminders): отправлен клиенту больше
 * суток назад, не подписан, замечаний нет, напоминания не было. Вынесено из роута
 * (13.11.2026), чтобы проверять выборку без рассылки пушей.
 *
 * Заменённые акты (мастер/клиент выбрали другой вариант КП) — мимо: ссылка мёртвая,
 * «отправить ещё раз?» звало бы мастера переслать недействующий документ.
 */
export async function dueActReminders(now = Date.now()) {
  const rows = await prisma.estimate.findMany({
    where: {
      deletedAt: null,
      actPublicId: { not: null },
      actSignedAt: null,
      actClientRemarks: null,
      actRemindedAt: null,
      actSentAt: { lt: new Date(now - 20 * 60 * 60 * 1000), gt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    },
    // actTextSnapshot у неподписанного акта пуст или только с пометкой «заменён» — лёгкий
    select: { id: true, masterId: true, clientName: true, clientAddress: true, measurementObjectId: true, actSignedAt: true, actTextSnapshot: true },
    take: 500,
  });
  return rows.filter((e) => !isActReplaced(e));
}
