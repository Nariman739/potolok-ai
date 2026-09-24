import { prisma } from "./prisma";
import type { ClientSource, DealStatus, EventType, Prisma } from "@/generated/prisma/client";

// Legacy → canonical статусы. В UI у мастера теперь только 4 кнопки
// (Новый / В работе / Сделка / Отказ), но старые билды mobile продолжают
// слать QUALIFIED/PROPOSAL_SENT/NEGOTIATING. На сервере сворачиваем их
// в IN_PROGRESS. Маппинг оставляем НАВСЕГДА — старые версии остаются на
// руках мастеров годами.
//
// Sentry-урок (25.05.26): любой Record<DealStatus, ...> lookup должен
// иметь `?? fallback`. На клиенте mirror в src/lib/status.ts (mobile).
const LEGACY_STATUS_MAP: Record<string, DealStatus> = {
  QUALIFIED: "IN_PROGRESS" as DealStatus,
  PROPOSAL_SENT: "IN_PROGRESS" as DealStatus,
  NEGOTIATING: "IN_PROGRESS" as DealStatus,
};

export function canonicalizeStatus(raw: string): DealStatus {
  return (LEGACY_STATUS_MAP[raw] ?? (raw as DealStatus));
}

// Asia/Almaty всегда UTC+5 (Казахстан без DST с 2005 года).
// Не тащим date-fns-tz ради этой одной таймзоны.
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

function endOfTodayAlmaty(): Date {
  const nowZ = new Date(Date.now() + ALMATY_OFFSET_MS);
  nowZ.setUTCHours(23, 59, 59, 999);
  return new Date(nowZ.getTime() - ALMATY_OFFSET_MS);
}

function endOfTomorrowAlmaty(): Date {
  return new Date(endOfTodayAlmaty().getTime() + 24 * 60 * 60 * 1000);
}

export async function getActionableClients(masterId: string | string[]) {
  const tomorrowEnd = endOfTomorrowAlmaty();
  const todayEnd = endOfTodayAlmaty();
  const now = new Date();

  const rows = await prisma.client.findMany({
    where: {
      masterId: Array.isArray(masterId) ? { in: masterId } : masterId,
      deletedAt: null,
      nextContactAt: { lte: tomorrowEnd },
      status: { notIn: ["WON" as DealStatus, "LOST" as DealStatus] },
    },
    orderBy: { nextContactAt: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      status: true,
      nextContactAt: true,
    },
  });

  return {
    overdue:  rows.filter((r) => r.nextContactAt! <  now),
    today:    rows.filter((r) => r.nextContactAt! >= now && r.nextContactAt! <= todayEnd),
    tomorrow: rows.filter((r) => r.nextContactAt! >  todayEnd),
  };
}

/**
 * Телефон клиента храним цифрами в виде 7XXXXXXXXXX. Мастера вводят как угодно:
 * «8 701…», «+7 701…», просто «701…» (21.09.2026: из-за этого один человек
 * заводился двумя клиентами, а ссылка WhatsApp с 10 цифрами уходила не туда).
 * Номера других стран (не 10/11 цифр на 7/8) оставляем как есть.
 */
export function normalizeClientPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("7")) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}
const normalizePhone = normalizeClientPhone;

export type GetOrCreateClientInput = {
  masterId: string;
  /**
   * Компания-владелец (24.09.2026). Проставляется новому клиенту и расширяет
   * поиск дубля на всю бригаду: замерщик и бригадир заводили одного человека
   * дважды, а карточка с историей оставалась у того, кто позвонил первым.
   */
  companyId?: string | null;
  /** Мастера компании — чтобы найти клиента, заведённого напарником до перехода. */
  masterIds?: string[];
  name: string | null | undefined;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: ClientSource | null;
};

