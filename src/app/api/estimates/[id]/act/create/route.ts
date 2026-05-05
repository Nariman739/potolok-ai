import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addClientEvent } from "@/lib/clients";
import crypto from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { completionDate } = body as { completionDate?: string };

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
      select: {
        id: true,
        clientId: true,
        actPublicId: true,
        actCreatedAt: true,
        actSignedAt: true,
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    }

    const compDate = completionDate ? new Date(completionDate) : new Date();

    // Идемпотентность — обновляем дату если уже есть
    if (estimate.actPublicId) {
      if (completionDate) {
        await prisma.estimate.update({
          where: { id },
          data: { actCompletionDate: compDate },
        });
      }
      return NextResponse.json({
        actPublicId: estimate.actPublicId,
        actCreatedAt: estimate.actCreatedAt,
        actSignedAt: estimate.actSignedAt,
      });
    }

    const actPublicId = crypto.randomUUID();
    await prisma.estimate.update({
      where: { id },
      data: {
        actPublicId,
        actCreatedAt: new Date(),
        actCompletionDate: compDate,
      },
    });

    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "ACT_CREATED",
        content: "Акт выполненных работ создан и готов к отправке",
        metadata: { estimateId: id, actPublicId },
      }).catch(() => {});
    }

    return NextResponse.json({
      actPublicId,
      actCreatedAt: new Date().toISOString(),
      actSignedAt: null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Act create error:", error);
    return NextResponse.json(
      { error: "Ошибка создания акта" },
      { status: 500 },
    );
  }
}
