import type { DealStatus } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { canonicalizeStatus, changeClientStatus } from "./clients";
import { inScope, type Scope } from "./company";
import { pickPrimaryEstimate } from "./object-stage";
import {
  autoCrmColumn,
  CRM_COLUMNS,
  CRM_COLUMN_LABELS,
  isCrmColumn,
  mainObject,
  resolveCrmColumn,
  type CrmColumn,
  type CrmInput,
} from "./crm-columns";

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

const DONE_REASON = "Канбан: Завершён";

/**
 * Один источник правды — этап канбана (10.11.2026, «Небо в подарок»: менеджер перенёс
 * в «Замер», а в карточке остался «Новый»). Четыре статуса приложения — производная:
 * Новая заявка → NEW, все промежуточные этапы → IN_PROGRESS, Завершён → WON, Отказ → LOST.
 */
export function statusForColumn(column: CrmColumn): DealStatus {
  if (column === "new") return "NEW";
  if (column === "done") return "WON";
  if (column === "lost") return "LOST";
  return "IN_PROGRESS";
}

/** Промежуточный этап — клиент «В работе». */
export function isMiddleColumn(column: CrmColumn): boolean {
  return column !== "new" && column !== "done" && column !== "lost";
}

const ESTIMATE_SELECT = {
  status: true,
  total: true,
  createdAt: true,
  deletedAt: true,
  contractPublicId: true,
} as const;

// Всё, по чему считается колонка клиента, — одним select для доски, карточки и API
function crmSelect(now: Date) {
  return {
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
      where: { type: "MEASUREMENT" as const, scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" as const },
      take: 1,
      select: { scheduledAt: true },
    },
  };
}

type CrmClientRow = Awaited<ReturnType<typeof loadCrmClient>> extends infer T ? NonNullable<T> : never;

async function loadCrmClient(clientId: string, now: Date) {
  return prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: crmSelect(now) });
}

function crmInputOf(c: CrmClientRow): CrmInput {
  return {
    status: c.status,
    crmColumn: c.crmColumn,
    objects: c.measurements,
    estimates: c.estimates,
    hasScheduledMeasurement: !!c.events[0],
  };
}

export type ClientStage = {
  column: CrmColumn;
  objectId: string | null;
  installAt: string | null;
  address: string | null;
};

/** Текущий этап клиента для карточки: колонка и главный объект для диалога даты монтажа. */
export async function getClientStage(clientId: string): Promise<ClientStage | null> {
  const now = new Date();
  const c = await loadCrmClient(clientId, now);
  if (!c) return null;
  const main = mainObject(c.measurements);
  return {
    column: resolveCrmColumn(crmInputOf(c), now),
    objectId: main?.id ?? null,
    installAt: main?.installAt?.toISOString() ?? null,
    address: main?.address || c.address,
  };
}

