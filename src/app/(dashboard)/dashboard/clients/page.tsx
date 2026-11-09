import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { getBoardItems } from "@/lib/crm-board";
import type { Metadata } from "next";
import { ClientsList } from "./clients-list";
import { ClientsBoard } from "./clients-board";

export const metadata: Metadata = {
  title: "Клиенты",
};

// Канбан — второй вид для команд; мастеру-одиночке переключатель не показываем.
function ViewToggle({ view }: { view: "list" | "board" }) {
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
      <Link href="/dashboard/clients" className={tab(view === "list")}>
        Список
      </Link>
      <Link href="/dashboard/clients?view=board" className={tab(view === "board")}>
        Канбан
      </Link>
    </div>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const scope = await getScope(master);

  if ((await searchParams).view === "board") {
    const items = await getBoardItems(scope, master.id);
    return (
      <div data-wide-page className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Клиенты</h1>
            <p className="text-sm text-muted-foreground">Всего: {items.length}</p>
          </div>
          <ViewToggle view="board" />
        </div>
        <ClientsBoard initialItems={items} isTeam={scope.isTeam} />
      </div>
    );
  }

  const clients = await prisma.client.findMany({
    where: { ...inScope(scope), deletedAt: null },
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

  return (
    <div className="space-y-4">
      {scope.isTeam && <ViewToggle view="list" />}
      <ClientsList initialItems={items} />
    </div>
  );
}
