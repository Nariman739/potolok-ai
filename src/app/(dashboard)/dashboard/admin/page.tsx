import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import type { Metadata } from "next";
import { AdminPanel } from "./admin-panel";

export const metadata: Metadata = {
  title: "Админ-панель",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const me = await prisma.master.findUnique({
    where: { id: master.id },
    select: { isOwner: true },
  });

  if (!me?.isOwner) {
    redirect("/dashboard");
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const masters = await prisma.master.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      phone: true,
      email: true,
      subscriptionTier: true,
      paidUntil: true,
      billingNotes: true,
      kpGeneratedThisMonth: true,
      isOwner: true,
      createdAt: true,
      _count: { select: { estimates: true, clients: true } },
    },
  });

  const summary = {
    total: masters.length,
    free: masters.filter((m) => m.subscriptionTier === "FREE").length,
    pro: masters.filter((m) => m.subscriptionTier === "PRO").length,
    proPlus: masters.filter((m) => m.subscriptionTier === "PROPLUS").length,
    paid: masters.filter(
      (m) => m.paidUntil && new Date(m.paidUntil) > new Date(),
    ).length,
  };

  return (
    <AdminPanel
      summary={summary}
      masters={masters.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        companyName: m.companyName,
        phone: m.phone,
        email: m.email,
        subscriptionTier: m.subscriptionTier,
        paidUntil: m.paidUntil ? m.paidUntil.toISOString() : null,
        billingNotes: m.billingNotes,
        kpGeneratedThisMonth: m.kpGeneratedThisMonth,
        isOwner: m.isOwner,
        createdAt: m.createdAt.toISOString(),
        estimatesCount: m._count.estimates,
        clientsCount: m._count.clients,
      }))}
    />
  );
}
