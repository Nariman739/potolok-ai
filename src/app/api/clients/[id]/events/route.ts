import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EventType } from "@/generated/prisma/client";

const ALLOWED_TYPES = [
  "NOTE",
  "CALL",
  "MEETING",
  "WHATSAPP",
  "MEASUREMENT",
  "INSTALL",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { type, content } = body;

    if (!type || !(ALLOWED_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json(
        { error: "Недопустимый тип события" },
        { status: 400 },
      );
    }

    const client = await prisma.client.findFirst({
      where: { id, masterId: master.id },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 },
      );
    }

    const event = await prisma.clientEvent.create({
      data: {
        clientId: id,
        type: type as EventType,
        content: content?.trim() || null,
      },
    });

    await prisma.client.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Add client event error:", error);
    return NextResponse.json(
      { error: "Ошибка добавления события" },
      { status: 500 },
    );
  }
}
