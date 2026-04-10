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
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  SquareStack,
  Bot,
  Plus,
  ArrowRight,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Ruler,
} from "lucide-react";
import { formatPrice, formatDateShort } from "@/lib/format";
import { KP_LIMITS } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback-button";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

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
  if (!master) redirect("/api/auth/clear");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    estimatesCount,
    aggregates,
    recentEstimates,
    monthEstimates,
    confirmedCount,
    confirmedSum,
    measurementsCount,
  ] = await Promise.all([
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
    prisma.estimate.count({
      where: { masterId: master.id, createdAt: { gte: monthStart } },
    }),
    prisma.estimate.count({
      where: { masterId: master.id, status: "CONFIRMED" },
    }),
    prisma.estimate.aggregate({
      where: { masterId: master.id, status: "CONFIRMED" },
      _sum: { total: true },
    }),
    prisma.measurementObject.count({
      where: { masterId: master.id },
    }),
  ]);

  const isPro = master.subscriptionTier === "PRO";
  const kpLimit = KP_LIMITS[master.subscriptionTier];
  const kpUsed = master.kpGeneratedThisMonth;
  const kpLeft = isPro ? null : (kpLimit as number) - kpUsed;

  const avgCheck = aggregates._avg.total ?? 0;

  // Show onboarding wizard for new users
  if (!master.onboardingCompleted) {
    return <OnboardingWizard firstName={master.firstName} phone={master.phone} />;
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Привет, {master.firstName}!
        </h1>
        {master.companyName && (
          <p className="text-sm text-muted-foreground mt-0.5">{master.companyName}</p>
        )}
      </div>

      {/* Quick Actions — always visible */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/assistant">
          <Card className="border-[#1e3a5f] bg-[#1e3a5f] text-white h-full hover:bg-[#152d4a] transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col gap-2 h-full">
              <div className="rounded-lg bg-white/15 p-2 w-fit">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">AI Ассистент</p>
                <p className="text-xs text-white/70 mt-0.5 leading-snug">
                  По фото или описанию
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/calculator">
          <Card className="border-[#1e3a5f]/25 bg-[#1e3a5f]/5 h-full hover:bg-[#1e3a5f]/10 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col gap-2 h-full">
              <div className="rounded-lg bg-[#1e3a5f]/15 p-2 w-fit">
                <Plus className="h-5 w-5 text-[#1e3a5f]" />
              </div>
              <div>
                <p className="font-semibold text-sm">Новый расчёт</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Ввод вручную
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {estimatesCount === 0 ? (
        /* Empty state — minimal */
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Расчётов пока нет — создайте первый выше
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Recent Estimates */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
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
            <CardContent className="pt-0 px-4 pb-4">
              <div className="space-y-2">
                {recentEstimates.map((est) => (
                  <Link
                    key={est.id}
                    href={`/dashboard/estimates/${est.id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {est.clientName || "Без имени"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateShort(est.createdAt)} · {est.totalArea.toFixed(1)} м²
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#1e3a5f]">
                          {formatPrice(est.total || est.standardTotal || 0)}
                        </p>
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          {STATUS_LABELS[est.status] ?? est.status}
                        </Badge>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Stats */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#1e3a5f]" />
                Статистика
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <SquareStack className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">За месяц</span>
                  </div>
                  <p className="text-xl font-bold">{monthEstimates}</p>
                  <p className="text-[11px] text-muted-foreground">расчётов (всего {estimatesCount})</p>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Средний чек</span>
                  </div>
                  <p className="text-xl font-bold">
                    {avgCheck > 0 ? formatPrice(avgCheck) : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">за расчёт</p>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-[11px] text-muted-foreground">Подтверждено</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{confirmedCount}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {confirmedSum._sum.total
                      ? `на ${formatPrice(confirmedSum._sum.total)}`
                      : "—"
                    }
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Замеры</span>
                  </div>
                  <p className="text-xl font-bold">{measurementsCount}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {isPro ? "PRO" : `КП: ${kpUsed}/${kpLeft != null && kpLeft <= 0 ? "лимит" : kpLimit}`}
                  </p>
                </div>
              </div>
              {estimatesCount > 0 && confirmedCount > 0 && (
                <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center">
                  <p className="text-sm text-green-800">
                    Конверсия: <span className="font-bold">{Math.round((confirmedCount / estimatesCount) * 100)}%</span>
                    {" "}расчётов подтверждены
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Feedback */}
      <div className="flex justify-center pt-1 pb-4 md:hidden">
        <FeedbackButton variant="compact" />
      </div>
    </div>
  );
}
