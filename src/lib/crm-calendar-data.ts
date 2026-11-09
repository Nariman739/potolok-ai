import { prisma } from "./prisma";
import { inScope, type Scope } from "./company";
import { buildCalendarEntries, monthGrid, type CalendarEntry } from "./crm-calendar";

const CLIENT_SELECT = { id: true, name: true, address: true, masterId: true } as const;

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
