import { prisma } from "./prisma";
import { changeClientStatus } from "./clients";
import { inScope, type Scope } from "./company";
import { pickPrimaryEstimate } from "./object-stage";
import { mainObject, resolveCrmColumn, type CrmColumn } from "./crm-columns";

export type BoardItem = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  column: CrmColumn;
  total: number | null;
  /** Дата на карточке: монтаж, будущий замер или прошедший замер */
  date: { kind: "install" | "measure"; at: string } | null;
  ownerName: string | null;
  mine: boolean;
  /** Самый новый объект — для диалога даты монтажа */
  objectId: string | null;
  installAt: string | null;
  extraObjects: number;
  updatedAt: string;
};

const ESTIMATE_SELECT = {
  status: true,
  total: true,
  createdAt: true,
  deletedAt: true,
  contractPublicId: true,
} as const;

export async function getBoardItems(scope: Scope, masterId: string): Promise<BoardItem[]> {
  const now = new Date();
  const clients = await prisma.client.findMany({
    where: { ...inScope(scope), deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      masterId: true,
      name: true,
      phone: true,
      address: true,
      status: true,
      crmColumn: true,
      updatedAt: true,
      estimates: { where: { deletedAt: null }, select: ESTIMATE_SELECT },
      measurements: {
        where: { deletedAt: null },
        select: {
          id: true,
          address: true,
          createdAt: true,
          measuredAt: true,
          installAt: true,
          manualStage: true,
          estimates: { where: { deletedAt: null }, select: ESTIMATE_SELECT },
          workshopOrders: { select: { id: true } },
        },
      },
      events: {
        where: { type: "MEASUREMENT", scheduledAt: { gte: now } },
        orderBy: { scheduledAt: "asc" },
        take: 1,
        select: { scheduledAt: true },
      },
    },
  });

  return clients.map((c) => {
    const main = mainObject(c.measurements);
    const primary = pickPrimaryEstimate(main?.estimates.length ? main.estimates : c.estimates);
    const nextMeasure = c.events[0]?.scheduledAt ?? null;
    const measuredAt = main ? (main.measuredAt ?? main.createdAt) : null;
    const date: BoardItem["date"] = main?.installAt
      ? { kind: "install", at: main.installAt.toISOString() }
      : nextMeasure
        ? { kind: "measure", at: nextMeasure.toISOString() }
        : measuredAt
          ? { kind: "measure", at: measuredAt.toISOString() }
          : null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: main?.address || c.address,
      column: resolveCrmColumn(
        {
          status: c.status,
          crmColumn: c.crmColumn,
          objects: c.measurements,
          estimates: c.estimates,
          hasScheduledMeasurement: !!nextMeasure,
        },
        now,
      ),
      total: primary?.total ?? null,
      date,
      ownerName: scope.members.find((m) => m.masterId === c.masterId)?.name ?? null,
      mine: c.masterId === masterId,
      objectId: main?.id ?? null,
      installAt: main?.installAt?.toISOString() ?? null,
      extraObjects: Math.max(0, c.measurements.length - 1),
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}

/**
 * Перенос карточки. Колонка пишется всегда, а там, где у приложения есть своё
 * поле, оно тоже меняется — чтобы сайт и приложение показывали одно.
 */
export async function applyCrmColumn(
  client: { id: string; status: string; crmColumn: string | null },
  column: CrmColumn | null,
): Promise<void> {
  await prisma.client.update({ where: { id: client.id }, data: { crmColumn: column } });

  if (column === "lost") {
    await changeClientStatus(client.id, "LOST", "Канбан: Отказ");
    return;
  }
  const main = await prisma.measurementObject.findFirst({
    where: { clientId: client.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, manualStage: true },
  });
  if (column === "done") {
    await changeClientStatus(client.id, "WON", "Канбан: Завершён");
    // «Закрыл» (монтаж + деньги) приложение считает само — его не сбиваем.
    if (main && main.manualStage !== "closed") {
      await prisma.measurementObject.update({ where: { id: main.id }, data: { manualStage: "installed" } });
    }
    return;
  }
  if (client.status === "LOST") {
    await changeClientStatus(client.id, "IN_PROGRESS", "Канбан: вернули из отказа");
  }
  // Убираем только то, что поставил сам канбан; этап, выставленный в приложении, не трогаем.
  if (client.crmColumn === "done" && main?.manualStage === "installed") {
    await prisma.measurementObject.update({ where: { id: main.id }, data: { manualStage: null } });
  }
}
