import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound } from "next/navigation";
import { CONTRACT_MASTER_SELECT, contractHash, renderLiveContract } from "@/lib/contract-render";
import { CONTRACT_DOC_CLASS, contractView } from "@/lib/contract-view";
import { asLang, localeOf, type Lang } from "@/lib/i18n";
import { contractT } from "@/lib/i18n/contract";
import Link from "next/link";
import type { Metadata } from "next";
import { brandedDocMetadata, DOC_ROBOTS } from "@/lib/doc-og";
import { SignSection } from "./sign-section";
import { PrintButton } from "./print-button";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { CONTRACT_REPLACED_TEXT, CONTRACT_REPLACED_TEXT_KK, isContractReplaced } from "@/lib/estimate-replace";

// Ссылки на эти страницы уходят в WhatsApp и живут вечно: если такую перешлют
// в общий чат или выложат в отзыв, поисковик проиндексирует данные заказчика.
// Закрыто от индексации через metadata.robots (DOC_ROBOTS) — `export const
// robots` в page.tsx Next не читает (13.11.2026) — и заголовком X-Robots-Tag
// в next.config.ts.

// Превью ссылки в WhatsApp — с логотипом и названием мастера (11.11.2026)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: { contractPublicId: publicId, deletedAt: null },
    select: { masterId: true, companyId: true, master: { select: { companyName: true, firstName: true, logoUrl: true } } },
  });
  if (!estimate) return { title: "Договор", robots: DOC_ROBOTS };
  const m = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);
  const company = m.companyName || m.firstName;
  return brandedDocMetadata({
    title: `Договор от ${company}`,
    description: `Договор на натяжные потолки от ${company}. Откройте, чтобы прочитать и подписать.`,
    logoUrl: m.logoUrl,
  });
}

export default async function ContractPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ lang?: string; print?: string }>;
}) {
  const { publicId } = await params;
  const { lang: langParam, print } = await searchParams;

  const estimate = await prisma.estimate.findFirst({
    where: { contractPublicId: publicId, deletedAt: null },
    include: {
      master: { select: CONTRACT_MASTER_SELECT },
    },
  });

  if (!estimate) notFound();
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);

  // Язык документа: по умолчанию язык мастера, но заказчик может переключить
  // ссылкой ?lang= — у мастера-казаха бывает русскоязычный заказчик и наоборот,
  // а документ, который человек подписывает, он должен читать на своём языке
  // (26.09.2026).
  const lang: Lang = langParam === "ru" || langParam === "kk" ? langParam : asLang(estimate.master.language);
  // Тексты страницы по стране мастера: рубли → ссылки на ГК РФ (27.10.2026).
  const t = contractT(lang, estimate.master.currency);
  const otherLang: Lang = lang === "kk" ? "ru" : "kk";

  // Подписанный договор рисуем из снимка, сделанного при создании: живой
  // расчёт с тех пор мог измениться, а документ, под которым стоит подпись,
  // меняться не должен — именно за это в суде и бьют (26.09.2026).
  const snap = estimate.contractTextSnapshot as {
    version?: number;
    html?: Record<string, string>;
  } | null;
  const frozenHtml = estimate.contractSignedAt ? snap?.html?.[lang] : undefined;

  // Не подписан — живой текст: типовой или из шаблона мастера (26.09.2026).
  const html = frozenHtml ?? (await renderLiveContract(estimate, estimate.master, lang)).html;
  const doc = contractView(html);

  const isSigned = !!estimate.contractSignedAt;
  // Мастер выбрал другой вариант КП — этот договор не подписывают (13.11.2026)
  const isReplaced = isContractReplaced(estimate);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {isSigned && (
        <div className="sticky top-0 z-10 bg-emerald-600 text-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{t("page.ct.signed")}</span>
              {" — "}
              {estimate.contractSignerName} ·{" "}
              {estimate.contractSignedAt?.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty" })}
            </div>
          </div>
        </div>
      )}

      {isReplaced && (
        <div className="sticky top-0 z-10 bg-amber-500 text-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm font-semibold">{lang === "kk" ? CONTRACT_REPLACED_TEXT_KK : CONTRACT_REPLACED_TEXT}</div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 pt-4 flex justify-end gap-2 print:hidden">
        <PrintButton lang={lang} autoPrint={print === "1"} />
        <Link
          href={`?lang=${otherLang}`}
          prefetch={false}
          className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {t(`ct.lang.${otherLang}`)}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-4 print:max-w-none print:p-0">
        <div className="bg-white shadow-sm rounded-lg overflow-hidden print:shadow-none print:rounded-none">
          <style dangerouslySetInnerHTML={{ __html: doc.css }} />
          <div className={CONTRACT_DOC_CLASS} dangerouslySetInnerHTML={{ __html: doc.body }} />
        </div>
      </div>

      <div className={`max-w-3xl mx-auto px-3 pb-10 ${isSigned ? "" : "print:hidden"}`}>
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
              {estimate.contractSignedAt?.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty" })}
            </p>
          </div>
        ) : isReplaced ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="text-sm font-semibold">{lang === "kk" ? CONTRACT_REPLACED_TEXT_KK : CONTRACT_REPLACED_TEXT}</p>
          </div>
        ) : (
          <SignSection publicId={publicId} lang={lang} currency={estimate.master.currency} seenHash={contractHash(html)} />
        )}
      </div>
    </div>
  );
}
