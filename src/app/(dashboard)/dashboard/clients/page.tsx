import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { ClientsList } from "./clients-list";

export const metadata: Metadata = {
  title: "Клиенты",
};

export default async function ClientsPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const clients = await prisma.client.findMany({
    where: { masterId: master.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      source: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { estimates: true, events: true } },
      estimates: { select: { total: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { type: true, content: true, createdAt: true },
      },
    },
  });

  const items = clients.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    source: c.source,
    status: c.status,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    estimatesCount: c._count.estimates,
    totalSum: c.estimates.reduce((acc, e) => acc + (e.total || 0), 0),
    lastEvent: c.events[0]
      ? {
          type: c.events[0].type,
          content: c.events[0].content,
          createdAt: c.events[0].createdAt.toISOString(),
        }
      : null,
  }));

  return <ClientsList initialItems={items} />;
}
