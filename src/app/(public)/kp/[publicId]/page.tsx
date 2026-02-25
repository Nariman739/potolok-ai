import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice, formatDate, formatArea } from "@/lib/format";
import type { CalculationResult, Variant } from "@/lib/types";
import type { Metadata } from "next";
import { ConfirmButton } from "./confirm-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const estimate = await prisma.estimate.findUnique({
    where: { publicId },
    include: { master: { select: { companyName: true, firstName: true } } },
  });

  if (!estimate) return { title: "КП не найдено" };

  const company = estimate.master.companyName || estimate.master.firstName;
  return {
    title: `КП от ${company} | ${formatArea(estimate.totalArea)}`,
    description: `Коммерческое предложение на натяжные потолки от ${company}`,
  };
}

function VariantBlock({ variant }: { variant: Variant }) {
  const isHit = variant.type === "standard";
  const colors = {
    economy: { accent: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
    standard: { accent: "text-[#1e3a5f]", bg: "bg-blue-50", border: "border-[#1e3a5f]" },
    premium: { accent: "text-amber-600", bg: "bg-amber-50", border: "border-amber-300" },
  }[variant.type];

  return (
    <Card className={`${colors.border} ${isHit ? "ring-2 ring-[#1e3a5f]/20" : ""}`}>
      {isHit && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-[#1e3a5f]">ХИТ</Badge>
        </div>
      )}
      <CardHeader className={`pb-3 ${colors.bg} relative`}>
        <CardTitle className={`text-lg ${colors.accent}`}>{variant.label}</CardTitle>
        <p className="text-2xl sm:text-3xl font-bold">{formatPrice(variant.total)}</p>
        <p className="text-sm text-muted-foreground">{formatPrice(variant.pricePerM2)}/м²</p>
      </CardHeader>
      <CardContent className="pt-3">
        {variant.rooms.map((rv) => (
          <div key={rv.roomId} className="mb-3 last:mb-0">
            <p className="font-medium text-sm mb-1">{rv.roomName}</p>
            {rv.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs text-muted-foreground">
                <span>{item.itemName}</span>
                <span>{formatPrice(item.total)}</span>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function PublicKpPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const estimate = await prisma.estimate.findUnique({
    where: { publicId },
    include: {
      master: {
        select: {
          firstName: true,
          companyName: true,
          brandColor: true,
          logoUrl: true,
          instagramUrl: true,
          whatsappPhone: true,
        },
      },
    },
  });

  if (!estimate) notFound();

  // Mark as viewed
  if (estimate.status === "DRAFT" || estimate.status === "SENT") {
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: "VIEWED" },
    });
  }

  const effectiveStatus =
    estimate.status === "DRAFT" || estimate.status === "SENT"
      ? "VIEWED"
      : estimate.status;

  const calc = estimate.calculationData as unknown as CalculationResult;
  const master = estimate.master;
  const company = master.companyName || master.firstName;

  const isExpired =
    estimate.validUntil ? new Date(estimate.validUntil) < new Date() : false;

  // Initials: first letter of each word, max 2
  const initials = company
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        {master.logoUrl ? (
          <img
            src={master.logoUrl}
            alt={company}
            className="h-16 w-16 rounded-xl object-cover mx-auto mb-3"
          />
        ) : (
          <div
            className="inline-flex h-16 w-16 items-center justify-center rounded-xl text-white font-bold text-xl mb-3"
            style={{ backgroundColor: master.brandColor }}
          >
            {initials}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-bold">{company}</h1>
        <p className="text-muted-foreground">Коммерческое предложение</p>
        <p className="text-sm text-muted-foreground mt-1">
          {formatDate(estimate.createdAt)} | {formatArea(estimate.totalArea)}
        </p>
        {estimate.clientName && (
          <p className="text-sm mt-2">
            Для: <span className="font-medium">{estimate.clientName}</span>
          </p>
        )}
        {estimate.validUntil && (
          <p
            className={`text-sm mt-2 font-medium ${
              isExpired ? "text-red-500" : "text-muted-foreground"
            }`}
          >
            {isExpired
              ? "Срок предложения истёк"
              : `Действительно до ${formatDate(estimate.validUntil)}`}
          </p>
        )}
      </div>

      {/* Rooms */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Помещения</CardTitle>
        </CardHeader>
        <CardContent>
          {calc.rooms.map((room, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:justify-between text-sm py-2 border-b last:border-0 gap-0.5"
            >
              <span className="font-medium">{room.name}</span>
              <span className="text-muted-foreground">
                {room.length}×{room.width}м = {(room.length * room.width).toFixed(1)} м²
              </span>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-sm pt-3 mt-1 border-t">
            <span>Итого</span>
            <span>{formatArea(estimate.totalArea)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Variants */}
      <h2 className="text-xl font-bold mb-4">Варианты стоимости</h2>
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {calc.variants.map((v) => (
          <VariantBlock key={v.type} variant={v} />
        ))}
      </div>

      {/* Confirm button */}
      <div className="text-center my-8">
        <ConfirmButton
          estimateId={estimate.id}
          initialConfirmed={effectiveStatus === "CONFIRMED"}
        />
      </div>

      <Separator className="my-6" />

      {/* Contact */}
      <div className="text-center space-y-3">
        <h3 className="font-semibold text-lg">Связаться</h3>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
          {master.whatsappPhone && (
            <a
              href={`tel:${master.whatsappPhone}`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              📞 Позвонить
            </a>
          )}
          {master.whatsappPhone && (
            <a
              href={`https://wa.me/${master.whatsappPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm hover:bg-green-700 transition-colors"
            >
              WhatsApp
            </a>
          )}
          {master.instagramUrl && (
            <a
              href={
                master.instagramUrl.startsWith("http")
                  ? master.instagramUrl
                  : `https://instagram.com/${master.instagramUrl.replace("@", "")}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              📷 Instagram
            </a>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          * Расчёт предварительный. Точная стоимость после замера.
        </p>
        <p className="text-xs text-muted-foreground/40 mt-3">Создано в PotolokAI</p>
      </div>
    </div>
  );
}
