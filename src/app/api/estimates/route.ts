import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KP_LIMITS } from "@/lib/constants";

export async function GET() {
  try {
    const master = await requireAuth();

    const estimates = await prisma.estimate.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicId: true,
        clientName: true,
        clientPhone: true,
        totalArea: true,
        economyTotal: true,
        standardTotal: true,
        premiumTotal: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(estimates);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get estimates error:", error);
    return NextResponse.json(
      { error: "Ошибка получения расчётов" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    // Check KP limit
    const limit = KP_LIMITS[master.subscriptionTier];
    if (master.kpGeneratedThisMonth >= limit) {
      return NextResponse.json(
        {
          error: `Лимит КП исчерпан (${limit}/мес). Перейдите на PRO для безлимита.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      roomsData,
      calculationData,
      totalArea,
      economyTotal,
      standardTotal,
      premiumTotal,
      clientName,
      clientPhone,
      clientAddress,
    } = body;

    if (!roomsData || !calculationData) {
      return NextResponse.json(
        { error: "Данные расчёта обязательны" },
        { status: 400 }
      );
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    const estimate = await prisma.estimate.create({
      data: {
        masterId: master.id,
        roomsData,
        calculationData,
        totalArea: totalArea || 0,
        economyTotal: economyTotal || 0,
        standardTotal: standardTotal || 0,
        premiumTotal: premiumTotal || 0,
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientAddress: clientAddress || null,
        validUntil,
      },
    });

    // Increment KP counter
    await prisma.master.update({
      where: { id: master.id },
      data: { kpGeneratedThisMonth: { increment: 1 } },
    });

    return NextResponse.json(estimate);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения расчёта" },
      { status: 500 }
    );
  }
}
