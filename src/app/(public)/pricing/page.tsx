import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentConfig } from "@/lib/payment";
import { BILLING_ENABLED, PAYMENTS_OPEN, FREE_OBJECTS_LIMIT, getBillingStatus } from "@/lib/billing";
import { TIPTOP_ENABLED } from "@/lib/tiptop";
import { currencyFor } from "@/lib/company";
import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Тарифы — PotolokAI",
  description:
    "PotolokAI для мастеров натяжных потолков: первые объекты бесплатно, PRO — стартовая цена 1 990 ₸ в месяц до 31 декабря: замер, КП, договор, 3D, ИИ-помощник.",
};

export const dynamic = "force-dynamic";

/**
 * Страница тарифов. Открыта всегда (её смотрит платёжка при подключении),
 * но кнопка «Оплатить» появляется только при PAYMENTS_OPEN (или
 * BILLING_ENABLED) — до этого страница информационная: «пока бесплатно».
 * Картой (виджет TipTop) — когда заданы ключи TIPTOP_*.
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
  // Валюта мастера решает всё на странице (27.10.2026): рублёвому — цены в ₽,
  // без карты TipTop и счёта Kaspi (карты РФ не проходят), а «перевод из России».
  const currency = me ? await currencyFor(me.id).catch(() => "KZT" as const) : "KZT";
  const config = {
    ...getPaymentConfig(currency),
    freeObjects: FREE_OBJECTS_LIMIT,
    billingEnabled: BILLING_ENABLED,
    paymentsOpen: PAYMENTS_OPEN,
    cardEnabled: PAYMENTS_OPEN && TIPTOP_ENABLED && currency !== "RUB",
  };

  if (!me) {
    return <PricingClient mode="public" config={config} master={null} />;
  }

  const master = await prisma.master.findUnique({
    where: { id: me.id },
    select: { id: true, firstName: true, isOwner: true },
  });
  if (!master) redirect("/auth/login");

  const [status, recent] = await Promise.all([
    getBillingStatus(master.id),
    prisma.pendingPayment.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, amount: true, currency: true, status: true, createdAt: true, activatedDays: true, comment: true },
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
      }}
      recentPayments={recent.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        days: p.activatedDays ?? 30,
        // Заявка картой: PENDING = виджет открыли, но не оплатили (не «на проверке»).
        card: p.comment === "Оплата картой (TipTop)",
      }))}
    />
  );
}
