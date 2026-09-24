/**
 * Замок на принятом и подписанном КП (24.09.2026).
 *
 * Правило появилось 23.09: клиент нажал «Принять» или подписал договор —
 * сумму и позиции больше не переписывают, для новой цены делают «+ Ещё
 * вариант». Но жила проверка только в PUT /estimates/:id, а рядом есть два
 * роута, которые меняют ровно те же цифры: правка позиций и пересчёт комнаты.
 * Через них подписанный договор переписывался на другую сумму — и клиент по
 * своей же ссылке видел новое число.
 */

export type LockableEstimate = {
  status: string;
  contractSignedAt: Date | null;
  actSignedAt: Date | null;
};

export function isEstimateLocked(e: LockableEstimate): boolean {
  return e.status === "CONFIRMED" || !!e.contractSignedAt || !!e.actSignedAt;
}

/** Текст мастеру: почему нельзя и что делать вместо этого. */
export function estimateLockMessage(e: LockableEstimate): string {
  if (e.contractSignedAt) {
    return "КП уже подписано договором — сумму и позиции менять нельзя. Сделай «+ Ещё вариант».";
  }
  if (e.actSignedAt) {
    return "По этому КП подписан акт — сумму и позиции менять нельзя. Сделай «+ Ещё вариант».";
  }
  return "Клиент уже принял это КП — сумму и позиции менять нельзя. Сделай «+ Ещё вариант».";
}
