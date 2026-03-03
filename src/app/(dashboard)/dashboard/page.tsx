import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  SquareStack,
  TrendingUp,
  BarChart3,
  Bot,
  Plus,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { formatPrice, formatDateShort } from "@/lib/format";
import { KP_LIMITS } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback-button";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";
import { GettingStarted } from "@/components/onboarding/getting-started";

export const metadata = {
  title: "Дашборд",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SENT: "Отправлено",
  VIEWED: "Просмотрено",
  CONFIRMED: "Подтверждено",
  REJECTED: "Отклонено",
};

export default async function DashboardPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/auth/login");

  const todayStr = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const [estimatesCount, aggregates, recentEstimates] = await Promise.all([
    prisma.estimate.count({ where: { masterId: master.id } }),
    prisma.estimate.aggregate({
      where: { masterId: master.id },
      _sum: { totalArea: true },
      _avg: { total: true },
    }),
    prisma.estimate.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        publicId: true,
        clientName: true,
        totalArea: true,
        total: true,
        standardTotal: true,
        createdAt: true,
        status: true,
      },
    }),
  ]);

  const isPro = master.subscriptionTier === "PRO";
  const kpLimit = KP_LIMITS[master.subscriptionTier];
  const kpUsed = master.kpGeneratedThisMonth;
  const kpLeft = isPro ? null : (kpLimit as number) - kpUsed;
  const kpProgress = isPro ? 100 : Math.min(100, (kpUsed / (kpLimit as number)) * 100);

  const totalArea = aggregates._sum.totalArea ?? 0;
  const avgCheck = aggregates._avg.total ?? 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="capitalize">{todayStr}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Привет, {master.firstName}! 👋
        </h1>
        {master.companyName && (
          <p className="text-sm text-muted-foreground">{master.companyName}</p>
        )}
      </div>

      {estimatesCount === 0 ? (
        <>
          <GettingStarted firstName={master.firstName} />
          <WelcomeModal isNewUser />
        </>
      ) : (
        <>
          {/* Stats 2x2 */}
          <div className="grid grid-cols-2 gap-4">
            {/* КП за месяц */}
            <Card className="border-[#1e3a5f]/20">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="rounded-lg bg-[#1e3a5f]/10 p-2">
                    <FileText className="h-4 w-4 text-[#1e3a5f]" />
                  </div>
                  <Badge
                    variant={isPro ? "default" : "secondary"}
                    className="text-[10px] px-1.5"
                  >
                    {isPro ? "PRO ∞" : "FREE"}
                  </Badge>
                </div>
                <p className="text-2xl font-bold">
                  {isPro ? "∞" : `${kpUsed} / ${kpLimit}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  КП за этот месяц
                </p>
                {!isPro && (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${kpProgress}%`,
                          backgroundColor: kpProgress >= 100 ? "#ef4444" : "#1e3a5f",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {(kpLeft ?? 0) > 0
                        ? `Осталось ${kpLeft} из ${kpLimit}`
                        : "Лимит исчерпан — перейди на PRO"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Расчётов в базе */}
            <Link href="/dashboard/estimates">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="rounded-lg bg-blue-50 p-2 w-fit mb-3">
                    <SquareStack className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold">{estimatesCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Расчётов в базе
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Общая площадь */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="rounded-lg bg-emerald-50 p-2 w-fit mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold">
                  {totalArea > 0 ? `${totalArea.toFixed(0)} м²` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Общая площадь за всё время
                </p>
              </CardContent>
            </Card>

            {/* Средний чек */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="rounded-lg bg-amber-50 p-2 w-fit mb-3">
                  <BarChart3 className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-2xl font-bold">
                  {avgCheck > 0 ? formatPrice(avgCheck) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Средний чек
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-[#1e3a5f] bg-[#1e3a5f] text-white">
              <CardContent className="pt-5 pb-4 flex flex-col gap-3">
                <div className="rounded-lg bg-white/10 p-2 w-fit">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold">AI Ассистент</p>
                  <p className="text-xs text-white/70 mt-0.5">
                    Расчёт по фото или описанию
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  className="w-fit bg-white text-[#1e3a5f] hover:bg-white/90"
                >
                  <Link href="/dashboard/assistant">
                    Открыть <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-[#1e3a5f]/20 bg-[#1e3a5f]/5">
              <CardContent className="pt-5 pb-4 flex flex-col gap-3">
                <div className="rounded-lg bg-[#1e3a5f]/10 p-2 w-fit">
                  <Plus className="h-5 w-5 text-[#1e3a5f]" />
                </div>
                <div>
                  <p className="font-semibold">Новый расчёт</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ввод вручную с выбором комплектующих
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="w-fit bg-[#1e3a5f] hover:bg-[#152d4a] text-white"
                >
                  <Link href="/dashboard/calculator">
                    Рассчитать <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Estimates */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Последние расчёты</CardTitle>
                <Link
                  href="/dashboard/estimates"
                  className="text-xs text-[#1e3a5f] hover:underline flex items-center gap-0.5"
                >
                  Все <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {recentEstimates.map((est) => (
                  <Link
                    key={est.id}
                    href={`/dashboard/estimates/${est.id}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {est.clientName || "Без имени"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateShort(est.createdAt)} · {est.totalArea.toFixed(1)} м²
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#1e3a5f]">
                          {formatPrice(est.total || est.standardTotal || 0)}
                        </p>
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          {STATUS_LABELS[est.status] ?? est.status}
                        </Badge>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Feedback - visible on mobile where sidebar is hidden */}
      <div className="flex justify-center pt-2 pb-4 md:hidden">
        <FeedbackButton variant="compact" />
      </div>
    </div>
  );
}
