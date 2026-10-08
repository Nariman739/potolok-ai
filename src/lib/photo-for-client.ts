// «Фото клиенту» из мобилки: серверный рендер 3D-сцены по снапшоту комнаты.
// Общие константы/хелперы для /api/visualizations/from-snapshot и /frames.

import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Маркер в Visualization.markup.origin — по нему считаем лимит (схему не меняем). */
export const PHOTO_FOR_CLIENT_ORIGIN = "photo-for-client";

/** Лимит рендеров «Фото клиенту» на мастера в календарный месяц (UTC). */
export function photoForClientMonthlyLimit(): number {
  const n = Number(process.env.PHOTO_FOR_CLIENT_MONTHLY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

/**
 * Сколько «Фото клиенту» мастер уже заказал в этом месяце. Неудачные (failed) не
 * считаются — мастер не платит лимитом за наши сбои. Считаем по созданным записям
 * (а не по готовым), чтобы 10 параллельных запросов не обошли лимит.
 */
export async function photoForClientUsedThisMonth(masterId: string, now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return prisma.visualization.count({
    where: {
      masterId,
      createdAt: { gte: monthStart },
      status: { not: "failed" },
      markup: { path: ["origin"], equals: PHOTO_FOR_CLIENT_ORIGIN },
    },
  });
}

/** Сверка секрета воркера (заголовок x-render-secret) за постоянное время. */
export function checkRenderSecret(provided: string | null): boolean {
  const expected = process.env.RENDER_WORKER_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
