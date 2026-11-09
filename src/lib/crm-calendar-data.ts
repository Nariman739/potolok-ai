import { prisma } from "./prisma";
import { inScope, type Scope } from "./company";
import { buildCalendarEntries, monthGrid, type CalendarEntry } from "./crm-calendar";

const CLIENT_SELECT = { id: true, name: true, address: true, masterId: true } as const;

export type CalendarClient = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  crmColumn: string | null;
  /** Самый новый объект: дата монтажа пишется в него, как с доски */
  objectId: string | null;
  installAt: string | null;
};

export async function getCalendarClients(scope: Scope): Promise<CalendarClient[]> {
  const clients = await prisma.client.findMany({
    where: { ...inScope(scope), deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      crmColumn: true,
      measurements: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, installAt: true },
      },
    },
  });
  return clients.map(({ measurements, ...c }) => ({
    ...c,
    objectId: measurements[0]?.id ?? null,
    installAt: measurements[0]?.installAt?.toISOString() ?? null,
  }));
}

export async function getCalendarEntries(scope: Scope, masterId: string, month: string): Promise<CalendarEntry[]> {
  const grid = monthGrid(month);
  const range = { gte: grid.from, lt: grid.to };

  const [objects, events] = await Promise.all([
    prisma.measurementObject.findMany({
      where: {
        ...inScope(scope),
        deletedAt: null,
        OR: [{ measuredAt: range }, { measuredAt: null, createdAt: range }, { installAt: range }],
      },
      select: {
        id: true,
        masterId: true,
        address: true,
        status: true,
        measuredAt: true,
        createdAt: true,
        installAt: true,
        client: { select: { ...CLIENT_SELECT, deletedAt: true } },
      },
    }),
    prisma.clientEvent.findMany({
      where: {
        client: { ...inScope(scope), deletedAt: null },
        type: { in: ["MEASUREMENT", "INSTALL"] },
        scheduledAt: range,
      },
      select: { id: true, type: true, scheduledAt: true, client: { select: CLIENT_SELECT } },
    }),
  ]);

  return buildCalendarEntries(
    events.map((e) => ({ ...e, scheduledAt: e.scheduledAt! })),
    // Клиент в корзине: объект виден, но открывать нечего
    objects.map((o) => ({ ...o, client: o.client && !o.client.deletedAt ? o.client : null })),
    masterId,
    grid,
  );
}
