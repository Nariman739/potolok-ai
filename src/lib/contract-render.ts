/**
 * Какой договор печатать мастеру (27.09.2026).
 *
 * Если у владельца компании есть свой шаблон на этом языке — договор
 * собирается из него, метки заменяются данными заказа. Если нет — типовой из
 * кода, как раньше. Одна точка входа для страницы договора и для снимка,
 * который замораживается при создании: иначе клиент читал бы один текст, а
 * под подпись уходил другой.
 */
import { prisma } from "./prisma";
import {
  generateContractHtml,
  renderContractTemplate,
  type MasterData,
  type EstimateData,
} from "./contract-html";
import { asLang, type Lang } from "./i18n";
import type { CalculationResult } from "./types";

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
      where: { id: me.activeCompanyId, members: { some: { masterId, removedAt: null } } },
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
