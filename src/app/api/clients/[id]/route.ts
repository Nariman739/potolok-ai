import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeClientStatus } from "@/lib/clients";
import type { ClientSource, DealStatus } from "@/generated/prisma/client";

const ALLOWED_STATUSES = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATING",
  "WON",
  "LOST",
] as const;

const ALLOWED_SOURCES = [
  "INSTAGRAM",
  "WHATSAPP",
  "REFERRAL",
  "SITE",
  "KASPI",
  "OTHER",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: { id, masterId: master.id },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        estimates: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            publicId: true,
            total: true,
            totalArea: true,
            status: true,
            createdAt: true,
          },
        },
        measurements: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            address: true,
            totalArea: true,
            latitude: true,
            longitude: true,
            createdAt: true,
            rooms: { select: { id: true } },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 },
      );
    }

    return NextResponse.json(client);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get client error:", error);
    return NextResponse.json(
      { error: "Ошибка получения клиента" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.client.findFirst({
      where: { id, masterId: master.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 },
      );
    }

    const { name, phone, address, latitude, longitude, source, notes, status } = body;

    let normalizedSource: ClientSource | null | undefined = undefined;
    if (source === null) normalizedSource = null;
    else if (source && (ALLOWED_SOURCES as readonly string[]).includes(source)) {
      normalizedSource = source as ClientSource;
    }

    const parseCoord = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const lat = parseCoord(latitude);
    const lng = parseCoord(longitude);

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name || existing.name }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(address !== undefined && { address: address || null }),
        ...(lat !== undefined && { latitude: lat }),
        ...(lng !== undefined && { longitude: lng }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(normalizedSource !== undefined && { source: normalizedSource }),
      },
    });

    if (
      status !== undefined &&
      (ALLOWED_STATUSES as readonly string[]).includes(status) &&
      status !== existing.status
    ) {
      await changeClientStatus(id, status as DealStatus);
    }

    const fresh = await prisma.client.findUnique({ where: { id } });
    return NextResponse.json(fresh ?? updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update client error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления клиента" },
      { status: 500 },
    );
  }
}

// PATCH = частичное обновление. Mobile использует его для смены статуса и
// быстрого редактирования заметки. По смыслу совпадает с PUT — переиспользуем.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return PUT(request, ctx);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.client.findFirst({
      where: { id, masterId: master.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 },
      );
    }

    // Явное «обнуление» связанных таблиц до удаления клиента — раньше
    // полагались только на onDelete:SetNull в schema, но в проде иногда
    // ловили P2003 (foreign key constraint) при удалении. Транзакция
    // гарантирует целостность: либо всё прошло, либо ничего не изменилось.
    // ClientEvent удаляется (cascade в schema), photo/measurement/estimate —
    // обнуляются (остаются у мастера в общем списке без привязки к клиенту).
    await prisma.$transaction([
      prisma.estimate.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.measurementObject.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.objectPhoto.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.clientEvent.deleteMany({ where: { clientId: id } }),
      prisma.client.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const msg = error instanceof Error ? error.message : "Ошибка удаления клиента";
    console.error("Delete client error:", error);
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    );
  }
}
