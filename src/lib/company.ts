import { prisma } from "./prisma";
import { normalizePhone as normalizeRaw } from "./phone";

/** Телефон участника: 8 XXX → +7 XXX, пусто → null. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;
  return normalizeRaw(phone);
}

/**
 * Компания и её границы видимости (Этап 3, 20.09.2026).
 *
 * У каждого мастера всегда есть своя компания (создаётся при регистрации,
 * старым — миграцией; здесь ещё и самовосстановление, если вдруг нет).
 * Пока в компании один человек — приложение выглядит как раньше.
 *
 * Правило Наримана: «кто в компании — видит всё». Поэтому объекты, КП и
 * клиенты читаются по всем участникам (`masterIds`), а прайс и бренд —
 * у владельца (`ownerId`): у бригадира и замерщика не должно быть разных цен.
 */

export type Scope = {
  companyId: string;
  companyName: string;
  ownerId: string;
  /** Текущий мастер — владелец этой компании */
  isOwner: boolean;
  /** Участников больше одного → в интерфейсе появляются «кто делает», «мои/все» */
  isTeam: boolean;
  /** id мастеров-участников (с приложением). Всегда содержит ownerId. */
  masterIds: string[];
  members: ScopeMember[];
};

export type ScopeMember = {
  id: string;
  masterId: string | null;
  name: string;
  phone: string | null;
  role: string;
  defaultFee: number | null;
  /** Есть приложение (привязан к мастеру) */
  hasApp: boolean;
  /** Работает в этой компании (его объекты в общем списке); false — у него своя фирма */
  worksHere: boolean;
  isMe: boolean;
};

