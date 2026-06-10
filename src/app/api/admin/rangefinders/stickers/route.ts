import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RangefinderStatus } from "@/generated/prisma/client";
import { renderStickersPdf } from "@/lib/rangefinder-stickers-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES: RangefinderStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "ACTIVATED",
  "SOLD",
];

async function requireOwner() {
  const me = await requireAuth();
  const row = await prisma.master.findUnique({
    where: { id: me.id },
    select: { isOwner: true },
  });
  if (!row?.isOwner) {
    throw new Error("Forbidden");
  }
}

export async function GET(request: Request) {
  try {
    await requireOwner();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const idsParam = url.searchParams.get("ids");

    const where: { status?: RangefinderStatus; id?: { in: string[] } } = {};
    if (statusParam && ALLOWED_STATUSES.includes(statusParam as RangefinderStatus)) {
      where.status = statusParam as RangefinderStatus;
    }
    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      if (ids.length) where.id = { in: ids };
    }
    if (!statusParam && !idsParam) {
      where.status = "AVAILABLE";
    }

    const rangefinders = await prisma.rangefinder.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { name: true, qrCode: true },
    });

    const eligible = rangefinders.filter(
      (r): r is { name: string; qrCode: string } => Boolean(r.qrCode),
    );

    if (!eligible.length) {
      return NextResponse.json(
        { error: "Нет рулеток с QR-кодом для печати" },
        { status: 404 },
      );
    }

    const pdf = await renderStickersPdf(
      eligible.map((r) => ({ name: r.name, qrCode: r.qrCode })),
    );

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rangefinder-stickers-${Date.now()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    console.error("Stickers PDF error:", error);
    return NextResponse.json({ error: "Ошибка генерации PDF" }, { status: 500 });
  }
}
