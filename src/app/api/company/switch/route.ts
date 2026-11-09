import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureOwnCompany, getScope, ownCompanyHasOtherPeople, transferOwnDataOps } from "@/lib/company";
import { bringDataBlockedText, notifyOwnerOfRequest, pendingApprovalText } from "@/lib/company-approval";

/**
 * Переход между компаниями по СОГЛАСИЮ мастера (21.09.2026).
 * POST { companyId, bringData? } — принять приглашение: работать в компании, куда меня
 *   добавили; bringData: true — ещё и перенести туда свои объекты/КП/клиентов (слияние).
 * POST { own: true } — вернуться в свою компанию.
 * POST { cancelPending: true } — отозвать свою заявку.
 *
 * С 09.11.2026 первое принятие — это заявка: доступ и перенос данных после подтверждения
 * владельцем (см. company-approval.ts). Кто уже подтверждён (joinedAt), переходит сразу.
 * Новые клиенты шлют approvalFlow: true и получают 200 { pending: true }. Старые сборки на
 * 200 молча убрали бы карточку, поэтому им 409 с текстом — они показывают его в окне.
 *
 * Раньше мастера с пустым аккаунтом владелец затягивал к себе одним добавлением
 * номера — без вопроса. Теперь добавление = приглашение, а переключает только сам
 * приглашённый.
 */
export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { companyId?: unknown; own?: unknown; bringData?: unknown; cancelPending?: unknown; approvalFlow?: unknown };

    if (body.own === true) {
      const own = await ensureOwnCompany(master.id);
      await prisma.master.update({ where: { id: master.id }, data: { activeCompanyId: own.id } });
      return NextResponse.json(await getScope({ id: master.id, activeCompanyId: own.id }));
    }

    if (body.cancelPending === true) {
      await prisma.member.updateMany({
        where: { masterId: master.id, pendingSince: { not: null } },
        data: { pendingSince: null, pendingBringData: null },
      });
      return NextResponse.json({ ok: true });
    }

    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return NextResponse.json({ error: "Не указана компания" }, { status: 400 });
    const membership = await prisma.member.findFirst({
      where: { companyId, masterId: master.id, removedAt: null },
      select: { id: true, joinedAt: true, pendingSince: true },
    });
    if (!membership) return NextResponse.json({ error: "Приглашение не найдено или отозвано" }, { status: 404 });

    const bringData = body.bringData === true;
    // Перенос забирает данные всей своей компании: при работающих людях увёл бы и их.
    if (bringData && (await ownCompanyHasOtherPeople(master.id))) {
      return NextResponse.json({ error: bringDataBlockedText(master.language) }, { status: 409 });
    }

    if (!membership.joinedAt) {
      // Заявка одна на мастера: иначе второе подтверждение выдернуло бы его из первой компании.
      await prisma.$transaction([
        prisma.member.updateMany({
          where: { masterId: master.id, pendingSince: { not: null }, id: { not: membership.id } },
          data: { pendingSince: null, pendingBringData: null },
        }),
        prisma.member.update({
          where: { id: membership.id },
          data: { pendingSince: membership.pendingSince ?? new Date(), pendingBringData: bringData },
        }),
      ]);
      // Повторное «Принять» при висящей заявке только обновляет перенос — без уведомления.
      if (!membership.pendingSince) await notifyOwnerOfRequest(membership.id);
      if (body.approvalFlow === true) return NextResponse.json({ pending: true, companyId });
      return NextResponse.json({ error: pendingApprovalText(master.language), code: "APPROVAL_PENDING" }, { status: 409 });
    }

    const switchOps = [
      prisma.master.update({ where: { id: master.id }, data: { activeCompanyId: companyId } }),
    ];
    const transferOps = bringData ? await transferOwnDataOps(master.id, companyId) : [];
    const results = await prisma.$transaction([...switchOps, ...transferOps]);
    const counts = results.slice(switchOps.length) as { count: number }[];
    const transferred = bringData
      ? { objects: counts[0].count, estimates: counts[1].count, clients: counts[2].count, payments: counts[3].count }
      : null;
    return NextResponse.json({ ...(await getScope({ id: master.id, activeCompanyId: companyId })), transferred });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Switch company error:", error);
    return NextResponse.json({ error: "Не удалось переключить компанию" }, { status: 500 });
  }
}
