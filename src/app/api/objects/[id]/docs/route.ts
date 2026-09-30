import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";

/**
 * «Без договора» для объекта (30.09.2026). Не все мастера работают по
 * договору: выбрал «без договора» — подсказки про договор и акт по этому
 * объекту больше не появляются. Вернуть можно той же кнопкой.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { declined?: unknown };
    const obj = await prisma.measurementObject.findFirst({ where: { id, ...inScope(scope), deletedAt: null }, select: { id: true } });
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const declined = body.declined === true;
    await prisma.measurementObject.update({ where: { id }, data: { docsDeclinedAt: declined ? new Date() : null } });
    return NextResponse.json({ declined });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Object docs patch error:", error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
