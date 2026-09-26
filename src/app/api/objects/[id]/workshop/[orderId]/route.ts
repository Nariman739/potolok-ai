import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { syncClientStatusForObject } from "@/lib/clients";

/**
 * Отзыв записи «ушло в цех» (26.09.2026).
 *
 * Запись появлялась после окна «поделиться», и убрать её было нельзя: объект
 * навсегда вставал на «В цеху», даже если мастер передумал, промахнулся или
 * это был чужой тест на его аккаунте (Гульмира у Наримана — след QA 20.09).
 * Удаляем саму запись и событие клиента о ней; чертёж в цеху от этого
 * никуда не денется — это только про то, что показывает приложение.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id, orderId } = await params;

    const order = await prisma.workshopOrder.findFirst({
      where: { id: orderId, measurementObjectId: id, measurementObject: { ...inScope(scope), deletedAt: null } },
      select: { id: true, measurementObject: { select: { clientId: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: "Отправка не найдена" }, { status: 404 });
    }

    await prisma.workshopOrder.delete({ where: { id: order.id } });
    const clientId = order.measurementObject.clientId;
    if (clientId) {
      await prisma.clientEvent
        .deleteMany({
          where: { clientId, type: "WORKSHOP_SENT", metadata: { path: ["workshopOrderId"], equals: order.id } },
        })
        .catch(() => {});
    }
    syncClientStatusForObject(id).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete workshop order error:", error);
    return NextResponse.json({ error: "Не удалось отозвать отправку" }, { status: 500 });
  }
}
