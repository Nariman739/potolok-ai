import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownCompanyHasOtherPeople, transferOwnDataOps } from "@/lib/company";
import { notifyMemberOfDecision } from "@/lib/company-approval";

const ALREADY_DECIDED = "Заявка не найдена или уже рассмотрена";

/**
 * POST { approve: boolean } — решение владельца по заявке на вступление (09.11.2026).
 * Только настоящий владелец компании и независимо от того, в какой компании он сейчас
 * работает: «Людей» может менять любой участник, а открыть базу — только владелец.
 *
 * Решение и его последствия — одна интерактивная транзакция, первым шагом условное
 * взятие заявки: при одновременных «подтвердить», «отклонить» и «отозвать» выигрывает
 * один, остальные ничего не меняют и не шлют уведомлений (код-ревью 09.11.2026).
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
    if (!member || !member.masterId) return NextResponse.json({ error: ALREADY_DECIDED }, { status: 404 });
    const applicantId = member.masterId;
    const language = member.master?.language;
    // Заявка всё ещё та же: тот же аккаунт, не убран, ещё не подтверждён, ждёт решения и с тем же
    // выбором о переносе, который мы прочитали. Иначе устаревшее «Отклонить» сняло бы работающего.
    const claimWhere = {
      id: member.id,
      masterId: applicantId,
      removedAt: null,
      joinedAt: null,
      pendingSince: { not: null },
      pendingBringData: member.pendingBringData,
    };

    if (!body.approve) {
      // Строка остаётся «без приложения» (на неё могут ссылаться объекты), номер заблокирован
      // до нового приглашения владельцем: иначе отклонённый слал бы заявки снова.
      const claim = await prisma.member.updateMany({
        where: claimWhere,
        data: { masterId: null, pendingSince: null, pendingBringData: null, rejectedAt: new Date() },
      });
      if (claim.count !== 1) return NextResponse.json({ error: ALREADY_DECIDED }, { status: 404 });
      await notifyMemberOfDecision(applicantId, language, member.company.name, { approved: false });
      return NextResponse.json({ ok: true, approved: false });
    }

    // За время ожидания в своей компании могли появиться люди: подтверждаем без переноса,
    // чтобы решение владельца не падало из-за чужих данных.
    const wantsTransfer = member.pendingBringData === true;
    const blocked = wantsTransfer && (await ownCompanyHasOtherPeople(applicantId));

    const outcome = await prisma.$transaction(
      async (tx) => {
        const claim = await tx.member.updateMany({
          where: claimWhere,
          data: { joinedAt: new Date(), pendingSince: null, pendingBringData: null, rejectedAt: null },
        });
        if (claim.count !== 1) return null;

        // Работает в другой компании — не выдёргиваем: подтверждён, перейдёт сам через «Принять»
        // (там же решит про перенос). Сразу в компанию — только если он работает у себя.
        const [me, own] = [
          await tx.master.findUnique({ where: { id: applicantId }, select: { activeCompanyId: true } }),
          await tx.company.findUnique({ where: { ownerId: applicantId }, select: { id: true } }),
        ];
        const worksElsewhere = !!me?.activeCompanyId && me.activeCompanyId !== own?.id && me.activeCompanyId !== member.companyId;
        if (worksElsewhere) return { movedIn: false, transferSkipped: false, transferred: null };

        await tx.master.update({ where: { id: applicantId }, data: { activeCompanyId: member.companyId } });
        if (!wantsTransfer || blocked) return { movedIn: true, transferSkipped: wantsTransfer, transferred: null };

        const [objects, estimates, clients, payments] = await transferOwnDataOps(applicantId, member.companyId, tx);
        const counts = { objects: (await objects).count, estimates: (await estimates).count, clients: (await clients).count, payments: (await payments).count };
        return { movedIn: true, transferSkipped: false, transferred: counts };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (!outcome) return NextResponse.json({ error: ALREADY_DECIDED }, { status: 404 });

    await notifyMemberOfDecision(applicantId, language, member.company.name, {
      approved: true,
      movedIn: outcome.movedIn,
      transferSkipped: outcome.transferSkipped,
    });
    return NextResponse.json({ ok: true, approved: true, ...outcome });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Member decision error:", error);
    return NextResponse.json({ error: "Не удалось сохранить решение" }, { status: 500 });
  }
}
