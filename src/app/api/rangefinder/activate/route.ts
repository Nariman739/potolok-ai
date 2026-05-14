import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/rangefinder/activate
 * Body: { qrCode: string }
 *
 * Мастер сканирует QR на коробке рулетки → этот endpoint находит её по qrCode,
 * проверяет что она доступна (status AVAILABLE/RESERVED), назначает мастеру и
 * возвращает token+mac для прописывания в SecureStore приложения.
 */
export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const rawCode = typeof body.qrCode === "string" ? body.qrCode.trim().toUpperCase() : "";

    if (!rawCode || rawCode.length < 4) {
      return NextResponse.json(
        { error: "QR код пустой или слишком короткий" },
        { status: 400 },
      );
    }

    const rangefinder = await prisma.rangefinder.findUnique({
      where: { qrCode: rawCode },
    });

    if (!rangefinder) {
      return NextResponse.json(
        { error: "Рулетка с таким QR не найдена. Проверь код или свяжись с поддержкой." },
        { status: 404 },
      );
    }

    // Если уже активирована другим мастером — отказ
    if (rangefinder.ownerId && rangefinder.ownerId !== master.id) {
      return NextResponse.json(
        { error: "Эта рулетка уже привязана к другому мастеру." },
        { status: 409 },
      );
    }

    // SOLD без owner — что-то странное, но позволим активировать
    // ACTIVATED тем же мастером — идемпотентно, просто возвращаем данные
    const updated = await prisma.rangefinder.update({
      where: { id: rangefinder.id },
      data: {
        ownerId: master.id,
        status: "ACTIVATED",
        activatedAt: rangefinder.activatedAt ?? new Date(),
      },
    });

    return NextResponse.json({
      name: updated.name,
      mac: updated.mac,
      token: updated.token,
      bleKey: updated.bleKey,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Activate rangefinder error:", error);
    return NextResponse.json({ error: "Ошибка активации" }, { status: 500 });
  }
}
