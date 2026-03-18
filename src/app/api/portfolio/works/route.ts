import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — список работ мастера
export async function GET() {
  try {
    const master = await requireAuth();

    const works = await prisma.portfolioWork.findMany({
      where: { masterId: master.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(works);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — создать новую работу
export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const body = await request.json();
    const { title, description, ceilingType, area, photos, videoUrl } = body;

    const work = await prisma.portfolioWork.create({
      data: {
        masterId: master.id,
        title: title || null,
        description: description || null,
        ceilingType: ceilingType || null,
        area: area ? parseFloat(area) : null,
        photos: photos || [],
        videoUrl: videoUrl || null,
      },
    });

    return NextResponse.json(work);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Portfolio create error:", error);
    return NextResponse.json({ error: "Ошибка создания" }, { status: 500 });
  }
}
