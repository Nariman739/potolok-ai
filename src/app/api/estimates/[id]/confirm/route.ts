import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    if (estimate.status !== "SENT" && estimate.status !== "VIEWED") {
      return NextResponse.json(
        { error: "Невозможно подтвердить в текущем статусе" },
        { status: 400 }
      );
    }

    await prisma.estimate.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm estimate error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
