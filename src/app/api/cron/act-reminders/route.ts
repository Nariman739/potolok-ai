import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToMaster } from "@/lib/push";

/**
 * Одно напоминание про неподписанный акт (30.09.2026).
 *
 * Раз в сутки, 10:00 по Алматы: акт отправлен клиенту больше суток назад,
 * не подписан, замечаний от клиента нет, напоминания ещё не было — мастеру
 * пуш «Акт по … не подписан. Отправить ещё раз?». Одно на акт: дальше тихая
 * метка «без подписи» в карточке, приложение не пристаёт.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const due = await prisma.estimate.findMany({
    where: {
      deletedAt: null,
      actPublicId: { not: null },
      actSignedAt: null,
      actClientRemarks: null,
      actRemindedAt: null,
      actSentAt: { lt: new Date(now - 20 * 60 * 60 * 1000), gt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, masterId: true, clientName: true, clientAddress: true, measurementObjectId: true },
    take: 500,
  });
  let sent = 0;
  for (const e of due) {
    const where = e.clientAddress || e.clientName || "объекту";
    await sendPushToMaster(e.masterId, {
      title: `Акт по ${where} не подписан`,
      body: "Клиент ещё не принял работы. Отправить ссылку ещё раз?",
      data: { screen: e.measurementObjectId ? `/object/${e.measurementObjectId}` : `/estimate/${e.id}` },
    });
    await prisma.estimate.update({ where: { id: e.id }, data: { actRemindedAt: new Date() } });
    sent++;
  }
  return NextResponse.json({ checked: due.length, sent });
}
