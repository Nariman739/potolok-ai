import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownCompanyHasOtherPeople, transferOwnDataOps } from "@/lib/company";
import { notifyMemberOfDecision } from "@/lib/company-approval";

/**
 * POST { approve: boolean } — решение владельца по заявке на вступление (09.11.2026).
 * Только настоящий владелец компании и независимо от того, в какой компании он сейчас
 * работает: «Людей» может менять любой участник, а открыть базу — только владелец.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { approve?: unknown };
    if (typeof body.approve !== "boolean") return NextResponse.json({ error: "Не указано решение" }, { status: 400 });

    const member = await prisma.member.findFirst({
      where: { id, removedAt: null, masterId: { not: null }, pendingSince: { not: null }, company: { ownerId: master.id } },
      select: { id: true, masterId: true, companyId: true, pendingBringData: true, company: { select: { name: true } }, master: { select: { language: true } } },
    });
    if (!member || !member.masterId) return NextResponse.json({ error: "Заявка не найдена или уже рассмотрена" }, { status: 404 });
    const applicantId = member.masterId;
    const language = member.master?.language;

    if (!body.approve) {
      // Строка остаётся «без приложения» (на неё могут ссылаться объекты), номер заблокирован
      // до нового приглашения владельцем: иначе отклонённый слал бы заявки снова.
      await prisma.member.updateMany({
        where: { id: member.id, pendingSince: { not: null } },
        data: { masterId: null, pendingSince: null, pendingBringData: null, rejectedAt: new Date() },
      });
      await notifyMemberOfDecision(applicantId, language, member.company.name, false);
      return NextResponse.json({ ok: true, approved: false });
    }

    // За время ожидания в своей компании могли появиться люди: подтверждаем без переноса,
    // чтобы решение владельца не падало из-за чужих данных.
    const wantsTransfer = member.pendingBringData === true;
    const transferSkipped = wantsTransfer && (await ownCompanyHasOtherPeople(applicantId));
    const bring = wantsTransfer && !transferSkipped;
    const baseOps = [
      prisma.member.updateMany({
        where: { id: member.id, pendingSince: { not: null } },
        data: { joinedAt: new Date(), pendingSince: null, pendingBringData: null, rejectedAt: null },
      }),
      prisma.master.update({ where: { id: applicantId }, data: { activeCompanyId: member.companyId } }),
    ];
    const transferOps = bring ? await transferOwnDataOps(applicantId, member.companyId) : [];
    const results = await prisma.$transaction([...baseOps, ...transferOps]);
    const counts = results.slice(baseOps.length) as { count: number }[];
    await notifyMemberOfDecision(applicantId, language, member.company.name, true);
    return NextResponse.json({
      ok: true,
      approved: true,
      transferSkipped,
      transferred: bring ? { objects: counts[0].count, estimates: counts[1].count, clients: counts[2].count, payments: counts[3].count } : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Member decision error:", error);
    return NextResponse.json({ error: "Не удалось сохранить решение" }, { status: 500 });
  }
}
