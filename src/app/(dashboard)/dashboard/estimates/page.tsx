import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { formatPrice, formatDateShort } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Расчёты",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SENT: "Отправлено",
  VIEWED: "Просмотрено",
  CONFIRMED: "Подтверждено",
  REJECTED: "Отклонено",
};

export default async function EstimatesPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/auth/login");

  const estimates = await prisma.estimate.findMany({
    where: { masterId: master.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Расчёты</h1>
          <p className="text-sm text-muted-foreground">
            Всего: {estimates.length}
          </p>
        </div>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152d4a]">
          <Link href="/dashboard/calculator">
            <Plus className="h-4 w-4 mr-2" />
            Новый расчёт
          </Link>
        </Button>
      </div>

      {estimates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-1">Нет расчётов</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Создайте первый расчёт в калькуляторе
            </p>
            <Button asChild className="bg-[#1e3a5f] hover:bg-[#152d4a]">
              <Link href="/dashboard/calculator">Рассчитать</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => (
            <Link
              key={est.id}
              href={`/dashboard/estimates/${est.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {est.clientName || "Без имени"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateShort(est.createdAt)} | {est.totalArea.toFixed(1)} м²
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex gap-2 text-sm mb-1">
                        <span className="text-green-600">
                          {formatPrice(est.economyTotal)}
                        </span>
                        <span className="font-bold text-[#1e3a5f]">
                          {formatPrice(est.standardTotal)}
                        </span>
                        <span className="text-amber-600">
                          {formatPrice(est.premiumTotal)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {STATUS_LABELS[est.status] || est.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
