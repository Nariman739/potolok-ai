import { getCurrentMaster } from "@/lib/auth";
import { replacedDocIds } from "@/lib/estimate-replace";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { nearestPlan, plannedAt, plannedEvents } from "@/lib/crm-calendar";
import { mainObject } from "@/lib/crm-columns";
import { getClientStage } from "@/lib/crm-board";
import { ClientCard } from "./client-card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Клиент",
};

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const { id } = await params;

  const scope = await getScope(master);
  const client = await prisma.client.findFirst({
    where: { id, ...inScope(scope), deletedAt: null },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      estimates: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          publicId: true,
          total: true,
          totalArea: true,
          status: true,
          createdAt: true,
          contractPublicId: true,
          contractCreatedAt: true,
          contractSignedAt: true,
          contractSignerName: true,
        },
      },
      measurements: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        include: {
          rooms: {
            select: {
              id: true,
              name: true,
              area: true,
              photoUrls: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      objectPhotos: {
        orderBy: { takenAt: "desc" },
        select: {
          id: true,
          blobUrl: true,
          category: true,
          caption: true,
          takenAt: true,
        },
      },
    },
  });

  if (!client) notFound();

  const main = mainObject(client.measurements);
  // Этап канбана — тот же расчёт, что на доске; статус в карточке только читается
  const stage = (await getClientStage(client.id)) ?? {
    column: "new" as const,
    objectId: main?.id ?? null,
    installAt: main?.installAt?.toISOString() ?? null,
    address: main?.address || client.address,
  };

  const planClient = {
    id: client.id,
    name: client.name,
    phone: client.phone,
    address: client.address,
    crmColumn: client.crmColumn,
    objectId: main?.id ?? null,
    installAt: main?.installAt?.toISOString() ?? null,
    objectAddress: main?.address ?? null,
    objectCount: client.measurements.length,
    ...plannedEvents(client.events),
  };

  // Договоры (среди КП этого клиента) — для таба «Договор»
  const withContract = client.estimates.filter((e) => e.contractPublicId);
  // Договоры, которые заменены новым вариантом КП (13.11.2026) — «Не действует»
  const replacedContracts = await replacedDocIds(withContract.map((e) => e.id), "contract");
  const contracts = withContract
    .map((e) => ({
      contractReplaced: replacedContracts.has(e.id),
      estimateId: e.id,
      publicId: e.publicId,
      contractPublicId: e.contractPublicId!,
      contractCreatedAt: e.contractCreatedAt
        ? e.contractCreatedAt.toISOString()
        : null,
      contractSignedAt: e.contractSignedAt
        ? e.contractSignedAt.toISOString()
        : null,
      contractSignerName: e.contractSignerName,
      total: e.total,
    }));

  return (
    <ClientCard
      client={{
        id: client.id,
        name: client.name,
        phone: client.phone,
        address: client.address,
        source: client.source,
        status: client.status,
        notes: client.notes,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
      }}
      planClient={planClient}
      stage={stage}
      planned={{ measure: plannedAt(planClient, "measure"), install: plannedAt(planClient, "install") }}
      nearest={nearestPlan(client.events, client.measurements)}
      events={client.events.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
        scheduledAt: e.scheduledAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      }))}
      estimates={client.estimates.map((e) => ({
        id: e.id,
        publicId: e.publicId,
        total: e.total,
        totalArea: e.totalArea,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
      }))}
      measurements={client.measurements.map((m) => ({
        id: m.id,
        address: m.address,
        totalArea: m.totalArea,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        rooms: m.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          area: r.area,
          photoUrls: r.photoUrls,
        })),
      }))}
      photos={client.objectPhotos.map((p) => ({
        id: p.id,
        blobUrl: p.blobUrl,
        category: p.category,
        caption: p.caption,
        takenAt: p.takenAt.toISOString(),
      }))}
      contracts={contracts}
    />
  );
}
