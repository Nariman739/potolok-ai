import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateClient } from "@/lib/clients";
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

export async function GET(request: Request) {
  try {
    const master = await requireAuth();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim();

    const where: {
      masterId: string;
      status?: DealStatus;
      OR?: Array<Record<string, unknown>>;
    } = { masterId: master.id };

    if (status && (ALLOWED_STATUSES as readonly string[]).includes(status)) {
      where.status = status as DealStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        source: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { estimates: true, events: true } },
        estimates: {
          select: { total: true, status: true },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { type: true, content: true, createdAt: true },
        },
      },
    });

    const items = clients.map((c) => {
      const totalSum = c.estimates.reduce((acc, e) => acc + (e.total || 0), 0);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        source: c.source,
        status: c.status,
        notes: c.notes,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        estimatesCount: c._count.estimates,
        eventsCount: c._count.events,
        totalSum,
        lastEvent: c.events[0] ?? null,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get clients error:", error);
    return NextResponse.json(
      { error: "Ошибка получения клиентов" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();
    const { name, phone, address, source, notes } = body;

    if (!name && !phone) {
      return NextResponse.json(
        { error: "Нужно имя или телефон" },
        { status: 400 },
      );
    }

    let normalizedSource: ClientSource | null = null;
    if (source && (ALLOWED_SOURCES as readonly string[]).includes(source)) {
      normalizedSource = source as ClientSource;
    }

    const client = await getOrCreateClient({
      masterId: master.id,
      name: name || null,
      phone: phone || null,
      address: address || null,
      source: normalizedSource,
    });

    if (!client) {
      return NextResponse.json(
        { error: "Не удалось создать клиента" },
        { status: 400 },
      );
    }

    if (notes) {
      await prisma.client.update({
        where: { id: client.id },
        data: { notes },
      });
    }

    return NextResponse.json(client);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "Ошибка создания клиента" },
      { status: 500 },
    );
  }
}