function displayName(m: { firstName: string; lastName: string | null }): string {
  return [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || "Мастер";
}

/** Своя компания мастера; создаёт, если её ещё нет (регистрация до миграции). */
export async function ensureOwnCompany(masterId: string) {
  const existing = await prisma.company.findUnique({ where: { ownerId: masterId } });
  if (existing) return existing;
  const master = await prisma.master.findUnique({
    where: { id: masterId },
    select: { firstName: true, lastName: true, companyName: true, phone: true },
  });
  if (!master) throw new Error("Master not found");
  return prisma.company.create({
    data: {
      name: master.companyName?.trim() || master.firstName,
      ownerId: masterId,
      members: {
        create: {
          masterId,
          name: displayName(master),
          phone: master.phone,
          role: "owner",
          joinedAt: new Date(),
        },
      },
    },
  });
}

/** Границы видимости для текущего мастера: активная компания или своя. */
export async function getScope(master: { id: string; activeCompanyId?: string | null }): Promise<Scope> {
  let company =
    master.activeCompanyId
      ? await prisma.company.findFirst({
          where: {
            id: master.activeCompanyId,
            // Активной может быть только компания, где он всё ещё участник
            members: { some: { masterId: master.id, removedAt: null } },
          },
          include: { members: { where: { removedAt: null }, orderBy: { createdAt: "asc" }, include: { master: { select: { activeCompanyId: true } } } } },
        })
      : null;
  if (!company) {
    await ensureOwnCompany(master.id);
    company = await prisma.company.findUniqueOrThrow({
      where: { ownerId: master.id },
      include: { members: { where: { removedAt: null }, orderBy: { createdAt: "asc" }, include: { master: { select: { activeCompanyId: true } } } } },
    });
  }
  // Данные в общий котёл попадают ТОЛЬКО от тех, кто реально работает в этой
  // компании (activeCompanyId = она). Иначе, добавив чужой номер, владелец
  // увидел бы все объекты другого мастера с его собственной фирмой
  // (найдено код-ревью 20.09.2026). Владелец — всегда.
  const cid = company.id;
  const masterIds = Array.from(
    new Set([
      company.ownerId,
      ...company.members
        .filter((m) => m.masterId && m.masterId !== company.ownerId && m.master?.activeCompanyId === cid)
        .map((m) => m.masterId as string),
    ]),
  );
  return {
    companyId: company.id,
    companyName: company.name,
    ownerId: company.ownerId,
    isOwner: company.ownerId === master.id,
    isTeam: company.members.length > 1,
    masterIds,
    members: company.members.map((m) => ({
      id: m.id,
      // До согласия приглашённого его masterId владельцу не отдаём (см. hasApp ниже).
      masterId: m.masterId && (m.masterId === master.id || m.masterId === company.ownerId || m.master?.activeCompanyId === company.id) ? m.masterId : null,
      name: m.name,
      phone: m.phone,
      role: m.role,
      defaultFee: m.defaultFee,
      // «В приложении» показываем только после того, как человек сам принял приглашение:
      // иначе по бейджу можно узнать, зарегистрирован ли чужой номер (21.09.2026).
      hasApp: !!m.masterId && (m.masterId === company.ownerId || m.master?.activeCompanyId === company.id),
      worksHere: !m.masterId || m.masterId === company.ownerId || m.master?.activeCompanyId === company.id,
      isMe: m.masterId === master.id,
    })),
  };
}

/**
 * where-фрагмент «данные компании» для объектов/КП/клиентов/оплат.
 *
 * 24.09.2026: данные принадлежат компании (`companyId`), а не автору записи.
 * Раньше видимость считалась только по `masterId` участников — убрали человека
 * из «Людей», и его объекты, КП и клиенты пропадали из ленты владельца, а сам
 * уволенный уносил базу с телефонами.
 *
 * Переходный период: запись без `companyId` (создана старым кодом между
 * миграцией и выкладкой) видна автору. Ветка по `masterId` намеренно
 * ограничена такими записями: без этого ограничения ушедший сотрудник
 * продолжал видеть объекты, которые делал в бригаде, — то есть уносил базу,
 * ради чего всё и затевалось.
 *
 * Фильтр заворачивается в `AND`, а не в `OR` верхнего уровня: в нескольких
 * запросах (`/objects`, `/today`, `/money`) у where уже есть свой `OR`, и он
 * бы затёр наш при спреде `{ ...inScope(scope) }`.
 */
export function inScope(scope: Scope) {
  const byMaster = scope.masterIds.length === 1 ? { masterId: scope.masterIds[0] } : { masterId: { in: scope.masterIds } };
  return { AND: [{ OR: [{ companyId: scope.companyId }, { AND: [{ companyId: null }, byMaster] }] }] };
}

/**
 * id компании-владельца данных для мастера — там, где полного `Scope` под рукой
 * нет (Telegram-бот, сохранение расчёта ассистентом). Активная компания, если
 * мастер в ней всё ещё участник, иначе своя. null — молча, чтобы не ронять
 * создание КП из-за принадлежности.
 */
export async function companyIdFor(masterId: string): Promise<string | null> {
  try {
    const me = await prisma.master.findUnique({ where: { id: masterId }, select: { activeCompanyId: true } });
    if (me?.activeCompanyId) {
      const active = await prisma.company.findFirst({
        where: { id: me.activeCompanyId, members: { some: { masterId, removedAt: null } } },
        select: { id: true },
      });
      if (active) return active.id;
    }
    const own = await prisma.company.findUnique({ where: { ownerId: masterId }, select: { id: true } });
    return own?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Бренд и реквизиты для КП/договора/акта/PDF — владельца компании, а не того
 * участника, который нажал «Создать КП» (Этап 3). Возвращает объект той же
 * формы, что пришёл из select — подменяются только выбранные поля.
 * id и telegramChatId не трогаем: уведомления должны идти автору КП.
 */
export async function ownerBrandFor<M extends object>(masterId: string, master: M): Promise<M> {
  try {
    const me = await prisma.master.findUnique({ where: { id: masterId }, select: { activeCompanyId: true } });
    if (!me?.activeCompanyId) return master;
    const company = await prisma.company.findFirst({
      where: { id: me.activeCompanyId, members: { some: { masterId, removedAt: null } } },
      select: { ownerId: true },
    });
    if (!company || company.ownerId === masterId) return master;
    const keys = Object.keys(master).filter((k) => k !== "id" && k !== "telegramChatId");
    if (keys.length === 0) return master;
    const owner = await prisma.master.findUnique({
      where: { id: company.ownerId },
      select: Object.fromEntries(keys.map((k) => [k, true])) as Record<string, true>,
    });
    return owner ? ({ ...master, ...(owner as Partial<M>) } as M) : master;
  } catch {
    return master;
  }
}
