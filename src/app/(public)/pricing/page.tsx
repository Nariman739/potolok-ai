import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentConfig, getMasterPriceForNextPayment, FOUNDER_DISCOUNT_MONTHS } from "@/lib/payment";
import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Тарифы — PotolokAI",
  description: "Подписка PotolokAI: расчёт по фото, КП, договоры, AI-помощник для мастеров натяжных потолков",
};

export default async function PricingPage() {
  const me = await getCurrentMaster();

  // Без логина — показываем публичные карточки
  if (!me) {
    const cfg = getPaymentConfig();
    return (
      <PricingClient
        mode="public"
        config={cfg}
        master={null}
      />
    );
  }

  const master = await prisma.master.findUnique({
    where: { id: me.id },
    select: {
      id: true,
      firstName: true,
      email: true,
      phone: true,
      paidUntil: true,
      subscriptionTier: true,
      isOwner: true,
      monthlyPrice: true,
      isFounder: true,
      founderActivatedAt: true,
      founderMonthsPaid: true,
      welcomeSent: true,
    },
  });

  if (!master) {
    redirect("/auth/login");
  }

  const recent = await prisma.pendingPayment.findMany({
    where: { masterId: master.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      amount: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
    },
  });

  const nextAmount = getMasterPriceForNextPayment(master);
  const founderRemaining = master.isFounder
    ? Math.max(0, FOUNDER_DISCOUNT_MONTHS - master.founderMonthsPaid)
    : 0;

  return (
    <PricingClient
      mode="authed"
      config={getPaymentConfig()}
      master={{
        id: master.id,
        firstName: master.firstName,
        email: master.email,
        phone: master.phone,
        paidUntil: master.paidUntil ? master.paidUntil.toISOString() : null,
        subscriptionTier: master.subscriptionTier,
        isFounder: master.isFounder,
        founderMonthsPaid: master.founderMonthsPaid,
        founderRemaining,
        monthlyPrice: master.monthlyPrice,
        nextAmount,
        isOwner: master.isOwner,
      }}
      recentPayments={recent.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
      }))}
    />
  );
}
