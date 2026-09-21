import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, normalizePhone } from "@/lib/company";

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
      select: { companyId: true, company: { select: { name: true, owner: { select: { firstName: true, lastName: true } } } } },
    });
    const invites = memberships.map((m) => ({
      companyId: m.companyId,
      companyName: m.company.name,
      ownerName: [m.company.owner.firstName, m.company.owner.lastName].filter(Boolean).join(" "),
    }));
    return NextResponse.json({ ...scope, invites, canReturnToOwn: !scope.isOwner });
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
        const restored = await prisma.member.update({
          where: { id: dup.id },
          data: { removedAt: null, name: name || dup.name, defaultFee: defaultFee ?? dup.defaultFee },
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
