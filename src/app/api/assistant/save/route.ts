import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KP_LIMITS } from "@/lib/constants";
import type { CalculationResult, RoomInput } from "@/lib/types";
import { computeArea } from "@/lib/room-geometry";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    // Auto-reset KP counter if new month
    const now = new Date();
    const masterDb = await prisma.master.findUnique({
      where: { id: master.id },
      select: { kpGeneratedThisMonth: true, kpMonthReset: true },
    });
    let kpCount = masterDb?.kpGeneratedThisMonth ?? master.kpGeneratedThisMonth;
    if (masterDb) {
      const resetDate = new Date(masterDb.kpMonthReset);
      if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        await prisma.master.update({
          where: { id: master.id },
          data: { kpGeneratedThisMonth: 0, kpMonthReset: now },
        });
        kpCount = 0;
      }
    }

    // Check KP limit
    const limit = KP_LIMITS[master.subscriptionTier];
    if (kpCount >= limit) {
      return NextResponse.json(
        { error: `Лимит КП исчерпан (${limit}/мес). Перейдите на PRO.` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sessionId, clientName, clientPhone, clientAddress } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId обязателен" },
        { status: 400 }
      );
    }

    const chatSession = await prisma.chatSession.findFirst({
      where: { id: sessionId, masterId: master.id },
    });

    if (!chatSession) {
      return NextResponse.json(
        { error: "Сессия не найдена" },
        { status: 404 }
      );
    }

    if (!chatSession.extractedRooms || !chatSession.calculationData) {
      return NextResponse.json(
        { error: "Нет данных расчёта в сессии" },
        { status: 400 }
      );
    }

    const rooms = chatSession.extractedRooms as unknown as RoomInput[];
    const calc = chatSession.calculationData as unknown as CalculationResult;

    const totalArea = rooms.reduce((s, r) => s + computeArea(r), 0);

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    const estimate = await prisma.estimate.create({
      data: {
        masterId: master.id,
        roomsData: chatSession.extractedRooms!,
        calculationData: chatSession.calculationData!,
        totalArea,
        total: calc.total,
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientAddress: clientAddress || null,
        validUntil,
      },
    });

    // Link session to estimate
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { estimateId: estimate.id, status: "COMPLETED" },
    });

    // Increment counter
    await prisma.master.update({
      where: { id: master.id },
      data: { kpGeneratedThisMonth: { increment: 1 } },
    });

    return NextResponse.json({
      estimateId: estimate.id,
      publicId: estimate.publicId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Save estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения КП" },
      { status: 500 }
    );
  }
}
