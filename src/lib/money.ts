/**
 * Деньги по объекту (Этап 4, 20.09.2026).
 *
 * Честная формула: цена клиенту − материал − монтажнику = прибыль.
 * Цена — принятое клиентом КП, иначе последнее. Материал — то, что мастер
 * ввёл по объекту («сколько отдал за материал?»); пока не ввёл — оценка по
 * доле по умолчанию (Master.materialPercent) с пометкой «≈». Старым объектам
 * ничего не выдумываем: без цены прибыль = null.
 */

export type MoneyInput = {
  price: number | null;
  payments: { amount: number }[];
  materialCost: number | null;
  materialPercent: number;
  installerFee: number | null;
  installerPaidAt: Date | null;
  /** Вознаграждение посреднику (дизайнеру) — сидит внутри цены, из прибыли уходит */
  partnerAmount?: number | null;
};

export type MoneySummary = {
  price: number | null;
  paid: number;
  /** Остаток клиента; отрицательный — переплата */
  due: number | null;
  materialCost: number | null;
  /** Оценка материала по проценту, когда закупка не указана */
  materialEstimate: number | null;
  materialPercent: number;
  installerFee: number | null;
  installerPaid: boolean;
  partnerAmount: number;
  /** Прибыль по введённым данным (материал введён) либо оценка */
  profit: number | null;
  profitIsEstimate: boolean;
  /** Деньги получены полностью */
  settled: boolean;
};

export function moneySummary(i: MoneyInput): MoneySummary {
  const paid = i.payments.reduce((s, p) => s + p.amount, 0);
  const price = i.price != null && i.price > 0 ? Math.round(i.price) : null;
  const due = price != null ? price - paid : null;
  const materialEstimate =
    price != null && i.materialCost == null ? Math.round((price * i.materialPercent) / 100) : null;
  const material = i.materialCost ?? materialEstimate;
  const partnerAmount = Math.max(0, Math.round(i.partnerAmount ?? 0));
  const profit = price != null && material != null ? price - material - (i.installerFee ?? 0) - partnerAmount : null;
  return {
    price,
    paid,
    due,
    materialCost: i.materialCost,
    materialEstimate,
    materialPercent: i.materialPercent,
    installerFee: i.installerFee,
    installerPaid: !!i.installerPaidAt,
    partnerAmount,
    profit,
    profitIsEstimate: profit != null && i.materialCost == null,
    settled: price != null && paid >= price,
  };
}
