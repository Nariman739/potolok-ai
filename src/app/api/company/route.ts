import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, normalizePhone, ownDataCounts } from "@/lib/company";

/**
 * Компания и люди (Этап 3). GET — состав; POST — добавить человека
 * (по имени, телефон необязателен). Если по телефону найдётся
 * зарегистрированный мастер — привязываем: он увидит объекты компании.
 * Человек без приложения остаётся записью с именем и суммой.
 */
export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    // Приглашения (21.09.2026): компании, куда меня добавили по номеру, но где я
    // ещё не работаю. Переход — только по моему согласию (POST /company/switch).
    const memberships = await prisma.member.findMany({
      where: { masterId: master.id, removedAt: null, role: { not: "owner" }, companyId: { not: scope.companyId } },
      select: { companyId: true, pendingSince: true, company: { select: { name: true, owner: { select: { firstName: true, lastName: true } } } } },
    });
    const toInvite = (m: (typeof memberships)[number]) => ({
      companyId: m.companyId,
      companyName: m.company.name,
      ownerName: [m.company.owner.firstName, m.company.owner.lastName].filter(Boolean).join(" "),
    });
    // Принятое приглашение до подтверждения владельцем — уже не приглашение, а заявка.
    const invites = memberships.filter((m) => !m.pendingSince).map(toInvite);
    const waiting = memberships.find((m) => m.pendingSince);
    const pendingJoin = waiting ? toInvite(waiting) : null;
    // Заявки в МОЮ компанию (не по scope: владелец мог сейчас работать в чужой). Имя и телефон —
    // самого аккаунта, а не строки «Людей»: телефон в строке можно поправить, не меняя аккаунт.
    const requests = await prisma.member.findMany({
      where: { removedAt: null, masterId: { not: null }, pendingSince: { not: null }, company: { ownerId: master.id } },
      orderBy: { pendingSince: "asc" },
      select: { id: true, masterId: true, pendingSince: true, pendingBringData: true, master: { select: { firstName: true, lastName: true, phone: true } } },
    });
    const approvals = await Promise.all(requests.map(async (r) => ({
      id: r.id,
      name: [r.master?.firstName, r.master?.lastName].filter(Boolean).join(" ") || "Мастер",
      phone: r.master?.phone ?? null,
      since: r.pendingSince,
      bring: r.pendingBringData === true ? await ownDataCounts(r.masterId as string) : null,
    })));
    // Сколько своих данных у приглашённого — приложение спросит, переносить ли их
    // в компанию при принятии (слияние уже работающих мастеров, 01.10.2026).
    const ownData = invites.length > 0 ? await ownDataCounts(master.id) : null;
    return NextResponse.json({ ...scope, invites, ownData, pendingJoin, approvals, canReturnToOwn: !scope.isOwner });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get company error:", error);
    return NextResponse.json({ error: "Ошибка загрузки компании" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; phone?: unknown; defaultFee?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : null);
    const defaultFee = typeof body.defaultFee === "number" && body.defaultFee >= 0 ? Math.round(body.defaultFee) : null;
    if (!name && !phone) {
      return NextResponse.json({ error: "Нужно имя или телефон" }, { status: 400 });
    }

    // Свой номер — владелец и так участник.
    if (phone && phone === normalizePhone(master.phone)) {
      return NextResponse.json({ error: "Это ваш собственный номер" }, { status: 400 });
    }

    // Уже есть в компании (в т.ч. удалённый — возвращаем)?
    if (phone) {
      const dup = await prisma.member.findFirst({ where: { companyId: scope.companyId, phone } });
      if (dup) {
        // Человек мог зарегистрироваться после того, как его записали без приложения.
        // Отклонённый номер снова приглашает только владелец (участник мог бы открыть заявку заново).
        if (dup.rejectedAt && !scope.isOwner) {
          return NextResponse.json({ error: "Пригласить снова может только владелец" }, { status: 403 });
        }
        const nowRegistered = dup.masterId ? null : await prisma.master.findFirst({ where: { phone }, select: { id: true } });
        const restored = await prisma.member.update({
          where: { id: dup.id },
          data: {
            removedAt: null,
            name: name || dup.name,
            defaultFee: defaultFee ?? dup.defaultFee,
            rejectedAt: null,
            // Владелец позвал сам — о новой заявке он должен узнать, лимит уведомлений только от цикла отзывов.
            approvalPushAt: null,
            // Новая привязка аккаунта — заново согласие и подтверждение.
            ...(nowRegistered ? { masterId: nowRegistered.id, joinedAt: null } : {}),
          },
        });
        return NextResponse.json({ member: restored, linked: false, invited: !!restored.phone, restored: true });
      }
    }

    // Зарегистрирован ли такой мастер — тогда он получит доступ к объектам компании.
    const linkedMaster = phone
      ? await prisma.master.findFirst({ where: { phone }, select: { id: true } })
      : null;

    const member = await prisma.member.create({
      data: {
        companyId: scope.companyId,
        masterId: linkedMaster?.id ?? null,
        name: name || phone!,
        phone,
        defaultFee,
        // joinedAt ставится, когда человек сам примет приглашение
        joinedAt: null,
      },
    });

    // linked не раскрываем: по ответу нельзя узнать, зарегистрирован ли номер (перебор базы).
    return NextResponse.json({ member, linked: false, invited: !!phone, restored: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Add member error:", error);
    return NextResponse.json({ error: "Не удалось добавить человека" }, { status: 500 });
  }
}
