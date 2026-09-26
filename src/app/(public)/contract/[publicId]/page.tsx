import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound } from "next/navigation";
import { renderContract } from "@/lib/contract-render";
import { asLang, tFor, localeOf, type Lang } from "@/lib/i18n";
import "@/lib/i18n/contract";
import Link from "next/link";
import type { CalculationResult } from "@/lib/types";
import type { Metadata } from "next";
import { SignSection } from "./sign-section";
import { PrintButton } from "./print-button";
import { CheckCircle2 } from "lucide-react";

// Ссылки на эти страницы уходят клиенту в WhatsApp и живут вечно: если такую
// перешлют в общий чат или выложат в отзыв, поисковик проиндексирует имя,
// телефон, адрес заказчика и сумму сделки. Закрываем от индексации
// (аудит 24.09.2026).
export const robots = { index: false, follow: false };

export const metadata: Metadata = {
  title: "Договор",
};

export default async function ContractPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { publicId } = await params;
  const { lang: langParam } = await searchParams;

  const estimate = await prisma.estimate.findFirst({
    where: { contractPublicId: publicId, deletedAt: null },
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

  // Язык документа: по умолчанию язык мастера, но заказчик может переключить
  // ссылкой ?lang= — у мастера-казаха бывает русскоязычный заказчик и наоборот,
  // а документ, который человек подписывает, он должен читать на своём языке
  // (26.09.2026).
  const lang: Lang = langParam === "ru" || langParam === "kk" ? langParam : asLang(estimate.master.language);
  const t = tFor(lang);
  const otherLang: Lang = lang === "kk" ? "ru" : "kk";

  const calc = estimate.calculationData as unknown as CalculationResult;
  // Подписанный договор рисуем из снимка, сделанного при создании: живой
  // расчёт с тех пор мог измениться, а документ, под которым стоит подпись,
  // меняться не должен — именно за это в суде и бьют (26.09.2026).
  const snap = estimate.contractTextSnapshot as {
    version?: number;
    html?: Record<string, string>;
  } | null;
  const frozenHtml = estimate.contractSignedAt ? snap?.html?.[lang] : undefined;

  // Не подписан — живой текст: типовой или из шаблона мастера (26.09.2026).
  const html = frozenHtml ?? (await renderContract(
    estimate,
    estimate.master,
    {
      publicId: estimate.publicId,
      clientName: estimate.clientName,
      clientPhone: estimate.clientPhone,
      clientAddress: estimate.clientAddress,
      total: estimate.total,
      createdAt: estimate.createdAt,
      // Сроки и схему оплаты мастер задаёт при создании договора, они лежат
      // в базе — но сюда не передавались, и каждый клиент видел «по
      // согласованию Сторон» и жёсткие 50/50 (аудит 24.09.2026).
      workStartDate: estimate.workStartDate,
      workDurationDays: estimate.workDurationDays,
      paymentSchedule: estimate.paymentSchedule as never,
    },
    calc,
    lang,
  )).html;

  const isSigned = !!estimate.contractSignedAt;

  return (
    <div className="min-h-screen bg-gray-100">
      {isSigned && (
        <div className="sticky top-0 z-10 bg-emerald-600 text-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{t("page.ct.signed")}</span>
              {" — "}
              {estimate.contractSignerName} ·{" "}
              {estimate.contractSignedAt?.toLocaleString(localeOf(lang))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 pt-4 flex justify-end gap-2 print:hidden">
        <PrintButton lang={lang} />
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
            <h2 className="text-lg font-bold mb-1">{t("page.ct.signed")}</h2>
            <p className="text-sm text-muted-foreground">
              <strong>{estimate.contractSignerName}</strong>
              {estimate.contractSignerPassport
                ? t("page.idDoc", { v: estimate.contractSignerPassport })
                : ""}
              <br />
              {estimate.contractSignedAt?.toLocaleString(localeOf(lang))}
            </p>
          </div>
        ) : (
          <SignSection publicId={publicId} lang={lang} />
        )}
      </div>
    </div>
  );
}
