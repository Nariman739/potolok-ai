/**
 * Серверная обвязка над kp-adjust: читает ввод мастера из тела запроса,
 * применяет скидку/посредника к расчёту и пишет результат в Estimate +
 * EstimatePartner. Единственное место, где посредник попадает в базу.
 */
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";
import {
  applyKpAdjustments,
  scaleCalc,
  sumCalc,
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

const priceOf = (r: RoomResult) => r.subtotalAfterHeight ?? r.subtotal ?? 0;

/**
 * Посредник суммой после правки комнаты (recalc-room): комнаты стоят по разным
 * коэффициентам, поэтому правленая помнит partnerBase (сумма по прайсу) и
 * partnerPrice (её цены тогда; не совпали — цены переписал другой путь, метка
 * не действует). Комната без метки — «старая»: старые и «Дополнительно» делят
 * остаток базы пропорционально ценам (общий c0, k = 1/c0). Полная база — из
 * записи: coef всегда пишется как (база + сумма) / база.
 */
export function partnerRoomBases(calc: CalculationResult, amount: number, coef: number) {
  const totalBase = amount / (coef - 1);
  const marked = (r: RoomResult) => {
    const m = r as RoomResult & { partnerBase?: number; partnerPrice?: number };
    return typeof m.partnerBase === "number" && m.partnerPrice === priceOf(r) ? m.partnerBase : null;
  };
  const rooms = calc.roomResults ?? [];
  const markedRooms = rooms.filter((r) => marked(r) != null);
  const unmarkedPrices = sumCalc(calc) - markedRooms.reduce((s, r) => s + priceOf(r), 0);
  const baseLeft = Math.max(0, totalBase - markedRooms.reduce((s, r) => s + (marked(r) ?? 0), 0));
  const k = unmarkedPrices > 0 ? baseLeft / unmarkedPrices : 1 / coef;
  return { totalBase, k, hasMarks: markedRooms.length > 0, baseOf: (r: RoomResult) => marked(r) ?? priceOf(r) * k };
}

/** Снимает наценку с каждой комнаты по её коэффициенту и убирает метки → расчёт по прайсу. */
function unscaleMarked(calc: CalculationResult, pb: ReturnType<typeof partnerRoomBases>): CalculationResult {
  const roomResults = (calc.roomResults ?? []).map((r) => {
    const { partnerBase: _b, partnerPrice: _p, ...rest } = r as RoomResult & { partnerBase?: number; partnerPrice?: number };
    const price = priceOf(r);
    return scaleCalc({ roomResults: [rest as RoomResult], total: 0 }, price > 0 ? pb.baseOf(r) / price : 1).roomResults[0];
  });
  const extraItems = calc.extraItems && scaleCalc({ extraItems: calc.extraItems, total: 0 }, pb.k).extraItems;
  return { ...calc, roomResults, extraItems };
}

/** Ошибка ввода мастера — роуты отдают её как 400 с текстом. */
export class KpAdjustError extends Error {
  constructor(message: string) { super(message); this.name = "KpAdjustError"; }
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
  let prevCoef = opts.calcIsBase ? 1 : prev?.partner?.coef ?? 1;
  // КП после правки комнаты с посредником суммой: общий coef снимал бы наценку
  // неточно (сдвиг итога ~300 ₸ на округлении) — снимаем по коэффициенту каждой комнаты.
  const pp = prev?.partner;
  if (!opts.calcIsBase && pp && pp.amount > 0 && pp.percent == null && pp.coef > 1 && !calc.minOrderApplied) {
    const pb = partnerRoomBases(calc, pp.amount, pp.coef);
    if (pb.hasMarks) {
      calc = unscaleMarked(calc, pb);
      prevCoef = 1;
    }
  }
  // Минималку со скидкой снимаем только когда мастер сейчас ставит или меняет скидку.
  // Та же скидка, что уже сохранена (или её нет в запросе), минималку КП не снимает.
  const prevDiscount = prev ? discountInputFromState(prev) : null;
  const discountChanged =
    inputs.discount !== undefined &&
    (inputs.discount?.mode !== prevDiscount?.mode || inputs.discount?.value !== prevDiscount?.value);
  const r = applyKpAdjustments(calc, { discount, partner, prevCoef, keepMinOrder: !!prev && !discountChanged });
  // Скидка, съедающая всё КП, даёт total = 0 → договор и акт на ноль тенге.
  // На симуляторе так и вышло («10» + «5000» = 105 000 ₸). Не даём сохранить.
  if (r.clientPrice > 0 && r.discount.amount >= r.clientPrice) {
    throw new KpAdjustError("Скидка не может быть больше суммы КП");
  }
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
