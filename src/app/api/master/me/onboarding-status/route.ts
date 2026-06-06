import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/master/me/onboarding-status
// Один лёгкий endpoint для mobile: вместо 5 отдельных запросов даём
// все флаги для онбординг-чек-листа сразу. Идеально для главного экрана.

export async function GET() {
  try {
    const master = await requireAuth();

    const [full, brief, estimatesCount, clientsCount] = await Promise.all([
      prisma.master.findUnique({
        where: { id: master.id },
        select: {
          companyName: true,
          contractType: true,
          bin: true,
          iin: true,
          logoUrl: true,
        },
      }),
      prisma.masterBrief.findUnique({
        where: { masterId: master.id },
        select: { id: true },
      }),
      prisma.estimate.count({ where: { masterId: master.id, deletedAt: null } }),
      prisma.client.count({ where: { masterId: master.id, deletedAt: null } }),
    ]);

    return NextResponse.json({
      hasProfile: !!(full?.companyName && full?.contractType && (full?.bin || full?.iin)),
      hasLogo: !!full?.logoUrl,
      hasKpBrief: !!brief,
      hasFirstEstimate: estimatesCount > 0,
      hasClient: clientsCount > 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("onboarding-status error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
