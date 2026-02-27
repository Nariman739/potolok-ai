import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { name, unit, price } = body as {
      name?: string;
      unit?: string;
      price?: number;
    };

    const item = await prisma.customItem.updateMany({
      where: { id, masterId: master.id },
      data: {
        ...(name !== undefined && { name }),
        ...(unit !== undefined && { unit }),
        ...(price !== undefined && { price }),
      },
    });

    if (item.count === 0) {
      return NextResponse.json(
        { error: "Позиция не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update custom item error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const item = await prisma.customItem.deleteMany({
      where: { id, masterId: master.id },
    });

    if (item.count === 0) {
      return NextResponse.json(
        { error: "Позиция не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete custom item error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления" },
      { status: 500 }
    );
  }
}
