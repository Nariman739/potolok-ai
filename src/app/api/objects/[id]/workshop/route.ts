import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope, type Scope } from "@/lib/company";
import { addClientEvent } from "@/lib/clients";
import { withIdempotency } from "@/lib/idempotency";

/**
 * Запись «ушло в цех». Мобилка зовёт ПОСЛЕ того, как мастер закрыл окно
 * «поделиться» и подтвердил «Ушло?» — сам факт открытия share sheet ещё не
 * значит, что PDF отправлен (мог передумать, мог отмениться WhatsApp).
 *
 * Тело: { roomIds: string[], note?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    // Повтор с тем же X-Op-Id (очередь мобилки после обрыва связи) → та же запись.
    return await withIdempotency(request, master.id, `POST /objects/${id}/workshop`, () =>
      createWorkshopOrder(request, master.id, id, scope),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create workshop order error:", error);
    return NextResponse.json({ error: "Не удалось записать отправку в цех" }, { status: 500 });
  }
}

async function createWorkshopOrder(request: Request, masterId: string, id: string, scope: Scope) {
  const master = { id: masterId };
  try {
    const body = (await request.json().catch(() => ({}))) as { roomIds?: unknown; note?: unknown };

    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: {
        id: true,
        address: true,
        clientId: true,
        rooms: { select: { id: true, area: true } },
      },
    });
    if (!obj) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    const requested = Array.isArray(body.roomIds)
      ? body.roomIds.filter((x): x is string => typeof x === "string")
      : [];
    // Чужие/несуществующие id отбрасываем; пустой список = все комнаты
    // (старые версии приложения могут не прислать roomIds вовсе).
    const known = new Set(obj.rooms.map((r) => r.id));
    const roomIds = requested.length > 0
      ? requested.filter((rid) => known.has(rid))
      : obj.rooms.map((r) => r.id);
    if (roomIds.length === 0) {
      return NextResponse.json({ error: "В объекте нет комнат" }, { status: 400 });
    }
    const picked = new Set(roomIds);
    const area = Math.round(
      obj.rooms.filter((r) => picked.has(r.id)).reduce((s, r) => s + r.area, 0) * 100,
    ) / 100;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

    const order = await prisma.workshopOrder.create({
      data: {
        masterId: master.id,
        measurementObjectId: obj.id,
        roomIds,
        roomsCount: roomIds.length,
        area,
        note,
      },
    });

    // Раз ушло в цех — объект точно в работе. Ручной этап не выше «в цеху»
    // (например «согласовали» или сам «в цеху», поставленный рукой) теперь
    // только мешает: сбрасываем, чтобы авто-расчёт показал «В цеху» без
    // пометки «вручную». Ручные «смонтировали/закрыл» не трогаем — мастер
    // мог дослать одну комнату уже после монтажа.
    await prisma.measurementObject.updateMany({
      where: { id: obj.id, manualStage: { in: ["measured", "calculated", "sent", "viewed", "confirmed", "workshop"] } },
      data: { manualStage: null },
    });

    if (obj.clientId) {
      addClientEvent({
        clientId: obj.clientId,
        type: "WORKSHOP_SENT",
        content: `В цех: ${roomIds.length} комн. · ${area} м²${obj.address ? ` · ${obj.address}` : ""}`,
        metadata: { measurementObjectId: obj.id, workshopOrderId: order.id, roomIds },
      }).catch(() => {});
    }

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create workshop order error:", error);
    return NextResponse.json({ error: "Не удалось записать отправку в цех" }, { status: 500 });
  }
}
