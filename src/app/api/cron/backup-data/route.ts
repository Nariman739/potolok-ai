import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { put, list, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

// Vercel Cron (раз в сутки, 04:00 Asia/Almaty = 23:00 UTC предыдущего дня):
// дамп критичных бизнес-данных в Vercel Blob под /backups/.
//
// Защищает от инфраструктурных катастроф, против которых soft-delete
// бессилен: drop table, неудачная миграция, инцидент на стороне Neon.
// Бэкап ВКЛЮЧАЕТ soft-deleted записи — корзина мастера тоже восстановима.
//
// 4 модели + nested MeasurementRoom. После gzip типичный дамп = 100-500 КБ
// при текущей нагрузке (несколько десятков активных мастеров).
//
// Retention: 30 дней. Старые файлы вычищаются в конце этого же хука.
//
// Восстановление при инциденте — ручное (одноразовый скрипт). Backup лежит
// в Vercel Blob как gzipped JSON, читается любым `gunzip | jq`.
//
// ⚠️ SECURITY (фикс CRIT-1 после аудита 2026-06-06):
//   Vercel Blob API не поддерживает `access: "private"` — все blob'ы
//   технически отдаются по CDN URL. Защита через:
//     1. `addRandomSuffix: true` → URL содержит ~24-байтный random,
//        неугадываемый. По имени `backups/2026-06-06.json.gz` файл больше
//        НЕ открывается публично.
//     2. URL'ы НИКУДА не логгируем и не возвращаем в response.
//     3. Cron возвращает только counts/bytes, не key.
//   Дополнительно: владелец проекта (owner) может получить список через
//   `list({ prefix: "backups/" })` — это требует auth-токен Vercel,
//   доступен только из backend по BLOB_READ_WRITE_TOKEN.

export const maxDuration = 60;

const RETENTION_DAYS = 30;
const BACKUP_PREFIX = "backups/";

function todayKeyAlmaty(): string {
  // Берём дату по Asia/Almaty (UTC+5). Cron в 04:00 Almaty уже наступило
  // «сегодня» по локальному времени, и файл назван этой датой.
  const almaty = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return almaty.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // ── Dump 4 моделей ──────────────────────────────────────────────────
  // findMany без where — забираем ВСЕ строки, включая deletedAt != null.
  // Это правильно: при катастрофе нужно восстановить и корзину тоже.
  const [estimates, clients, measurements, priceVariants] = await Promise.all([
    prisma.estimate.findMany(),
    prisma.client.findMany(),
    prisma.measurementObject.findMany({
      include: { rooms: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.priceVariant.findMany(),
  ]);

  const dump = {
    generatedAt: new Date().toISOString(),
    schemaNotes: "Estimate, Client, MeasurementObject (+rooms), PriceVariant. Includes soft-deleted.",
    counts: {
      estimates: estimates.length,
      clients: clients.length,
      measurements: measurements.length,
      priceVariants: priceVariants.length,
    },
    data: { estimates, clients, measurements, priceVariants },
  };

  const json = JSON.stringify(dump);
  const gzipped = gzipSync(Buffer.from(json, "utf8"));

  // ⚠️ CRIT-1 fix: НЕ используем allowOverwrite + дата-имя, иначе URL
  // предсказуем. Вместо этого: addRandomSuffix → URL содержит random,
  // плюс retention ниже сначала удалит старые today-файлы.
  const datePart = todayKeyAlmaty();
  const key = `${BACKUP_PREFIX}${datePart}.json.gz`;

  // Сначала удаляем все ранее залитые сегодня дампы (если retry случился).
  // Раньше allowOverwrite справлялся, но теперь имена с random-суффиксом,
  // поэтому overwrite не работает — чистим вручную.
  try {
    const { blobs: todayBlobs } = await list({ prefix: `${BACKUP_PREFIX}${datePart}` });
    for (const b of todayBlobs) {
      await del(b.url);
    }
  } catch (err) {
    console.error("[backup-data] cleanup of today's prior dumps failed (continuing):", err);
  }

  await put(key, gzipped, {
    access: "public", // единственный поддерживаемый Vercel Blob mode (см. блок выше)
    contentType: "application/gzip",
    addRandomSuffix: true, // ← ключевая защита: URL непредсказуем
  });

  // ── Retention: удаляем дампы старше 30 дней ─────────────────────────
  // Имя теперь `backups/YYYY-MM-DD-RANDOMSUFFIX.json.gz` — regex обновлён.
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let purged = 0;
  try {
    const { blobs } = await list({ prefix: BACKUP_PREFIX });
    for (const blob of blobs) {
      const m = blob.pathname.match(/backups\/(\d{4}-\d{2}-\d{2})-?[A-Za-z0-9]*\.json\.gz$/);
      if (!m) continue;
      const date = new Date(m[1] + "T00:00:00Z");
      if (date.getTime() < cutoff) {
        await del(blob.url);
        purged++;
      }
    }
  } catch (err) {
    console.error("[backup-data] retention cleanup failed (continuing):", err);
  }

  // ⚠️ В response НЕ возвращаем `key` или URL — это снижает риск утечки.
  // Только метаданные. Owner может найти бэкап через `list()` из backend.
  return NextResponse.json({
    ok: true,
    bytes: gzipped.length,
    counts: dump.counts,
    purged,
    durationMs: Date.now() - startedAt,
  });
}
