/**
 * Серверная обвязка над kp-adjust: читает ввод мастера из тела запроса,
 * применяет скидку/посредника к расчёту и пишет результат в Estimate +
 * EstimatePartner. Единственное место, где посредник попадает в базу.
 */
import { prisma } from "@/lib/prisma";
import type { CalculationResult } from "@/lib/types";
import {
  applyKpAdjustments,
  parseMoneyInput,
  type MoneyInput,
  type PartnerResult,
} from "@/lib/kp-adjust";

/** Поля Estimate, от которых восстанавливаем текущее состояние. */
export interface EstimateAdjustState {
  discountPercent: number;
  discountAmount: number;
  partner: { amount: number; percent: number | null; coef: number } | null;
}

/** Скидка, как её вводил мастер (для «оставить как было»). */
export function discountInputFromState(s: EstimateAdjustState): MoneyInput | null {
  if (s.discountPercent > 0) return { mode: "percent", value: s.discountPercent };
  if (s.discountAmount > 0) return { mode: "amount", value: s.discountAmount };
  return null;
}

/** Посредник, как его вводил мастер. */
export function partnerInputFromState(s: EstimateAdjustState): MoneyInput | null {
  if (!s.partner || s.partner.amount <= 0) return null;
  if (s.partner.percent != null && s.partner.percent > 0) {
    return { mode: "percent", value: s.partner.percent };
  }
  return { mode: "amount", value: s.partner.amount };
}

/**
 * Что прислал клиент. Ключ отсутствует → «не менять» (undefined);
 * null / value<=0 → «убрать». Поддерживает старый `discountPercent` от
 * приложений в поле, которые про новый формат ещё не знают.
 */
export function readAdjustInputs(body: Record<string, unknown>): {
  discount: MoneyInput | null | undefined;
  partner: MoneyInput | null | undefined;
} {
  let discount: MoneyInput | null | undefined;
  if ("discount" in body) {
    discount = parseMoneyInput(body.discount);
  } else if ("discountPercent" in body) {
    const dp = Number(body.discountPercent);
    discount = dp > 0 ? { mode: "percent", value: dp } : null;
  }
  const partner = "partner" in body ? parseMoneyInput(body.partner) : undefined;
  return { discount, partner };
}

export interface ResolvedAdjust {
  calculationData: CalculationResult;
  total: number;
  discountPercent: number;
  discountAmount: number;
  partner: PartnerResult;
  clientPrice: number;
}

/**
 * Применяет ввод к расчёту. `prev` — текущее состояние КП (для PUT), для
 * нового КП — null. calc считается размазанным коэффициентом prev.partner.coef,
 * если только не передан `calcIsBase` (свежий calculate() по прайсу).
 */
export function resolveAdjust(
  calc: CalculationResult,
  inputs: { discount: MoneyInput | null | undefined; partner: MoneyInput | null | undefined },
  prev: EstimateAdjustState | null,
  opts: { calcIsBase?: boolean } = {}
): ResolvedAdjust {
  const discount =
    inputs.discount !== undefined ? inputs.discount : prev ? discountInputFromState(prev) : null;
  const partner =
    inputs.partner !== undefined ? inputs.partner : prev ? partnerInputFromState(prev) : null;
  const prevCoef = opts.calcIsBase ? 1 : prev?.partner?.coef ?? 1;
  const r = applyKpAdjustments(calc, { discount, partner, prevCoef });
  return {
    calculationData: r.calc,
    total: r.total,
    discountPercent: r.discount.percent,
    discountAmount: r.discount.amount,
    partner: r.partner,
    clientPrice: r.clientPrice,
  };
}

/** Пишет/удаляет строку посредника. Вызывать после сохранения Estimate. */
export async function persistPartner(estimateId: string, partner: PartnerResult): Promise<void> {
  if (partner.amount > 0 && partner.coef !== 1) {
    await prisma.estimatePartner.upsert({
      where: { estimateId },
      create: { estimateId, amount: partner.amount, percent: partner.percent, coef: partner.coef },
      update: { amount: partner.amount, percent: partner.percent, coef: partner.coef },
    });
  } else {
    await prisma.estimatePartner.deleteMany({ where: { estimateId } });
  }
}

/** Данные Estimate для prisma.update/create из результата resolveAdjust. */
export function estimateAdjustData(r: ResolvedAdjust) {
  return {
    calculationData: r.calculationData as unknown as object,
    total: r.total,
    standardTotal: r.total,
    discountPercent: r.discountPercent,
    discountAmount: r.discountAmount,
  };
}
