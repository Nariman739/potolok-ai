/**
 * Скидка клиенту и вознаграждение посреднику в КП.
 *
 * Схема (Нариман 14.09.2026):
 *   сумма по прайсу (base)
 *     + посреднику        — от base; РАЗМАЗЫВАЕТСЯ по ценам позиций коэффициентом,
 *                           клиент строку «посреднику» не видит нигде
 *     = цена для клиента  — calc.total / calc.subtotal
 *     − скидка            — от цены для клиента; клиент видит её отдельной строкой
 *     = к оплате          — Estimate.total
 *
 * Обе величины мастер вводит либо в процентах, либо суммой в ₸ — независимо.
 * Сумма посреднику фиксируется при вводе, скидка её не уменьшает.
 *
 * ФАЙЛ-БЛИЗНЕЦ: potolok-ai-app/src/lib/shared/kp-adjust.ts — держать идентичным.
 * Функции чистые: сервер ими считает при сохранении, мобилка — живой предпросмотр.
 */

export type MoneyMode = "percent" | "amount";

/** Ввод мастера: «10 %» или «20 000 ₸». value <= 0 → «нет». */
export interface MoneyInput {
  mode: MoneyMode;
  value: number;
}

/** Минимальная форма расчёта, с которой работают функции ниже. */
interface AdjLineItem {
  quantity: number;
  unitPrice: number;
  total: number;
}
interface AdjRoomResult {
  items: AdjLineItem[];
  subtotal: number;
  heightMultiplied?: boolean;
  subtotalAfterHeight: number;
}
export interface AdjCalc {
  roomResults?: AdjRoomResult[];
  extraItems?: AdjLineItem[];
  subtotal?: number;
  total: number;
  /** true — итог поднят до минимального заказа (calc.total == minOrder) */
  minOrderApplied?: boolean;
  totalArea?: number;
  pricePerM2?: number;
}

/** Коэффициент высоты >3 м — совпадает с height_coefficient в прайсе. */
const HEIGHT_COEF = 1.3;

export function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

/** Сумма всех позиций (комнаты с учётом высоты + «Дополнительно»). */
export function sumCalc(calc: AdjCalc): number {
  const rooms = (calc.roomResults ?? []).reduce(
    (s, r) => s + (r.subtotalAfterHeight ?? r.subtotal ?? 0),
    0
  );
  const extras = (calc.extraItems ?? []).reduce((s, it) => s + (it.total ?? 0), 0);
  return Math.round(rooms + extras);
}

/**
 * Умножает unitPrice каждой позиции на coef (округляя до 10 ₸) и пересчитывает
 * все итоги. coef=1 → просто пересчёт итогов. installer-позиции не трогает:
 * они лежат в других полях (installerItems / installerPrice).
 */
export function scaleCalc<T extends AdjCalc>(calc: T, coef: number): T {
  const scaleItem = <I extends AdjLineItem>(it: I): I => {
    const unitPrice = coef === 1 ? it.unitPrice : round10(it.unitPrice * coef);
    return { ...it, unitPrice, total: Math.round(it.quantity * unitPrice) };
  };
  const roomResults = (calc.roomResults ?? []).map((rr) => {
    const items = rr.items.map(scaleItem);
    const subtotal = Math.round(items.reduce((s, it) => s + it.total, 0));
    const subtotalAfterHeight = rr.heightMultiplied
      ? Math.round(subtotal * HEIGHT_COEF)
      : subtotal;
    return { ...rr, items, subtotal, subtotalAfterHeight };
  });
  const extraItems = calc.extraItems ? calc.extraItems.map(scaleItem) : calc.extraItems;
  const next = { ...calc, roomResults, extraItems } as T;
  const sum = sumCalc(next);
  // Минимальный заказ — фиксированная сумма, её не масштабируем: если он был
  // применён, calc.total и есть этот порог. Пересчёт позиций не должен его терять.
  const floor = calc.minOrderApplied ? Math.round(calc.total) : 0;
  const total = Math.max(sum, floor);
  const totalArea = calc.totalArea ?? 0;
  return {
    ...next,
    subtotal: total,
    total,
    minOrderApplied: total > sum,
    ...(calc.pricePerM2 !== undefined && {
      pricePerM2: totalArea > 0 ? Math.round(total / totalArea) : 0,
    }),
  };
}

