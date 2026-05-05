import { prisma } from "./prisma";
import type { ClientSource, DealStatus, EventType } from "@/generated/prisma/client";

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
  source?: ClientSource | null;
};

export async function getOrCreateClient(input: GetOrCreateClientInput) {
  const { masterId } = input;
  const name = (input.name ?? "").trim();
  const phone = normalizePhone(input.phone);
  const address = input.address?.trim() || null;

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
