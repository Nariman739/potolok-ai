import Link from "next/link";
import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, FileText, DollarSign, Plus } from "lucide-react";
import { formatPrice, formatDateShort } from "@/lib/format";
import { KP_LIMITS } from "@/lib/constants";

export const metadata = {
  title: "Личный кабинет",
};

export default async function DashboardPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/auth/login");

  const [estimatesCount, recentEstimates] = await Promise.all([
    prisma.estimate.count({ where: { masterId: master.id } }),
    prisma.estimate.findMany({
      where: { masterId: master.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const kpLimit = KP_LIMITS[master.subscriptionTier];
  const kpRemaining = kpLimit === Infinity ? "∞" : kpLimit - master.kpGeneratedThisMonth;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Привет, {master.firstName}! 👋
        </h1>
        <p className="text-muted-foreground">
          {master.companyName || "Ваш личный кабинет"}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[#1e3a5f]/10 p-2">
                <FileText className="h-5 w-5 text-[#1e3a5f]" />
              </div>
              <div>
                <p className="text-2xl font-bold">{estimatesCount}</p>
                <p className="text-xs text-muted-foreground">Расчётов</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <Calculator className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{String(kpRemaining)}</p>
                <p className="text-xs text-muted-foreground">КП осталось</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <Badge variant={master.subscriptionTier === "PRO" ? "default" : "secondary"}>
                  {master.subscriptionTier === "PRO" ? "PRO" : "FREE"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Тариф</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <Card className="border-[#1e3a5f]/20 bg-[#1e3a5f]/5">
        <CardContent className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">Новый расчёт</h3>
            <p className="text-sm text-muted-foreground">
              Добавьте комнаты и получите 3 варианта стоимости
            </p>
          </div>
          <Button asChild size="lg" className="bg-[#1e3a5f] hover:bg-[#152d4a]">
            <Link href="/dashboard/calculator">
              <Plus className="h-4 w-4 mr-2" />
              Рассчитать
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Estimates */}
      {recentEstimates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Последние расчёты</CardTitle>
            <CardDescription>
              <Link href="/dashboard/estimates" className="text-[#1e3a5f] hover:underline">
                Все расчёты →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentEstimates.map((est) => (
                <Link
                  key={est.id}
                  href={`/dashboard/estimates/${est.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {est.clientName || "Без имени"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(est.createdAt)} · {est.totalArea.toFixed(1)} м²
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#1e3a5f]">
                      {formatPrice(est.standardTotal)}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {est.status === "DRAFT"
                        ? "Черновик"
                        : est.status === "SENT"
                        ? "Отправлено"
                        : est.status === "VIEWED"
                        ? "Просмотрено"
                        : est.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
