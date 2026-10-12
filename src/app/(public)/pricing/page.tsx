import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentConfig, getMasterPriceForNextPayment } from "@/lib/payment";
import { BILLING_ENABLED, FREE_OBJECTS_LIMIT, getBillingStatus } from "@/lib/billing";
import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Тарифы — PotolokAI",
  description:
    "PotolokAI для мастеров натяжных потолков: первые объекты бесплатно, PRO 4 990 ₸ в месяц — замер, КП, договор, 3D, ИИ-помощник.",
};

export const dynamic = "force-dynamic";

/**
 * Страница тарифов. Открыта всегда (её смотрит платёжка при подключении),
 * но кнопка «Оплатить» появляется только при BILLING_ENABLED — до этого
 * страница информационная: «пока бесплатно».
 *
 * Из iOS-приложения (кука app_platform=ios) страницу не показываем вовсе —
 * App Store 3.1.1: цены и внешняя оплата из приложения запрещены.
 */
export default async function PricingPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("app_platform")?.value === "ios") {
    redirect("/dashboard");
  }

  const me = await getCurrentMaster();
  const config = { ...getPaymentConfig(), freeObjects: FREE_OBJECTS_LIMIT, billingEnabled: BILLING_ENABLED };

  if (!me) {
    return <PricingClient mode="public" config={config} master={null} />;
  }

  const master = await prisma.master.findUnique({
    where: { id: me.id },
    select: { id: true, firstName: true, isOwner: true, isFounder: true, founderMonthsPaid: true },
  });
  if (!master) redirect("/auth/login");

  const [status, recent] = await Promise.all([
    getBillingStatus(master.id),
    prisma.pendingPayment.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, amount: true, status: true, createdAt: true, activatedDays: true },
    }),
  ]);

  return (
    <PricingClient
      mode="authed"
      config={config}
      master={{
        id: master.id,
        firstName: master.firstName,
        isOwner: master.isOwner,
        status,
        priceMonth: getMasterPriceForNextPayment(master, "month"),
        priceYear: getMasterPriceForNextPayment(master, "year"),
      }}
      recentPayments={recent.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        days: p.activatedDays ?? 30,
      }))}
    />
  );
}
