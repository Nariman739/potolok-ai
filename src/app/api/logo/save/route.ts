import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOurBlobHost } from "@/lib/og-logo";

/**
 * Логотипом можно сделать только файл из нашего хранилища в папке этого
 * мастера (аудит 07.10.2026). Раньше принималась любая строка: чужой хост
 * ронял страницу портфолио (next/image вне remotePatterns), а PDF скачивал
 * произвольный URL со стороны сервера.
 * 13.11.2026: хост — именно НАШ Blob-стор, а не любой *.public.blob.vercel-storage.com
 * (под этим суффиксом сторы всех клиентов Vercel). Если id стора в окружении не найден,
 * остаётся прежняя проверка по суффиксу — сохранение логотипа из-за окружения не ломаем.
 */
function isOwnLogoUrl(url: string, masterId: string): boolean {
  try {
    const u = new URL(url);
    const ours = isOurBlobHost(u.hostname);
    if (ours === null) console.warn("[logo/save] Blob store id is unknown, host is checked by suffix only");
    return (
      u.protocol === "https:" &&
      (ours ?? u.hostname.endsWith(".public.blob.vercel-storage.com")) &&
      u.pathname.startsWith(`/logos/${masterId}/`)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { url } = body as { url?: string };

    if (typeof url !== "string") {
      return NextResponse.json({ error: "url обязателен" }, { status: 400 });
    }
    if (url && !isOwnLogoUrl(url, master.id)) {
      return NextResponse.json({ error: "Можно выбрать только свой логотип" }, { status: 400 });
    }

    // Снимаем флаг isCurrent со всех старых, ставим на новый (если есть)
    await prisma.logoGeneration.updateMany({
      where: { masterId: master.id, isCurrent: true },
      data: { isCurrent: false },
    });
    if (url) {
      await prisma.logoGeneration.updateMany({
        where: { masterId: master.id, blobUrl: url },
        data: { isCurrent: true },
      });
    }

    await prisma.master.update({
      where: { id: master.id },
      data: { logoUrl: url || null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Logo save error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
