import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json(estimate);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка получения расчёта" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    const { clientName, clientPhone, clientAddress, status, validUntil } = body;

    // Validate status transitions that master can do
    const allowedMasterStatuses = ["DRAFT", "SENT", "REVISED", "REJECTED"];
    if (status !== undefined && !allowedMasterStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Недопустимый статус" },
        { status: 400 }
      );
    }

    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        ...(clientName !== undefined && { clientName }),
        ...(clientPhone !== undefined && { clientPhone }),
        ...(clientAddress !== undefined && { clientAddress }),
        ...(status !== undefined && { status }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления расчёта" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    await prisma.estimate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления расчёта" },
      { status: 500 }
    );
  }
}
