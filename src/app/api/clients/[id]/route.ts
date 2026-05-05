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

    const { name, phone, address, source, notes, status } = body;

    let normalizedSource: ClientSource | null | undefined = undefined;
    if (source === null) normalizedSource = null;
    else if (source && (ALLOWED_SOURCES as readonly string[]).includes(source)) {
      normalizedSource = source as ClientSource;
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name || existing.name }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(address !== undefined && { address: address || null }),
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

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete client error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления клиента" },
      { status: 500 },
    );
  }
}
