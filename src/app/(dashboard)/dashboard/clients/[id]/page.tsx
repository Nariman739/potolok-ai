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
        },
      },
    },
  });

  if (!client) notFound();

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
    />
  );
}
