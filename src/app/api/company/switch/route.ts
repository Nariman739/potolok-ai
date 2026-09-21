import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureOwnCompany, getScope } from "@/lib/company";

/**
 * Переход между компаниями по СОГЛАСИЮ мастера (21.09.2026).
 * POST { companyId } — принять приглашение: работать в компании, куда меня добавили.
 * POST { own: true } — вернуться в свою компанию.
 *
 * Раньше мастера с пустым аккаунтом владелец затягивал к себе одним добавлением
 * номера — без вопроса. Теперь добавление = приглашение, а переключает только сам
 * приглашённый.
 */
export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { companyId?: unknown; own?: unknown };

    if (body.own === true) {
      const own = await ensureOwnCompany(master.id);
      await prisma.master.update({ where: { id: master.id }, data: { activeCompanyId: own.id } });
      return NextResponse.json(await getScope({ id: master.id, activeCompanyId: own.id }));
    }

    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return NextResponse.json({ error: "Не указана компания" }, { status: 400 });
    const membership = await prisma.member.findFirst({
      where: { companyId, masterId: master.id, removedAt: null },
      select: { id: true, joinedAt: true },
    });
    if (!membership) return NextResponse.json({ error: "Приглашение не найдено или отозвано" }, { status: 404 });

    await prisma.$transaction([
      prisma.master.update({ where: { id: master.id }, data: { activeCompanyId: companyId } }),
      ...(membership.joinedAt ? [] : [prisma.member.update({ where: { id: membership.id }, data: { joinedAt: new Date() } })]),
    ]);
    return NextResponse.json(await getScope({ id: master.id, activeCompanyId: companyId }));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Switch company error:", error);
    return NextResponse.json({ error: "Не удалось переключить компанию" }, { status: 500 });
  }
}
