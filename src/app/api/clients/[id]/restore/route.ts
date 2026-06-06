import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/clients/[id]/restore
// Восстанавливает soft-deleted клиента. Связанные Estimate/MeasurementObject/
// ObjectPhoto/ClientEvent не теряли FK при удалении → автоматически снова
// видны в карточке клиента.
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

    await prisma.client.update({
      where: { id },
      data: { deletedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Restore client error:", error);
    return NextResponse.json({ error: "Ошибка восстановления" }, { status: 500 });
  }
}
