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
          include: { members: { where: { removedAt: null }, orderBy: { createdAt: "asc" } } },
        })
      : null;
  if (!company) {
    await ensureOwnCompany(master.id);
    company = await prisma.company.findUniqueOrThrow({
      where: { ownerId: master.id },
      include: { members: { where: { removedAt: null }, orderBy: { createdAt: "asc" } } },
    });
  }
  const masterIds = Array.from(
    new Set([company.ownerId, ...company.members.map((m) => m.masterId).filter((x): x is string => !!x)]),
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
      masterId: m.masterId,
      name: m.name,
      phone: m.phone,
      role: m.role,
      defaultFee: m.defaultFee,
      hasApp: !!m.masterId,
      isMe: m.masterId === master.id,
    })),
  };
}

/** where-фрагмент «данные компании» для объектов/КП/клиентов. */
export function inScope(scope: Scope) {
  return scope.masterIds.length === 1 ? { masterId: scope.masterIds[0] } : { masterId: { in: scope.masterIds } };
}
