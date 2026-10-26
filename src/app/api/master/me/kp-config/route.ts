import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { KpConfig } from "@/lib/kp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/master/me/kp-config
// Body: { kpConfig?: KpConfig, tagline?: string|null,
//         coverPhotoUrl?: string|null, brandColor?: string|null }
//
// Сохраняет настройки конструктора КП в Master.
export async function POST(req: NextRequest) {
  try {
    const master = await requireAuth();

    const body = (await req.json()) as {
      kpConfig?: KpConfig;
      tagline?: string | null;
      coverPhotoUrl?: string | null;
      brandColor?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.kpConfig !== undefined) data.kpConfig = body.kpConfig as unknown as object;
    if (body.tagline !== undefined) data.tagline = body.tagline || null;
    if (body.coverPhotoUrl !== undefined) data.coverPhotoUrl = body.coverPhotoUrl || null;
    // Только #RRGGBB: произвольная строка ломала расчёт оттенков в плане КП (ревью 26.10.2026)
    if (body.brandColor !== undefined && body.brandColor) {
      if (!/^#[0-9a-f]{6}$/i.test(body.brandColor)) {
        return NextResponse.json({ error: "Цвет бренда должен быть в формате #RRGGBB" }, { status: 400 });
      }
      data.brandColor = body.brandColor;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true });
    }

    await prisma.master.update({
      where: { id: master.id },
      data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as Error;
    if (e.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[kp-config save] error:", e);
    return NextResponse.json(
      { error: e.message || "Ошибка сохранения" },
      { status: 500 }
    );
  }
}
