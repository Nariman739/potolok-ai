import { getCurrentMaster } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink, RefreshCcw } from "lucide-react";
import { formatPrice, formatDate, formatArea } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";
import { computeArea } from "@/lib/room-geometry";
import { EstimateActions } from "./estimate-actions";
import { ContractSection } from "./contract-section";
import { ActSection } from "./act-section";
import { ItemsEditor } from "./items-editor";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { label: "Черновик", variant: "secondary" },
  SENT: { label: "Отправлено", variant: "outline" },
  VIEWED: { label: "Просмотрено", variant: "outline" },
  CONFIRMED: { label: "Подтверждено ✓", variant: "default" },
  REJECTED: { label: "Отклонено", variant: "destructive" },
  REVISED: { label: "Пересмотрено", variant: "secondary" },
};


export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const { id } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { id, masterId: master.id },
  });

  if (!estimate) notFound();

  const calc = estimate.calculationData as unknown as CalculationResult;
  const statusInfo = STATUS_LABELS[estimate.status] ?? { label: estimate.status, variant: "secondary" as const };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/estimates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {estimate.clientName || "Расчёт"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(estimate.createdAt)}{estimate.totalArea > 0 ? ` | ${formatArea(estimate.totalArea)}` : ""}
          </p>
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Confirmed banner */}
      {estimate.status === "CONFIRMED" && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3">
          <span className="text-green-600 text-lg">&#x2705;</span>
          <div>
            <p className="text-sm font-semibold text-green-800">
              Клиент принял КП
            </p>
            <p className="text-xs text-green-700">
              Свяжитесь с клиентом для согласования замера
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" asChild>
          <a href={`/kp/${estimate.publicId}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Открыть КП
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/calculator?from=${estimate.id}`}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Пересчитать
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/ai-render?estimateId=${estimate.id}`}>
            ✨ AI-фото
          </Link>
        </Button>
        <EstimateActions
          estimateId={estimate.id}
          publicId={estimate.publicId}
          clientPhone={estimate.clientPhone}
          status={estimate.status}
          contractConfigured={!!master.contractType && master.contractType !== "none"}
          validUntil={estimate.validUntil}
        />
      </div>

      {/* Client info */}
      {(estimate.clientName || estimate.clientPhone || estimate.clientAddress) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Клиент</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {estimate.clientName && (
              <p className="font-medium">{estimate.clientName}</p>
            )}
            {estimate.clientPhone && (
              <p className="text-sm text-muted-foreground">{estimate.clientPhone}</p>
            )}
            {estimate.clientAddress && (
              <p className="text-sm text-muted-foreground">{estimate.clientAddress}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Электронный договор */}
      <ContractSection
        estimateId={estimate.id}
        contractPublicId={estimate.contractPublicId}
        contractCreatedAt={estimate.contractCreatedAt ? estimate.contractCreatedAt.toISOString() : null}
        contractSignedAt={estimate.contractSignedAt ? estimate.contractSignedAt.toISOString() : null}
        contractSignerName={estimate.contractSignerName}
        clientPhone={estimate.clientPhone}
        contractConfigured={!!master.contractType && master.contractType !== "none"}
        defaultPrepaymentPercent={master.prepaymentPercent ?? 50}
        workStartDate={estimate.workStartDate ? estimate.workStartDate.toISOString() : null}
        workDurationDays={estimate.workDurationDays}
        paymentSchedule={
          Array.isArray(estimate.paymentSchedule)
            ? (estimate.paymentSchedule as unknown as { name: string; percent: number; when: string }[])
            : null
        }
      />

      <ActSection
        estimateId={estimate.id}
        actPublicId={estimate.actPublicId}
        actCreatedAt={estimate.actCreatedAt ? estimate.actCreatedAt.toISOString() : null}
        actSignedAt={estimate.actSignedAt ? estimate.actSignedAt.toISOString() : null}
        actSignerName={estimate.actSignerName}
        actCompletionDate={estimate.actCompletionDate ? estimate.actCompletionDate.toISOString() : null}
        clientPhone={estimate.clientPhone}
        estimateStatus={estimate.status}
        contractConfigured={!!master.contractType && master.contractType !== "none"}
      />

      {/* Total summary */}
      <Card className="border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20">
        <CardContent className="pt-4 pb-4 bg-blue-50">
          <span className="font-semibold text-[#1e3a5f]">Итого</span>
          <p className="text-2xl font-bold">{formatPrice(estimate.total || estimate.standardTotal || 0)}</p>
          {estimate.totalArea > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatPrice(Math.round((estimate.total || estimate.standardTotal || 0) / estimate.totalArea))}/м²
            </p>
          )}
        </CardContent>
      </Card>

      {/* Room details with line items */}
      {(() => {
        // Support both new (roomResults) and old (variants) format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const roomResults = calc?.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
        const extraItems = calc?.extraItems ?? [];
        if (roomResults.length > 0) {
          return (
            <ItemsEditor
              estimateId={estimate.id}
              initialRoomResults={roomResults}
              initialExtraItems={extraItems}
            />
          );
        }
        if (!calc?.rooms?.length) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Детализация работ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {calc.rooms.map((room, i) => (
                <div key={i} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span>
                    {room.name} — {(room.shape === "l-shape" || room.shape === "t-shape")
                      ? (room.shape === "l-shape" ? "Г-образная" : "Т-образная")
                      : `${Math.round(room.length * 100)}×${Math.round(room.width * 100)} см`}
                  </span>
                  <span className="text-muted-foreground">{computeArea(room).toFixed(1)} м²</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      <Separator />

      <p className="text-xs text-muted-foreground text-center">
        * Расчёт предварительный. Точная стоимость определяется после замера.
      </p>
    </div>
  );
}
