import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatPrice, formatDate, formatArea } from "@/lib/format";
import type { CalculationResult } from "@/lib/types";
import type { Metadata } from "next";
import { ConfirmSection } from "./confirm-section";
import { sendTelegramMessage } from "@/lib/telegram";

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
  const areaStr = estimate.totalArea > 0 ? ` | ${formatArea(estimate.totalArea)}` : "";
  return {
    title: `КП от ${company}${areaStr}`,
    description: `Коммерческое предложение на натяжные потолки от ${company}`,
  };
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
          phone: true,
          telegramChatId: true,
        },
      },
    },
  });

  if (!estimate) notFound();

  // Mark as viewed + notify master (best-effort, non-blocking)
  if (estimate.status === "DRAFT" || estimate.status === "SENT") {
    prisma.estimate
      .update({ where: { id: estimate.id }, data: { status: "VIEWED" } })
      .then(() => {
        if (estimate.master.telegramChatId) {
          const clientStr = estimate.clientName || "Клиент";
          const price = estimate.total || estimate.standardTotal || 0;
          const text =
            `👀 <b>${clientStr} открыл ваше КП!</b>\n\n` +
            (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
            `\n<i>Ожидаем подтверждение от клиента.</i>`;
          sendTelegramMessage(estimate.master.telegramChatId, text);
        }
      })
      .catch(() => {});
  }

  const calc = estimate.calculationData as unknown as CalculationResult & { quickEstimate?: boolean };
  const master = estimate.master;
  const company = master.companyName || master.firstName;
  const brandColor = master.brandColor || "#1e3a5f";
  const isQuick = !!(calc as { quickEstimate?: boolean }).quickEstimate;

  const isExpired =
    estimate.validUntil ? new Date(estimate.validUntil) < new Date() : false;
  const isRevised = estimate.status === "REVISED";

  const initials = company
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HERO ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #0f172a 0%, ${brandColor} 100%)`,
        }}
      >
        {/* Dot grid texture */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 text-center py-10 px-6 pb-14">
          {/* Logo / Initials */}
          {master.logoUrl ? (
            <img
              src={master.logoUrl}
              alt={company}
              className="h-20 w-20 rounded-2xl object-cover mx-auto mb-4 ring-4 ring-white/20 shadow-xl"
            />
          ) : (
            <div
              className="inline-flex h-20 w-20 items-center justify-center rounded-2xl text-white font-bold text-2xl mb-4 ring-4 ring-white/20 shadow-xl"
              style={{ backgroundColor: `${brandColor}cc` }}
            >
              {initials}
            </div>
          )}

          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {company}
          </h1>
          <p className="text-white/60 text-xs mt-1 uppercase tracking-widest font-medium">
            Коммерческое предложение
          </p>

          {/* Info pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {estimate.clientName && (
              <span className="bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full border border-white/20">
                👤 {estimate.clientName}
              </span>
            )}
            {!isQuick && estimate.totalArea > 0 && (
              <span className="bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full border border-white/20">
                📐 {formatArea(estimate.totalArea)}
              </span>
            )}
            <span className="bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full border border-white/20">
              📅 {formatDate(estimate.createdAt)}
            </span>
            {estimate.validUntil && (
              <span
                className={`text-sm px-3 py-1.5 rounded-full border backdrop-blur-sm ${
                  isExpired
                    ? "bg-red-500/30 text-red-200 border-red-400/40"
                    : "bg-white/10 text-white border-white/20"
                }`}
              >
                {isExpired
                  ? "⚠️ Срок истёк"
                  : `до ${formatDate(estimate.validUntil)}`}
              </span>
            )}
            {estimate.status === "CONFIRMED" && (
              <span className="bg-emerald-500/30 text-emerald-200 text-sm px-3 py-1.5 rounded-full border border-emerald-400/40">
                Принято
              </span>
            )}
            {isRevised && (
              <span className="bg-orange-500/30 text-orange-200 text-sm px-3 py-1.5 rounded-full border border-orange-400/40">
                Пересмотрено
              </span>
            )}
          </div>

          {/* Price summary */}
          <div className="mt-6 text-center">
            <p className="text-white/50 text-xs mb-0.5">Стоимость</p>
            {estimate.discountPercent > 0 && (
              <p className="text-white/40 text-sm line-through mb-0.5">
                {formatPrice(calc.total)}
              </p>
            )}
            <p className="text-white font-bold text-2xl leading-none">
              {formatPrice(estimate.total || estimate.standardTotal || 0)}
            </p>
            {estimate.discountPercent > 0 && (
              <p className="text-emerald-300 text-xs mt-1">
                Скидка {estimate.discountPercent}%
              </p>
            )}
          </div>
        </div>

        {/* Bottom wave */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full"
          viewBox="0 0 1440 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path d="M0 32L1440 32L1440 8C1200 32 960 8 720 8C480 8 240 32 0 8L0 32Z" fill="#f9fafb" />
        </svg>
      </div>

      {/* ── REVISED BANNER ── */}
      {isRevised && (
        <div className="mx-4 mt-4 rounded-2xl bg-orange-50 border border-orange-200 p-4 text-center">
          <p className="text-orange-700 font-semibold text-base">
            Предложение пересмотрено
          </p>
          <p className="text-orange-600 text-sm mt-1">
            Мастер отправит вам обновлённый расчёт. Это КП больше не действительно.
          </p>
        </div>
      )}

      {/* ── PRICE DETAILS ── */}
      <section className="pt-6 pb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 px-4">
          Стоимость работ
        </h2>
        <ConfirmSection
          estimateId={estimate.id}
          calc={calc}
          total={estimate.total || estimate.standardTotal || 0}
          discountPercent={estimate.discountPercent}
          initialConfirmed={estimate.status === "CONFIRMED"}
          isRevised={isRevised}
          brandColor={brandColor}
        />
      </section>


      {/* ── CONTACT ── */}
      {(master.whatsappPhone || master.phone || master.instagramUrl) && (
        <section className="px-4 pb-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
            <p className="font-semibold text-gray-900 mb-4">
              Остались вопросы?
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {(master.whatsappPhone || master.phone) && (
                <a
                  href={`tel:${(master.whatsappPhone || master.phone)!.replace(/\D/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  📞 Позвонить
                </a>
              )}
              {master.whatsappPhone && (
                <a
                  href={`https://wa.me/${master.whatsappPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  💬 WhatsApp
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
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  📷 Instagram
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="px-4 pb-10 text-center space-y-2">
        <p className="text-xs text-gray-400">
          * Расчёт предварительный. Точная стоимость определяется после замера.
        </p>
        <p className="text-xs font-medium" style={{ color: `${brandColor}99` }}>
          Создано в PotolokAI
        </p>
      </footer>
    </div>
  );
}
