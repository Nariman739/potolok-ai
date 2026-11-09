/**
 * Какой договор печатать мастеру (26.09.2026).
 *
 * Если у владельца компании есть свой шаблон на этом языке — договор
 * собирается из него, метки заменяются данными заказа. Если нет — типовой из
 * кода, как раньше. Одна точка входа для страницы договора и для снимка,
 * который замораживается при создании: иначе клиент читал бы один текст, а
 * под подпись уходил другой.
 */
import { createHash } from "crypto";
import { prisma } from "./prisma";
import {
  generateContractHtml,
  renderContractTemplate,
  type MasterData,
  type EstimateData,
} from "./contract-html";
import { asLang, type Lang } from "./i18n";
import { currencyFor } from "./company";
import type { CalculationResult } from "./types";
import type { Estimate } from "@/generated/prisma/client";

/**
 * Чей шаблон печатать. КП принадлежит компании (companyId), а не автору:
 * сотрудник мог уйти и завести свою — его старые КП по-прежнему печатаются
 * договором владельца. Без companyId — по текущей компании автора.
 */
export async function contractOwnerId(masterId: string, companyId?: string | null): Promise<string> {
  try {
    if (companyId) {
      const c = await prisma.company.findUnique({ where: { id: companyId }, select: { ownerId: true } });
      if (c) return c.ownerId;
    }
    const me = await prisma.master.findUnique({ where: { id: masterId }, select: { activeCompanyId: true } });
    if (!me?.activeCompanyId) return masterId;
    const company = await prisma.company.findFirst({
      where: { id: me.activeCompanyId, members: { some: { masterId, removedAt: null, joinedAt: { not: null } } } },
      select: { ownerId: true },
    });
    return company?.ownerId ?? masterId;
  } catch {
    return masterId;
  }
}

export async function activeContractTemplate(ownerId: string, lang: Lang, kind: "contract" | "act" = "contract") {
  return prisma.masterContract.findFirst({
    where: { masterId: ownerId, kind, language: lang, isActive: true },
    orderBy: { version: "desc" },
  });
}

/** Поля мастера, которые нужны тексту договора: и странице клиента, и подписи. */
export const CONTRACT_MASTER_SELECT = {
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
  currency: true,
} as const;

/** Отпечаток текста: подпись сверяет его с тем, что клиент видел на экране. */
export function contractHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export type RenderedContract = {
  html: string;
  /** Версия шаблона мастера; null — печатался типовой. */
  templateVersion: number | null;
};

export async function renderContract(
  author: { masterId: string; companyId?: string | null },
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult,
  language: Lang | string = "ru",
): Promise<RenderedContract> {
  const lang = asLang(language);
  try {
    const ownerId = await contractOwnerId(author.masterId, author.companyId);
    // Валюта договора — владельца компании, если вызывающий её не передал (07.10.2026)
    if (master.currency == null) master = { ...master, currency: await currencyFor(ownerId) };
    // Логотип владельца в шапке, если вызывающий его не выбрал из базы (07.10.2026)
    if (master.logoUrl === undefined) {
      const owner = await prisma.master.findUnique({ where: { id: ownerId }, select: { logoUrl: true } });
      master = { ...master, logoUrl: owner?.logoUrl ?? null };
    }
    const tpl = await activeContractTemplate(ownerId, lang);
    if (tpl) {
      return { html: renderContractTemplate(tpl.body, master, estimate, calc, lang), templateVersion: tpl.version };
    }
  } catch (e) {
    // Шаблон не прочитался — печатаем типовой, документ важнее.
    console.error("Contract template render error:", e);
  }
  return { html: generateContractHtml(master, estimate, calc, lang), templateVersion: null };
}

/** Текст неподписанного договора — тот, что сейчас видит клиент на своей странице. */
export function renderLiveContract(estimate: Estimate, master: MasterData, language: Lang | string) {
  return renderContract(
    estimate,
    master,
    {
      publicId: estimate.publicId,
      clientName: estimate.clientName,
      clientPhone: estimate.clientPhone,
      clientAddress: estimate.clientAddress,
      clientIin: estimate.clientIin,
      total: estimate.total,
      discountAmount: estimate.discountAmount,
      createdAt: estimate.createdAt,
      contractCreatedAt: estimate.contractCreatedAt,
      priceView: estimate.priceView,
      // Сроки и схему оплаты мастер задаёт при создании договора, они лежат
      // в базе — но сюда не передавались, и каждый клиент видел «по
      // согласованию Сторон» и жёсткие 50/50 (аудит 24.09.2026).
      workStartDate: estimate.workStartDate,
      workDurationDays: estimate.workDurationDays,
      paymentSchedule: estimate.paymentSchedule as never,
    },
    estimate.calculationData as unknown as CalculationResult,
    language,
  );
}
