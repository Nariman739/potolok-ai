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
    return NextResponse.json(scope);
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
        if (restored.masterId) await switchIfEmpty(restored.masterId, scope.companyId);
        return NextResponse.json({ member: restored, linked: !!restored.masterId, restored: true });
      }
    }

    // Зарегистрирован ли такой мастер — тогда он получит доступ к объектам компании.
    const linkedMaster = phone
      ? await prisma.master.findFirst({ where: { phone }, select: { id: true, firstName: true, lastName: true } })
      : null;

    const member = await prisma.member.create({
      data: {
        companyId: scope.companyId,
        masterId: linkedMaster?.id ?? null,
        name: name || [linkedMaster?.firstName, linkedMaster?.lastName].filter(Boolean).join(" ") || phone!,
        phone,
        defaultFee,
        joinedAt: linkedMaster ? new Date() : null,
      },
    });

    if (linkedMaster) await switchIfEmpty(linkedMaster.id, scope.companyId);

    return NextResponse.json({ member, linked: !!linkedMaster, restored: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Add member error:", error);
    return NextResponse.json({ error: "Не удалось добавить человека" }, { status: 500 });
  }
}

/**
 * Приглашённый мастер без своих объектов сразу работает в этой компании —
 * наёмному замерщику незачем пустая «своя» компания. Если объекты есть,
 * остаётся в своей; переключатель компаний — позже.
 */
async function switchIfEmpty(masterId: string, companyId: string) {
  // «Пустой» = нет своих объектов, КП, клиентов и своих позиций прайса (21.09).
  // Раньше смотрели только объекты и КП: мастер с базой клиентов, но без
  // замеров, молча уезжал в чужую компанию и терял свой список из виду.
  // Стандартный прайс не считаем — он создаётся у всех при регистрации.
  const [ownObjects, ownEstimates, ownClients, ownCustomItems] = await Promise.all([
    prisma.measurementObject.count({ where: { masterId, deletedAt: null } }),
    prisma.estimate.count({ where: { masterId, deletedAt: null } }),
    prisma.client.count({ where: { masterId, deletedAt: null } }),
    prisma.customItem.count({ where: { masterId } }),
  ]);
  if (ownObjects + ownEstimates + ownClients + ownCustomItems === 0) {
    await prisma.master.update({ where: { id: masterId }, data: { activeCompanyId: companyId } });
  }
}
