import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import type { Metadata } from "next";
import { PaymentsAdminClient } from "./payments-admin-client";

export const metadata: Metadata = {
  title: "Оплаты — Админ",
};

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const me = await prisma.master.findUnique({
    where: { id: master.id },
    select: { isOwner: true },
  });
  if (!me?.isOwner) redirect("/dashboard");

  const payments = await prisma.pendingPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      master: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          companyName: true,
          subscriptionTier: true,
          paidUntil: true,
          isFounder: true,
          founderMonthsPaid: true,
        },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Оплаты</h1>
        <Link href="/dashboard/admin" className="text-sm text-muted-foreground hover:underline">
          ← К админ-панели
        </Link>
      </div>
      <PaymentsAdminClient
        payments={payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          promocode: p.promocode,
          screenshotUrl: p.screenshotUrl,
          comment: p.comment,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
          activatedDays: p.activatedDays,
          master: {
            id: p.master.id,
            name: `${p.master.firstName ?? ""} ${p.master.lastName ?? ""}`.trim(),
            phone: p.master.phone,
            email: p.master.email,
            companyName: p.master.companyName,
            subscriptionTier: p.master.subscriptionTier,
            paidUntil: p.master.paidUntil ? p.master.paidUntil.toISOString() : null,
            isFounder: p.master.isFounder,
            founderMonthsPaid: p.master.founderMonthsPaid,
          },
        }))}
      />
    </div>
  );
}
