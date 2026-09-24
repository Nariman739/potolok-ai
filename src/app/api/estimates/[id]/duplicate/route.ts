import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: { partner: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    const copy = await prisma.estimate.create({
      data: {
        masterId: master.id,
        companyId: scope.companyId,
        clientName: existing.clientName ? `${existing.clientName} (копия)` : null,
        clientPhone: existing.clientPhone,
        clientAddress: existing.clientAddress,
        // Копия остаётся вариантом того же объекта и того же клиента (21.09.2026):
        // раньше она отрывалась и жила в ленте отдельной строкой без оплат и цеха.
        clientId: existing.clientId,
        measurementObjectId: existing.measurementObjectId,
        roomsData: existing.roomsData ?? {},
        calculationData: existing.calculationData ?? {},
        totalArea: existing.totalArea,
        total: existing.total,
        discountPercent: existing.discountPercent,
        discountAmount: existing.discountAmount,
        economyTotal: existing.economyTotal,
        standardTotal: existing.standardTotal,
        premiumTotal: existing.premiumTotal,
        recommendedVariant: existing.recommendedVariant,
        room3dPreviewUrl: existing.room3dPreviewUrl,
        status: "DRAFT",
      },
    });

    // Посредник копируется вместе с КП: цены в calculationData уже с наценкой,
    // без строки partner копия «забыла бы», кому и сколько должна.
    if (existing.partner) {
      await prisma.estimatePartner.create({
        data: {
          estimateId: copy.id,
          amount: existing.partner.amount,
          percent: existing.partner.percent,
          coef: existing.partner.coef,
        },
      });
    }

    return NextResponse.json({ id: copy.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Duplicate estimate error:", error);
    return NextResponse.json({ error: "Ошибка копирования" }, { status: 500 });
  }
}
