import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope, type Scope } from "@/lib/company";

/**
 * Старые черновики без имени (27.09.2026).
 *
 * У мастера копятся КП, которые он открыл посчитать «на глаз» и бросил: без
 * клиента, без адреса, без объекта, статус «черновик». На проде таких 230 у
 * 11 мастеров, у Наримана 69 — они забивают ленту объектов и «Деньги», а
 * удалять по одному никто не будет. GET — сколько их, DELETE — все в корзину
 * (мягкое удаление, вернуть можно на сайте в /dashboard/trash).
 *
 * Черновик считается старым через неделю: свежий «на глаз» мастер ещё может
 * доделать. Всё, у чего есть клиент, адрес, договор или объект — не трогаем.
 */
export const STALE_DAYS = 7;

function staleDraftsWhere(scope: Scope) {
  return {
    AND: [
      inScope(scope),
      { deletedAt: null, status: "DRAFT" as const, contractPublicId: null, clientId: null },
      { OR: [{ measurementObjectId: null }, { measurementObject: { deletedAt: { not: null } } }] },
      { OR: [{ clientName: null }, { clientName: "" }] },
      { OR: [{ clientAddress: null }, { clientAddress: "" }] },
      { createdAt: { lt: new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000) } },
    ],
  };
}

export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const where = staleDraftsWhere(scope);
    const [count, oldest] = await Promise.all([
      prisma.estimate.count({ where }),
      prisma.estimate.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    return NextResponse.json({ count, days: STALE_DAYS, oldestAt: oldest?.createdAt ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Stale drafts count error:", error);
    return NextResponse.json({ error: "Не удалось посчитать черновики" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const res = await prisma.estimate.updateMany({
      where: staleDraftsWhere(scope),
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ removed: res.count });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Stale drafts cleanup error:", error);
    return NextResponse.json({ error: "Не удалось убрать черновики" }, { status: 500 });
  }
}