export async function getBoardItems(scope: Scope, masterId: string): Promise<BoardItem[]> {
  const now = new Date();
  const clients = await prisma.client.findMany({
    where: { ...inScope(scope), deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: crmSelect(now),
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
      column: resolveCrmColumn(crmInputOf(c), now),
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
  const main = await prisma.measurementObject.findFirst({
    where: { clientId: client.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, manualStage: true },
  });
  // Этап «смонтировали»/«закрыл» уже поставлен в приложении: «Завершён» и так считается сам.
  // Колонку не пишем — иначе ручная колонка перекрыла бы этап из приложения.
  const finished = main?.manualStage === "installed" || main?.manualStage === "closed";
  const stageFromApp = column === "done" && finished;
  await prisma.client.update({ where: { id: client.id }, data: { crmColumn: stageFromApp ? null : column } });

  // Карточку уводят из «Завершён»: «смонтировали»/«закрыл» больше не верно, иначе доска и
  // приложение разойдутся, а дата монтажа на таком объекте снова поднимала бы статус до «Сделка»
  // (syncClientStatusForObject). «Из Завершён» — это ручная колонка done или пустая колонка при
  // завершённом объекте (после «Завершён» колонку не пишем), и не «Отказ». Монтаж — физический
  // факт: канбан его не отменяет ни переносом в «Отказ», ни возвратом из «Отказа».
  const fromDone = client.status !== "LOST" && (client.crmColumn === "done" || (client.crmColumn === null && finished));
  if (column !== "done" && column !== "lost" && finished && fromDone) {
    await prisma.measurementObject.update({ where: { id: main.id }, data: { manualStage: null } });
  }

  if (column === "lost") {
    await changeClientStatus(client.id, "LOST", "Канбан: Отказ");
    return;
  }
  if (column === "done") {
    await changeClientStatus(client.id, "WON", DONE_REASON);
    // «Закрыл» (монтаж + деньги) приложение считает само — его не сбиваем.
    if (main && main.manualStage !== "closed") {
      await prisma.measurementObject.update({ where: { id: main.id }, data: { manualStage: "installed" } });
    }
    return;
  }
  // Колонку сняли (null) — статус не трогаем: этап снова считается из объекта
  if (column === null) return;

  // «Новая заявка» или промежуточный этап: статус следует за этапом
  const want = statusForColumn(column);
  const current = canonicalizeStatus(client.status);
  if (current === want) return;
  if (current === "WON") {
    // WON откатываем, только если его поставил сам канбан: сделка, закрытая раньше
    // (клиент принял КП), остаётся сделкой. Иначе клиент выпадал из напоминаний.
    const lastChange = await prisma.clientEvent.findFirst({
      where: { clientId: client.id, type: "STATUS_CHANGE" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    if (lastChange?.content !== DONE_REASON) return;
    await changeClientStatus(client.id, want, "Канбан: вернули из «Завершён»");
    return;
  }
  const reason = current === "LOST" ? "Канбан: вернули из отказа" : `Канбан: ${CRM_COLUMN_LABELS[column]}`;
  await changeClientStatus(client.id, want, reason);
}

/**
 * Объект смонтирован/закрыт (из приложения или датой монтажа в /plan): ручная колонка ниже
 * «Завершён» снимается, «Завершён» считается сам из объекта. Независимо от статуса — чаще всего
 * WON уже стоит (КП принято/цех/оплата), а карточку менеджер тянул по доске вручную. Идемпотентна.
 * Иначе сделка висела бы в «Замере» (наблюдение контролёра 10.11: «Отказ» после монтажа → «В работе»
 * из приложения → /plan → WON, а колонка «Замер» осталась). Снимаем только если без ручной колонки
 * этап и правда «Завершён» — смонтирован именно главный (новейший) объект клиента, а не старый.
 */
export async function settleColumnForFinishedObject(clientId: string): Promise<void> {
  const now = new Date();
  const c = await loadCrmClient(clientId, now);
  if (!c || c.crmColumn === null || c.crmColumn === "done") return;
  const auto = autoCrmColumn({ ...crmInputOf(c), crmColumn: null }, now);
  if (auto !== "done") return;
  const from = isCrmColumn(c.crmColumn) ? CRM_COLUMN_LABELS[c.crmColumn] : c.crmColumn;
  await prisma.client.update({ where: { id: c.id }, data: { crmColumn: null } });
  await prisma.clientEvent.create({
    data: {
      clientId: c.id,
      type: "STATUS_CHANGE",
      content: `Этап: «${from}» → «${CRM_COLUMN_LABELS.done}» (объект смонтирован)`,
      metadata: { column: { from: c.crmColumn, to: null }, by: "object-stage" } as unknown as object,
    },
  });
}

/**
 * Статус сменили напрямую — из карточки на сайте или из приложения («Сменить статус»):
 * подтягиваем этап канбана. Новый → этап снова считается из объекта/КП (это единственное
 * допускаемое расхождение: у клиента с объектом может остаться «Новый» до следующего
 * переноса); В работе → если этап и так промежуточный, не трогаем, иначе «Замер»;
 * Сделка → Завершён; Отказ → Отказ.
 */
export async function syncColumnForStatus(clientId: string, status: DealStatus): Promise<void> {
  const now = new Date();
  const c = await loadCrmClient(clientId, now);
  if (!c) return;
  const client = { id: c.id, status: c.status, crmColumn: c.crmColumn };
  const input = crmInputOf(c);
  const current = resolveCrmColumn(input, now);
  switch (canonicalizeStatus(status)) {
    case "NEW":
      if (c.crmColumn !== null) await prisma.client.update({ where: { id: c.id }, data: { crmColumn: null } });
      return;
    case "IN_PROGRESS": {
      if (isMiddleColumn(current)) return;
      // Без ручной колонки этап считается сам: промежуточный — хватит снять ручную
      const auto = autoCrmColumn({ ...input, crmColumn: null }, now);
      if (isMiddleColumn(auto)) {
        if (c.crmColumn !== null) await prisma.client.update({ where: { id: c.id }, data: { crmColumn: null } });
      } else {
        await applyCrmColumn(client, "measure");
      }
      return;
    }
    case "WON": {
      // WON — «сделка заключена», не «смонтировано»: за 30 дней автоматический WON «Объект
      // согласован» ставился 79 раз у 47 мастеров без монтажа. Поэтому manualStage здесь не
      // трогаем никогда (в «Завершён» на доске мастер говорит это явно — там installed ставится).
      // Колонка: объект уже смонтирован → «Завершён» (считается сам), иначе не ниже «Договора».
      const main = mainObject(c.measurements);
      if (main?.manualStage === "installed" || main?.manualStage === "closed") {
        if (current !== "done" && c.crmColumn !== null) {
          await prisma.client.update({ where: { id: c.id }, data: { crmColumn: null } });
        }
        return;
      }
      if (isMiddleColumn(current) && CRM_COLUMNS.indexOf(current) >= CRM_COLUMNS.indexOf("contract")) return;
      if (c.crmColumn !== "contract") {
        await prisma.client.update({ where: { id: c.id }, data: { crmColumn: "contract" } });
      }
      return;
    }
    case "LOST":
      if (c.crmColumn !== "lost") await applyCrmColumn(client, "lost");
      return;
  }
}