export interface PartnerResult {
  /** Сколько должен посреднику, ₸ */
  amount: number;
  /** Что ввёл мастер в %, иначе null */
  percent: number | null;
  /** Множитель, которым размазано по ценам (1 = посредника нет) */
  coef: number;
}

/**
 * Считает посредника от суммы по прайсу `base` и возвращает коэффициент.
 * Сумма — ровно то, что ввёл мастер (или round(base·%)); остаток от округления
 * цен до 10 ₸ уходит в «тебе остаётся», а не посреднику.
 */
export function computePartner(base: number, input: MoneyInput | null | undefined): PartnerResult {
  if (!input || !(input.value > 0) || base <= 0) return { amount: 0, percent: null, coef: 1 };
  if (input.mode === "percent") {
    const percent = Math.min(500, input.value);
    const amount = Math.round((base * percent) / 100);
    return { amount, percent, coef: 1 + percent / 100 };
  }
  const amount = Math.round(input.value);
  return { amount, percent: null, coef: (base + amount) / base };
}

export interface DiscountResult {
  amount: number;
  /** Процент, если мастер вводил в %; иначе 0 (так хранится в Estimate.discountPercent) */
  percent: number;
}

/** Скидка от цены для клиента (после посредника). Не больше самой цены. */
export function computeDiscount(clientPrice: number, input: MoneyInput | null | undefined): DiscountResult {
  if (!input || !(input.value > 0) || clientPrice <= 0) return { amount: 0, percent: 0 };
  if (input.mode === "percent") {
    const percent = Math.min(99, Math.round(input.value * 100) / 100);
    return { amount: Math.round((clientPrice * percent) / 100), percent };
  }
  return { amount: Math.min(Math.round(input.value), clientPrice), percent: 0 };
}

export interface KpAdjustment<T extends AdjCalc> {
  /** Расчёт с ценами, в которых уже сидит посредник */
  calc: T;
  /** Цена для клиента до скидки (= calc.total) */
  clientPrice: number;
  discount: DiscountResult;
  partner: PartnerResult;
  /** К оплате клиентом (= Estimate.total) */
  total: number;
  /** Что остаётся мастеру после посредника (до скидки — скидку оплачивает мастер) */
  masterKeeps: number;
}

/**
 * Полный проход: base-расчёт → посредник → скидка.
 *
 * `prevCoef` — коэффициент, которым calc уже размазан (у сохранённого КП с
 * посредником). Сначала снимаем его, потом кладём новый: так правка процента
 * на отправленном КП не накапливает наценку, а ручные правки цен сохраняются
 * (точность ±10 ₸ на единицу из-за округления).
 */
export function applyKpAdjustments<T extends AdjCalc>(
  calc: T,
  opts: { partner?: MoneyInput | null; discount?: MoneyInput | null; prevCoef?: number }
): KpAdjustment<T> {
  const prevCoef = opts.prevCoef && opts.prevCoef > 0 ? opts.prevCoef : 1;
  const baseCalc = scaleCalc(calc, 1 / prevCoef);
  const base = baseCalc.total;
  const partner = computePartner(base, opts.partner);
  const adjusted = partner.coef === 1 ? baseCalc : scaleCalc(baseCalc, partner.coef);
  const clientPrice = adjusted.total;
  const discount = computeDiscount(clientPrice, opts.discount);
  const total = clientPrice - discount.amount;
  return {
    calc: adjusted,
    clientPrice,
    discount,
    partner,
    total,
    masterKeeps: total - partner.amount,
  };
}

/** Нормализует то, что пришло с клиента, в MoneyInput или null. */
export function parseMoneyInput(raw: unknown): MoneyInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { mode?: unknown; value?: unknown };
  const mode: MoneyMode = o.mode === "amount" ? "amount" : "percent";
  const value = Number(o.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { mode, value };
}
