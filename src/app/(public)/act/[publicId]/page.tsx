import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound } from "next/navigation";
import { generateActHtml } from "@/lib/contract-html";
import { asLang, tFor, localeOf, type Lang } from "@/lib/i18n";
import "@/lib/i18n/contract";
import Link from "next/link";
import type { CalculationResult } from "@/lib/types";
import type { Metadata } from "next";
import { ActSignSection } from "./sign-section";
import { CheckCircle2 } from "lucide-react";

// Ссылки на эти страницы уходят клиенту в WhatsApp и живут вечно: если такую
// перешлют в общий чат или выложат в отзыв, поисковик проиндексирует имя,
// телефон, адрес заказчика и сумму сделки. Закрываем от индексации
// (аудит 24.09.2026).
export const robots = { index: false, follow: false };

export const metadata: Metadata = {
  title: "Акт выполненных работ",
};

export default async function ActPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { publicId } = await params;
  const { lang: langParam } = await searchParams;

  const estimate = await prisma.estimate.findFirst({
    where: { actPublicId: publicId, deletedAt: null },
    include: {
      master: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          phone: true,
          whatsappPhone: true,
          address: true,
          contractType: true,
          bin: true,
          iin: true,
          legalName: true,
          legalAddress: true,
          bankName: true,
          iban: true,
          kbe: true,
          bik: true,
          passportData: true,
          prepaymentPercent: true,
          warrantyMaterials: true,
          warrantyInstall: true,
          contractCity: true,
          language: true,
        },
      },
    },
  });

  if (!estimate) notFound();
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master);

  // Язык акта — как и у договора: язык мастера, но заказчик переключает сам
  // ссылкой ?lang= (26.09.2026).
  const lang: Lang = langParam === "ru" || langParam === "kk" ? langParam : asLang(estimate.master.language);
  const t = tFor(lang);
  const otherLang: Lang = lang === "kk" ? "ru" : "kk";

  const calc = estimate.calculationData as unknown as CalculationResult;
  const html = generateActHtml(
    estimate.master,
    {
      publicId: estimate.publicId,
      clientName: estimate.actSignerName || estimate.clientName,
      clientPhone: estimate.clientPhone,
      clientAddress: estimate.clientAddress,
      total: estimate.total,
      createdAt: estimate.actCompletionDate ?? estimate.createdAt,
    },
    calc,
    lang,
  );

  const isSigned = !!estimate.actSignedAt;

  return (
    <div className="min-h-screen bg-gray-100">
      {isSigned && (
        <div className="sticky top-0 z-10 bg-emerald-600 text-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{t("page.act.signed")}</span>
              {" — "}
              {estimate.actSignerName} ·{" "}
              {estimate.actSignedAt?.toLocaleString(localeOf(lang))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 pt-4 flex justify-end">
        <Link
          href={`?lang=${otherLang}`}
          prefetch={false}
          className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {t(`ct.lang.${otherLang}`)}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-4">
        <div
          className="bg-white shadow-sm rounded-lg overflow-hidden"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-3 pb-10">
        {isSigned ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold mb-1">{t("page.act.signed")}</h2>
            <p className="text-sm text-muted-foreground">
              <strong>{estimate.actSignerName}</strong>
              <br />
              {estimate.actSignedAt?.toLocaleString(localeOf(lang))}
            </p>
          </div>
        ) : (
          <ActSignSection publicId={publicId} lang={lang} />
        )}
      </div>
    </div>
  );
}
