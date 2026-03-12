import { getCurrentMaster } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Bot, Calculator } from "lucide-react";
import type { Metadata } from "next";
import { EstimatesList } from "./estimates-list";

export const metadata: Metadata = {
  title: "Расчёты",
};

export default async function EstimatesPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const estimates = await prisma.estimate.findMany({
    where: { masterId: master.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientName: true,
      createdAt: true,
      totalArea: true,
      total: true,
      standardTotal: true,
      status: true,
    },
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
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="rounded-2xl bg-[#1e3a5f]/10 p-4">
              <FileText className="h-8 w-8 text-[#1e3a5f]" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Пока нет расчётов</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Создайте первый расчёт через AI Ассистент (по фото или тексту) или Калькулятор (ручной ввод)
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="bg-[#1e3a5f] hover:bg-[#152d4a]">
                <Link href="/dashboard/assistant">
                  <Bot className="h-4 w-4 mr-2" />
                  AI Ассистент
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/calculator">
                  <Calculator className="h-4 w-4 mr-2" />
                  Калькулятор
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Цены по умолчанию уже настроены — можно считать сразу
            </p>
          </CardContent>
        </Card>
      ) : (
        <EstimatesList estimates={estimates} />
      )}
    </div>
  );
}
