import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BILLING_ENABLED } from "@/lib/billing";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const master = await getCurrentMaster();
  let isOwner = false;
  // На экране первичной настройки нижнее меню только мешает: оно перекрывает
  // кнопки «Далее»/«Пропустить» и уводит мастера с середины настройки.
  let inOnboarding = false;
  if (master) {
    const m = await prisma.master.findUnique({
      where: { id: master.id },
      select: { isOwner: true, paidUntil: true, onboardingCompleted: true },
    });
    isOwner = !!m?.isOwner;

    const h = await headers();
    const path = h.get("x-pathname") ?? h.get("x-invoke-path") ?? "";
    // Визард живёт только на самой /dashboard — на остальных страницах меню нужно.
    inOnboarding = !m?.onboardingCompleted && path === "/dashboard";

    // Гейт подписки: если paidUntil истёк и юзер не owner → /pricing
    // Исключение: страница /dashboard/profile (чтобы юзер мог обновить данные перед оплатой)
    // Пока BILLING_ENABLED=false гейта нет вообще — сервис бесплатный для всех.
    if (BILLING_ENABLED && !isOwner && m?.paidUntil && m.paidUntil < new Date()) {
      const isProfile = path.startsWith("/dashboard/profile");
      if (!isProfile) {
        redirect("/pricing");
      }
    }
  }

  return (
    // На телефоне скроллим саму страницу, а не внутренний контейнер:
    // h-screen + overflow-hidden на мобильном браузере считает 100vh вместе с
    // адресной строкой, из-за чего низ экрана (а с ним кнопки «Далее»,
    // «Сохранить») уезжал под панель браузера и нижнее меню — мастер видел
    // кнопку, тыкал и попадал в навигацию. Внутренний скролл оставляем только
    // на десктопе (md+), где сайдбар должен стоять на месте.
    <div className="flex min-h-[100dvh] md:h-screen md:overflow-hidden">
      <Sidebar isOwner={isOwner} />
      {/* Отступ снизу = высота нижнего меню (64px) + запас + вырез iPhone */}
      <main className="flex-1 md:overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="container mx-auto max-w-5xl p-4 md:p-6">
          {children}
        </div>
      </main>
      {!inOnboarding && <MobileNav />}
    </div>
  );
}