export async function getOrCreateClient(input: GetOrCreateClientInput) {
  const { masterId, companyId } = input;
  // Клиент принадлежит компании: ищем дубль по всей бригаде, а не только
  // среди своих записей. Без companyId (старый вызов) — прежнее поведение.
  const owner: Prisma.ClientWhereInput = companyId
    ? { OR: [{ companyId }, { masterId: { in: input.masterIds?.length ? input.masterIds : [masterId] } }] }
    : { masterId };
  const name = (input.name ?? "").trim();
  const phone = normalizePhone(input.phone);
  const address = input.address?.trim() || null;
  const latitude =
    typeof input.latitude === "number" && Number.isFinite(input.latitude)
      ? input.latitude
      : null;
  const longitude =
    typeof input.longitude === "number" && Number.isFinite(input.longitude)
      ? input.longitude
      : null;

  if (!name && !phone) return null;

  // Дедуп по телефону / имени игнорирует soft-deleted клиентов: если мастер
  // удалил клиента и завёл нового по тому же телефону — это его выбор. При
  // желании старый можно восстановить из /dashboard/trash.
  if (phone) {
    // Старые записи могли сохраниться 10 цифрами без семёрки — ищем и их.
    const variants = phone.length === 11 && phone.startsWith("7") ? [phone, phone.slice(1), `8${phone.slice(1)}`] : [phone];
    const existing = await prisma.client.findFirst({
      where: { ...owner, phone: { in: variants }, deletedAt: null },
    });
    if (existing) return existing;
  }

  // Без телефона по одному имени не склеиваем (23.09.2026): две разные «Айгуль»
  // становились одним клиентом, и объекты чужого человека попадали в его карточку.
  // Исключение — тот же адрес: это точно тот же заказ.
  if (name && !phone && address) {
    const existing = await prisma.client.findFirst({
      where: { ...owner, name, phone: null, address, deletedAt: null },
    });
    if (existing) return existing;
  }

  const created = await prisma.client.create({
    data: {
      masterId,
      companyId: companyId ?? null,
      name: name || phone || "Без имени",
      phone,
      address,
      latitude,
      longitude,
      source: input.source ?? null,
      status: "NEW",
    },
  });

  await prisma.clientEvent.create({
    data: {
      clientId: created.id,
      type: "NOTE",
      content: input.source
        ? `Клиент добавлен (источник: ${input.source.toLowerCase()})`
        : "Клиент добавлен",
    },
  });

  return created;
}

export type AddEventInput = {
  clientId: string;
  type: EventType;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function addClientEvent(input: AddEventInput) {
  return prisma.clientEvent.create({
    data: {
      clientId: input.clientId,
      type: input.type,
      content: input.content ?? null,
      metadata: input.metadata
        ? (input.metadata as unknown as object)
        : undefined,
    },
  });
}

export async function changeClientStatus(
  clientId: string,
  status: DealStatus,
  reason?: string,
) {
  // Soft-deleted клиентов не трогаем — статус-изменения от CRM-событий
  // (KP_CONFIRMED и т.п.) могут прилетать после удаления, это noop.
  const before = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { status: true },
  });
  if (!before) return null;
  if (before.status === status) return before;

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { status },
  });

  await prisma.clientEvent.create({
    data: {
      clientId,
      type: "STATUS_CHANGE",
      content: reason ?? `Статус: ${before.status} → ${status}`,
      metadata: { from: before.status, to: status } as unknown as object,
    },
  });

  return updated;
}

/**
 * Статус клиента в воронке следует за этапом объекта (23.09.2026).
 * Раньше он менялся только когда клиент нажимал «Принять» по ссылке или
 * подписывал договор — а 85% КП живут без ответа клиента. Объект уже в цеху
 * с предоплатой, а в воронке человек всё ещё «Новый».
 *
 * Правило: только вверх (NEW → IN_PROGRESS → WON). Вниз статус не роняем —
 * это решение мастера. Отправил КП → в работе; согласовали, цех, деньги,
 * закрыл → сделка выиграна.
 */
export async function syncClientStatusForObject(objectId: string): Promise<void> {
  const { resolveStage } = await import("./object-stage");
  const obj = await prisma.measurementObject.findFirst({
    where: { id: objectId, deletedAt: null },
    select: {
      clientId: true,
      manualStage: true,
      estimates: { where: { deletedAt: null }, select: { status: true, total: true, createdAt: true, deletedAt: true } },
      workshopOrders: { select: { id: true } },
      payments: { select: { amount: true } },
      client: { select: { status: true } },
    },
  });
  if (!obj?.clientId || !obj.client) return;
  const paid = obj.payments.reduce((s, p) => s + p.amount, 0);
  const price = obj.estimates.find((e) => e.status === "CONFIRMED")?.total ?? obj.estimates[0]?.total ?? 0;
  const { stage } = resolveStage({
    manualStage: obj.manualStage,
    estimates: obj.estimates,
    workshopOrders: obj.workshopOrders,
    settled: price > 0 && paid >= price,
  });
  const rank: Record<string, number> = { NEW: 0, IN_PROGRESS: 1, WON: 2, LOST: 2 };
  const target: DealStatus | null =
    ["confirmed", "workshop", "installed", "closed"].includes(stage) || paid > 0
      ? "WON"
      : ["sent", "viewed", "calculated"].includes(stage)
        ? "IN_PROGRESS"
        : null;
  if (!target) return;
  const current = canonicalizeStatus(obj.client.status);
  if ((rank[current] ?? 0) >= (rank[target] ?? 0)) return;
  await changeClientStatus(obj.clientId, target, target === "WON" ? "Объект согласован (по этапу)" : "КП посчитано и отправлено (по этапу)");
}
