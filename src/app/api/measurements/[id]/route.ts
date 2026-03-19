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

    const obj = await prisma.measurementObject.findFirst({
      where: { id, masterId: master.id },
      include: { rooms: { orderBy: { sortOrder: "asc" } } },
    });

    if (!obj) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    return NextResponse.json(obj);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get measurement error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { address, status, totalArea } = body as {
      address?: string;
      status?: string;
      totalArea?: number;
    };

    const result = await prisma.measurementObject.updateMany({
      where: { id, masterId: master.id },
      data: {
        ...(address !== undefined && { address }),
        ...(status !== undefined && { status }),
        ...(totalArea !== undefined && { totalArea }),
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update measurement error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.measurementObject.deleteMany({
      where: { id, masterId: master.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete measurement error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
