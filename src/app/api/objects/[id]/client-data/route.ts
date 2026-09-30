import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { pickPrimaryEstimate } from "@/lib/object-stage";

/**
 * Сохранить данные клиента для договора (30.09.2026): ФИО, точный адрес,
 * ИИН, телефон — в главное КП объекта (из него печатаются договор и акт).
 * Подписанный договор не трогаем: его текст заморожен. Пустое поле не
 * затирает уже известное.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const fullName = str(body.fullName, 150);
    const address = str(body.address, 300);
    const phone = str(body.phone, 30);
    const iinRaw = str(body.iin, 20)?.replace(/\D/g, "");
    if (iinRaw && iinRaw.length !== 12) {
      return NextResponse.json({ error: "ИИН — 12 цифр" }, { status: 400 });
    }

    const obj = await prisma.measurementObject.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: {
        id: true, address: true, clientId: true,
        client: { select: { id: true, name: true, phone: true } },
        estimates: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, total: true, createdAt: true, contractSignedAt: true } },
      },
    });
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const primary = pickPrimaryEstimate(obj.estimates);
    if (!primary) return NextResponse.json({ error: "Сначала сделайте КП" }, { status: 400 });
    if (primary.contractSignedAt) {
      return NextResponse.json({ error: "Договор уже подписан — данные в нём не меняются" }, { status: 409 });
    }

    await prisma.estimate.update({
      where: { id: primary.id },
      data: {
        ...(fullName && { clientName: fullName }),
        ...(address && { clientAddress: address }),
        ...(phone && { clientPhone: phone }),
        ...(iinRaw && { clientIin: iinRaw }),
      },
    });
    // Объект без адреса получает точный адрес; имя клиента уточняем, если
    // было коротким («Гульмира» → «Ахметова Гульмира Сериковна»).
    if (address && !obj.address.trim()) {
      await prisma.measurementObject.update({ where: { id }, data: { address } });
    }
    if (obj.client) {
      const cur = (obj.client.name ?? "").trim().toLowerCase();
      const nameUpd = fullName && (!cur || fullName.toLowerCase().includes(cur)) ? { name: fullName } : {};
      const phoneUpd = phone && !obj.client.phone ? { phone } : {};
      if (Object.keys(nameUpd).length || Object.keys(phoneUpd).length) {
        await prisma.client.update({ where: { id: obj.client.id }, data: { ...nameUpd, ...phoneUpd } }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, estimateId: primary.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Client data save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить данные" }, { status: 500 });
  }
}
