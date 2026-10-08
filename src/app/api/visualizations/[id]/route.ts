// GET    /api/visualizations/[id]  — детали + все рендеры
// DELETE /api/visualizations/[id]  — удалить визуализацию (caskade удалит рендеры)

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PHOTO_FOR_CLIENT_ORIGIN } from "@/lib/photo-for-client";
import { markVisualizationFailed } from "@/lib/scene-render";

const STALE_MS = 5 * 60 * 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const viz = await prisma.visualization.findFirst({
      where: { id, masterId: master.id },
      include: {
        renders: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!viz) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const markup = (viz.markup && typeof viz.markup === "object" ? viz.markup : {}) as Record<string, unknown>;
    let status = viz.status;
    let error = typeof markup.error === "string" ? markup.error : null;

    // «Фото клиенту»: если рендер завис (воркер/функция умерли, не отписавшись) —
    // через 5 минут честно отдаём failed, чтобы мобилка не крутила спиннер вечно.
    if (
      markup.origin === PHOTO_FOR_CLIENT_ORIGIN &&
      (status === "pending" || status === "rendering") &&
      Date.now() - viz.updatedAt.getTime() > STALE_MS
    ) {
      error = "Рендер не завершился вовремя. Попробуйте ещё раз.";
      status = "failed";
      await markVisualizationFailed(viz.id, error);
    }

    // Тяжёлое (снапшот комнаты, промпты) мобилке не нужно — режем.
    const { snapshot: _snapshot, ...markupLite } = markup;
    void _snapshot;

    return NextResponse.json({
      id: viz.id,
      originalUrl: viz.originalUrl,
      markup: markupLite,
      status,
      // null, пока нет готовой картинки; иначе URL последнего рендера (= renders[0].url)
      resultUrl: status === "ready" ? viz.renders[0]?.url ?? null : null,
      // текст ошибки при status=failed (иначе null)
      error: status === "failed" ? error ?? "Не удалось сгенерировать" : null,
      publicHash: viz.publicHash,
      createdAt: viz.createdAt,
      updatedAt: viz.updatedAt,
      renders: viz.renders,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualization GET] error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.visualization.deleteMany({
      where: { id, masterId: master.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[visualization DELETE] error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
