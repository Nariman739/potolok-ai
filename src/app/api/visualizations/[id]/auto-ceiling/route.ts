// POST /api/visualizations/[id]/auto-ceiling
// Использует Claude vision чтобы автоматически найти границу потолка на фото
// и вернуть polygon координат в процентах. Стоимость ~$0.005 за вызов.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectCeilingPolygon } from "@/lib/ai-visualization";

export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const viz = await prisma.visualization.findFirst({
      where: { id, masterId: master.id },
      select: { originalUrl: true },
    });
    if (!viz) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const photoRes = await fetch(viz.originalUrl);
    if (!photoRes.ok) {
      return NextResponse.json({ error: "Не удалось загрузить фото" }, { status: 500 });
    }
    const photoMime = photoRes.headers.get("content-type") || "image/jpeg";
    const photoBase64 = Buffer.from(await photoRes.arrayBuffer()).toString("base64");

    const polygon = await detectCeilingPolygon(photoBase64, photoMime);

    return NextResponse.json({ polygon });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[auto-ceiling] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка автоопределения" },
      { status: 500 },
    );
  }
}
