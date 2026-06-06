import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/clients/[id]/permanent-delete
// Жёсткое удаление soft-deleted клиента. Доступно только для записей в корзине.
//
// Cascade: ClientEvent уйдёт через onDelete:Cascade. Estimate/MeasurementObject/
// ObjectPhoto имеют onDelete:SetNull — у них просто обнулится clientId
// (раньше старый hard-DELETE делал это явной транзакцией; теперь полагаемся
// на Postgres FK behaviour).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.client.findFirst({
      where: { id, masterId: master.id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Клиент не найден в корзине" }, { status: 404 });
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Permanent-delete client error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
