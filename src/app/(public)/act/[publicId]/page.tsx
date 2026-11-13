import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound } from "next/navigation";
import { renderAct, ACT_MASTER_SELECT } from "@/lib/act-render";
import { PrintButton } from "../../contract/[publicId]/print-button";
import { asLang, localeOf, type Lang } from "@/lib/i18n";
import { contractT } from "@/lib/i18n/contract";
import Link from "next/link";
import type { CalculationResult } from "@/lib/types";
import type { Metadata } from "next";
import { brandedDocMetadata, DOC_ROBOTS } from "@/lib/doc-og";
import { ActSignSection } from "./sign-section";
import { CheckCircle2 } from "lucide-react";

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
    where: { actPublicId: publicId, deletedAt: null },
    select: { masterId: true, companyId: true, master: { select: { companyName: true, firstName: true, logoUrl: true } } },
  });
  if (!estimate) return { title: "Акт выполненных работ", robots: DOC_ROBOTS };
  const m = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);
  const company = m.companyName || m.firstName;
  return brandedDocMetadata({
    title: `Акт от ${company}`,
    description: `Акт выполненных работ по натяжным потолкам от ${company}. Откройте, чтобы проверить и подписать.`,
    logoUrl: m.logoUrl,
  });
}

export default async function ActPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ lang?: string; by?: string }>;
}) {
  const { publicId } = await params;
  const { lang: langParam, by } = await searchParams;
  // «Подписать здесь» из приложения мастера: клиент рядом, подпись на
  // телефоне мастера — в акте так и пишем (30.09.2026).
  const onDevice = by === "device";

  const estimate = await prisma.estimate.findFirst({
    where: { actPublicId: publicId, deletedAt: null },
    include: {
      master: { select: ACT_MASTER_SELECT },
    },
  });

  if (!estimate) notFound();
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);

  // Язык акта — как и у договора: язык мастера, но заказчик переключает сам
  // ссылкой ?lang= (26.09.2026).
  const lang: Lang = langParam === "ru" || langParam === "kk" ? langParam : asLang(estimate.master.language);
  const t = contractT(lang, estimate.master.currency);
  const otherLang: Lang = lang === "kk" ? "ru" : "kk";

  const calc = estimate.calculationData as unknown as CalculationResult;
  // Подписанный акт — из снимка на момент подписи; живой — с текущими
  // платежами и замечаниями (27.09.2026).
  const snap = estimate.actTextSnapshot as { html?: Record<string, string> } | null;
  const frozen = estimate.actSignedAt ? snap?.html?.[lang] : undefined;
  const html = frozen ?? (await renderAct(estimate.master, estimate, calc, lang));
  const clientRemarksAt = estimate.actClientRemarksAt && !estimate.actSignedAt ? estimate.actClientRemarksAt : null;

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
              {estimate.actSignedAt?.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty" })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 pt-4 flex justify-end gap-2 print:hidden">
        <PrintButton lang={lang} />
        <Link
          href={`?lang=${otherLang}${onDevice ? "&by=device" : ""}`}
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
              {estimate.actSignedAt?.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty" })}
            </p>
          </div>
        ) : (
          <ActSignSection
            publicId={publicId}
            lang={lang}
            remarksSentAt={clientRemarksAt ? clientRemarksAt.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty" }) : null}
            method={onDevice ? "device" : "link"}
          />
        )}
      </div>
    </div>
  );
}
