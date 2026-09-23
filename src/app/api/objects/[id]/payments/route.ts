import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { withIdempotency } from "@/lib/idempotency";
import { addClientEvent, syncClientStatusForObject } from "@/lib/clients";

/**
 * Деньги от клиента по объекту (Этап 4).
 * POST { amount, kind?: "prepayment"|"final"|"other", note?, paidAt? }
 * DELETE ?paymentId=… — убрать ошибочную запись.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    return await withIdempotency(request, master.id, `POST /objects/${id}/payments`, async () => {
      const body = (await request.json().catch(() => ({}))) as { amount?: unknown; kind?: unknown; note?: unknown; paidAt?: unknown };
      const amount = typeof body.amount === "number" ? Math.round(body.amount) : NaN;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
        return NextResponse.json({ error: "Сумма некорректна" }, { status: 400 });
      }
      const kind = body.kind === "prepayment" || body.kind === "final" ? body.kind : "other";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
      const paidAt = typeof body.paidAt === "string" && !Number.isNaN(new Date(body.paidAt).getTime()) ? new Date(body.paidAt) : new Date();

      const obj = await prisma.measurementObject.findFirst({
        where: { id, ...inScope(scope), deletedAt: null },
        select: { id: true, address: true, clientId: true, masterId: true },
      });
      if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });

      const payment = await prisma.payment.create({
        data: { masterId: obj.masterId, measurementObjectId: obj.id, amount, kind, note, paidAt },
      });
      if (obj.clientId) {
        addClientEvent({
          clientId: obj.clientId,
          type: "NOTE",
          content: `Получено ${amount.toLocaleString("ru-KZ")} ₸${kind === "prepayment" ? " (предоплата)" : kind === "final" ? " (остаток)" : ""}${obj.address ? ` · ${obj.address}` : ""}`,
          metadata: { measurementObjectId: obj.id, paymentId: payment.id, amount, kind },
        }).catch(() => {});
      }
      // Деньги получены — клиент в воронке точно не «Новый».
      syncClientStatusForObject(obj.id).catch(() => {});
      return NextResponse.json(payment);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create payment error:", error);
    return NextResponse.json({ error: "Не удалось записать оплату" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const paymentId = new URL(request.url).searchParams.get("paymentId");
    if (!paymentId) return NextResponse.json({ error: "paymentId обязателен" }, { status: 400 });
    const pay = await prisma.payment.findFirst({
      where: { id: paymentId, measurementObjectId: id, measurementObject: { ...inScope(scope), deletedAt: null } },
      select: { id: true },
    });
    if (!pay) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    await prisma.payment.delete({ where: { id: pay.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete payment error:", error);
    return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
  }
}
