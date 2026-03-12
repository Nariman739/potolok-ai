import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    const copy = await prisma.estimate.create({
      data: {
        masterId: master.id,
        clientName: existing.clientName ? `${existing.clientName} (копия)` : null,
        clientPhone: existing.clientPhone,
        clientAddress: existing.clientAddress,
        roomsData: existing.roomsData ?? {},
        calculationData: existing.calculationData ?? {},
        totalArea: existing.totalArea,
        total: existing.total,
        discountPercent: existing.discountPercent,
        economyTotal: existing.economyTotal,
        standardTotal: existing.standardTotal,
        premiumTotal: existing.premiumTotal,
        recommendedVariant: existing.recommendedVariant,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ id: copy.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Duplicate estimate error:", error);
    return NextResponse.json({ error: "Ошибка копирования" }, { status: 500 });
  }
}
