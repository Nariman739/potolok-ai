// GET    /api/visualizations/[id]  — детали + все рендеры
// DELETE /api/visualizations/[id]  — удалить визуализацию (caskade удалит рендеры)

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json({
      id: viz.id,
      originalUrl: viz.originalUrl,
      markup: viz.markup,
      status: viz.status,
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
