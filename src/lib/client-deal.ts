/**
 * Сумма сделки клиента — одно правило для списка клиентов, API, Telegram-итогов и главной
 * (13.11.2026). Раньше эти места складывали ВСЕ КП клиента подряд: варианты одного объекта,
 * пересмотренные, отклонённые и даже КП из корзины — «2 КП 189 996 ₽» у клиента с одним
 * принятым КП на 94 998 (завышено было у 165 из 460 клиентов с КП).
 *
 * Правило: КП группируются по объекту; у каждого объекта в сумму идёт одно главное КП —
 * последнее принятое клиентом, иначе последнее живое. КП из корзины, пересмотренные (REVISED)
 * и отклонённые (REJECTED) не участвуют. КП без объекта — одна группа на клиента.
 * Так же считают «Деньги», лента и карточка объекта (pickPrimaryEstimate в object-stage.ts);
 * здесь отличие одно — отклонённые исключены всегда.
 */

export type DealEstimate = {
  id?: string;
  total: number | null;
  status: string;
  createdAt: Date;
  deletedAt?: Date | null;
  measurementObjectId?: string | null;
  clientId?: string | null;
};

/** КП участвует в сделке: не в корзине, не пересмотрено, не отклонено. */
export function isDealEstimate(e: { status: string; deletedAt?: Date | null }): boolean {
  return !e.deletedAt && e.status !== "REVISED" && e.status !== "REJECTED";
}

/** Группа сделки: объект; без объекта — клиент; без клиента — само КП. */
function dealKey(e: DealEstimate): string {
  if (e.measurementObjectId) return `object:${e.measurementObjectId}`;
  if (e.clientId) return `client:${e.clientId}`;
  // В списке КП одного клиента clientId можно не передавать: все «без объекта» — одна группа.
  return e.id && e.clientId === null ? `kp:${e.id}` : "loose";
}

/** Главные КП: по одному на группу — последнее принятое, иначе последнее живое. */
export function dealEstimates<T extends DealEstimate>(estimates: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const e of estimates) {
    if (!isDealEstimate(e)) continue;
    const key = dealKey(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const primary: T[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    primary.push(sorted.find((e) => e.status === "CONFIRMED") ?? sorted[0]);
  }
  return primary;
}

/** Сумма сделки: сумма главных КП по объектам. */
export function dealTotal(estimates: DealEstimate[]): number {
  return dealEstimates(estimates).reduce((sum, e) => sum + (e.total || 0), 0);
}

/** Сколько КП показывать в «N КП»: живые, не пересмотренные и не отклонённые (варианты считаются). */
export function dealKpCount(estimates: { status: string; deletedAt?: Date | null }[]): number {
  return estimates.filter(isDealEstimate).length;
}

/** Поля КП, которых хватает для подсчёта, — для prisma select. */
export const DEAL_ESTIMATE_SELECT = {
  id: true,
  total: true,
  status: true,
  createdAt: true,
  deletedAt: true,
  measurementObjectId: true,
  clientId: true,
} as const;
