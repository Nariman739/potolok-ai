import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { TrashClient } from "./trash-client";

export const metadata: Metadata = {
  title: "Корзина",
};

// Корзина — точка восстановления для soft-deleted записей (PR-A 2026-06-03).
// Лимит 100 на каждую вкладку — обычно корзина небольшая, а если перегружена
// её можно почистить «Удалить навсегда».
const LIMIT = 100;

export default async function TrashPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const [estimates, clients, measurements, variants] = await Promise.all([
    prisma.estimate.findMany({
      where: { masterId: master.id, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        clientName: true,
        totalArea: true,
        total: true,
        standardTotal: true,
        deletedAt: true,
      },
    }),
    prisma.client.findMany({
      where: { masterId: master.id, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        deletedAt: true,
      },
    }),
    prisma.measurementObject.findMany({
      where: { masterId: master.id, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        address: true,
        totalArea: true,
        deletedAt: true,
      },
    }),
    prisma.priceVariant.findMany({
      where: { masterId: master.id, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        photoUrl: true,
        deletedAt: true,
      },
    }),
  ]);

  const totalCount =
    estimates.length + clients.length + measurements.length + variants.length;

  return (
    <div className="container max-w-5xl py-6">
      <div className="flex items-center gap-3 mb-6">
        <Trash2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Корзина</h1>
          <p className="text-sm text-muted-foreground">
            Удалённые записи можно вернуть. {totalCount === 0 ? "Корзина пуста." : `Всего: ${totalCount}.`}
          </p>
        </div>
      </div>

      <TrashClient
        estimates={estimates.map((e) => ({
          ...e,
          deletedAt: e.deletedAt!.toISOString(),
        }))}
        clients={clients.map((c) => ({
          ...c,
          deletedAt: c.deletedAt!.toISOString(),
        }))}
        measurements={measurements.map((m) => ({
          ...m,
          deletedAt: m.deletedAt!.toISOString(),
        }))}
        variants={variants.map((v) => ({
          ...v,
          deletedAt: v.deletedAt!.toISOString(),
        }))}
      />
    </div>
  );
}
