import { getCurrentMaster } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

  const client = await prisma.client.findFirst({
    where: { id, masterId: master.id },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      estimates: {
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

  // Договоры (среди КП этого клиента) — для таба «Договор»
  const contracts = client.estimates
    .filter((e) => e.contractPublicId)
    .map((e) => ({
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
      events={client.events.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
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
