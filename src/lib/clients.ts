import { prisma } from "./prisma";
import type { ClientSource, DealStatus, EventType } from "@/generated/prisma/client";

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

export async function getActionableClients(masterId: string) {
  const tomorrowEnd = endOfTomorrowAlmaty();
  const todayEnd = endOfTodayAlmaty();
  const now = new Date();

  const rows = await prisma.client.findMany({
    where: {
      masterId,
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

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

export type GetOrCreateClientInput = {
  masterId: string;
  name: string | null | undefined;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: ClientSource | null;
};

export async function getOrCreateClient(input: GetOrCreateClientInput) {
  const { masterId } = input;
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

  if (phone) {
    const existing = await prisma.client.findFirst({
      where: { masterId, phone },
    });
    if (existing) return existing;
  }

  if (name && !phone) {
    const existing = await prisma.client.findFirst({
      where: { masterId, name, phone: null },
    });
    if (existing) return existing;
  }

  const created = await prisma.client.create({
    data: {
      masterId,
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
  const before = await prisma.client.findUnique({
    where: { id: clientId },
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
