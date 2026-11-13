import { getCurrentMaster } from "@/lib/auth";
import { isActReplaced, isContractReplaced, otherVariantChosen } from "@/lib/estimate-replace";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import {
  missingContractFields,
} from "@/lib/contract-requirements";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Sparkles } from "lucide-react";
import { formatPrice as formatPriceIn, formatDate, formatArea } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";
import { computeArea } from "@/lib/room-geometry";
import { EstimateActions } from "./estimate-actions";
import { ContractSection } from "./contract-section";
import { ActSection } from "./act-section";
import { ItemsEditor } from "./items-editor";
import { isAppFormatRoom } from "@/lib/room-edit";
import type { RoomInput } from "@/lib/types";

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

  // По компании, как и карточка клиента: иначе КП напарника из неё открывалось бы 404.
  const scope = await getScope(master);
  const [estimate, kpBrief] = await Promise.all([
    prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: { partner: { select: { amount: true, percent: true, coef: true } } },
    }),
    prisma.masterBrief.findUnique({
      where: { masterId: master.id },
      select: { id: true },
    }),
  ]);

  if (!estimate) notFound();

  // Договор и акт оформляются на владельца компании — и готовность проверяем по его реквизитам.
  const requisites = scope.isOwner
    ? master
    : ((await prisma.master.findUnique({ where: { id: scope.ownerId } })) ?? master);

  const hasKpBrief = !!kpBrief;

  const calc = estimate.calculationData as unknown as CalculationResult;
  const savedRooms = estimate.roomsData as unknown as RoomInput[] | null;
  const isAppEstimate = Array.isArray(savedRooms) && savedRooms.some(isAppFormatRoom);
  const statusInfo = STATUS_LABELS[estimate.status] ?? { label: estimate.status, variant: "secondary" as const };
  // Серверный компонент: валюту передаём явно, глобал formatPrice тут не работает (07.10.2026).
  const formatPrice = (n: number) => formatPriceIn(n, master.currency);

  // Не принятое КП, а в объекте выбран другой вариант — договор/акт здесь не действуют (13.11.2026)
  const otherChosen = await otherVariantChosen(prisma, estimate);
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

      {/* KP-конструктор hint: показываем только если ещё не настроен */}
      {!hasKpBrief && (
        <Link
          href="/dashboard/branding"
          className="block rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 px-4 py-3 hover:from-orange-100 hover:to-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-orange-500 p-1.5 flex-shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-900">
                Хочешь чтобы этот PDF был в твоём стиле?
              </p>
              <p className="text-xs text-orange-800/80 mt-0.5">
                Настрой дизайн КП — AI подберёт тему за 2 минуты
              </p>
            </div>
            <span className="text-orange-700 text-sm font-medium flex-shrink-0">→</span>
          </div>
        </Link>
      )}

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

      {/* Actions: на телефоне 3 главных + «Ещё», на широком экране всё в ряд */}
      <EstimateActions
        estimateId={estimate.id}
        publicId={estimate.publicId}
        clientPhone={estimate.clientPhone}
        status={estimate.status}
        validUntil={estimate.validUntil}
        priceView={estimate.priceView}
        recalcHref={isAppEstimate ? null : `/dashboard/calculator?from=${estimate.id}`}
        visualizationHref={`/dashboard/visualization?estimateId=${estimate.id}`}
      />

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
        contractReplaced={isContractReplaced(estimate) || otherChosen}
        otherChosen={otherChosen}
        clientPhone={estimate.clientPhone}
        missingRequisites={missingContractFields(requisites, requisites.currency)}
        defaultPrepaymentPercent={requisites.prepaymentPercent ?? 50}
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
        actReplaced={isActReplaced(estimate) || otherChosen}
        actCompletionDate={estimate.actCompletionDate ? estimate.actCompletionDate.toISOString() : null}
        clientPhone={estimate.clientPhone}
        estimateStatus={estimate.status}
        missingRequisites={missingContractFields(requisites, requisites.currency)}
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
          {estimate.discountAmount > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              Скидка клиенту {estimate.discountPercent > 0 ? `${estimate.discountPercent}% · ` : ""}−{formatPrice(estimate.discountAmount)}
            </p>
          )}
          {/* Посредник — только мастеру. Наценка уже в ценах позиций, клиент её не видит. */}
          {estimate.partner && estimate.partner.amount > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-muted-foreground space-y-0.5">
              <p>Посреднику{estimate.partner.percent ? ` ${estimate.partner.percent}%` : ""}: {formatPrice(estimate.partner.amount)}</p>
              <p>Вам остаётся: <span className="font-semibold text-foreground">{formatPrice((estimate.total || 0) - estimate.partner.amount)}</span></p>
            </div>
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
              partnerCoef={estimate.partner?.coef ?? 1}
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
