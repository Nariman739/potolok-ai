import { getCurrentMaster } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Share2,
  ExternalLink,
} from "lucide-react";
import { formatPrice, formatDate, formatArea } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/auth/login");

  const { id } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { id, masterId: master.id },
  });

  if (!estimate) notFound();

  const calc = estimate.calculationData as unknown as CalculationResult;
  const publicUrl = `/kp/${estimate.publicId}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/estimates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {estimate.clientName || "Расчёт"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(estimate.createdAt)} | {formatArea(estimate.totalArea)}
          </p>
        </div>
        <Badge variant="secondary">
          {estimate.status === "DRAFT" ? "Черновик" : estimate.status === "VIEWED" ? "Просмотрено" : estimate.status}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" asChild>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Открыть КП
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {}}
          className="cursor-pointer"
          asChild
        >
          <button
            type="button"
            onClick={() => {
              // Client-side copy to clipboard will be handled by a client component
            }}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Скопировать ссылку
          </button>
        </Button>
      </div>

      {/* Client info */}
      {(estimate.clientName || estimate.clientPhone) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Клиент</CardTitle>
          </CardHeader>
          <CardContent>
            {estimate.clientName && <p className="font-medium">{estimate.clientName}</p>}
            {estimate.clientPhone && (
              <p className="text-sm text-muted-foreground">{estimate.clientPhone}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3 Variants summary */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Эконом", total: estimate.economyTotal, color: "text-green-600", bg: "bg-green-50" },
          { label: "Стандарт", total: estimate.standardTotal, color: "text-[#1e3a5f]", bg: "bg-blue-50", hit: true },
          { label: "Премиум", total: estimate.premiumTotal, color: "text-amber-600", bg: "bg-amber-50" },
        ].map((v) => (
          <Card key={v.label} className={v.hit ? "ring-2 ring-[#1e3a5f]/20" : ""}>
            <CardContent className={`pt-4 pb-4 ${v.bg}`}>
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${v.color}`}>{v.label}</span>
                {v.hit && <Badge className="bg-[#1e3a5f] text-xs">ХИТ</Badge>}
              </div>
              <p className="text-2xl font-bold mt-1">{formatPrice(v.total)}</p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(Math.round(v.total / estimate.totalArea))}/м²
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rooms */}
      {calc?.rooms && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Помещения ({calc.rooms.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {calc.rooms.map((room, i) => (
                <div key={i} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span>
                    {room.name} — {room.length}×{room.width}м
                  </span>
                  <span className="text-muted-foreground">
                    {(room.length * room.width).toFixed(1)} м²
                    {room.spotsCount > 0 && ` | ${room.spotsCount} спотов`}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <p className="text-xs text-muted-foreground text-center">
        * Расчёт предварительный. Точная стоимость определяется после замера.
      </p>
    </div>
  );
}
