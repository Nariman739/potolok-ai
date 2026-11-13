/**
 * Вопрос перед удалением замера (объекта) на сайте (13.11.2026).
 * Удаление уносит в корзину объект вместе с его КП, а деньги по объекту в корзине выпадают из
 * отчёта за месяц — мастер должен узнать об этом ДО, а не после. Приложение предупреждает так же
 * (сумма оплат приходит от DELETE /api/objects/:id); на сайте данные берутся из GET /api/objects/:id.
 * info = null — данные получить не удалось: спрашиваем общими словами.
 */
export type ObjectDeleteInfo = {
  /** Сколько уже оплачено по объекту. */
  paid: number;
  /** Сколько у объекта живых КП. */
  kpCount: number;
  /** Клиент подписал договор по одному из КП объекта. */
  contractSigned: boolean;
  /** Клиент подписал акт приёмки. */
  actSigned: boolean;
  /** У клиента на руках ссылки: есть КП, отправленное, открытое или принятое клиентом. */
  sentToClient: boolean;
};

export function objectDeleteQuestion(info: ObjectDeleteInfo | null, formatMoney: (n: number) => string): string {
  if (!info) return "Удалить замер? Он попадёт в Корзину вместе со своими КП — можно будет восстановить.";
  const lines: string[] = [];
  if (info.contractSigned || info.actSigned) {
    const docs = info.contractSigned && info.actSigned ? "договор и акт" : info.contractSigned ? "договор" : "акт";
    lines.push(`По этому объекту клиент подписал ${docs}.`);
  }
  if (info.paid > 0) lines.push(`У объекта есть оплаты на ${formatMoney(info.paid)} — они пропадут из отчёта за месяц.`);
  // Публичные страницы КП, договора и акта у объекта в корзине не открываются.
  if (info.sentToClient || info.contractSigned || info.actSigned) {
    lines.push("Ссылки, которые получил клиент, перестанут открываться, пока объект в Корзине.");
  }
  if (lines.length === 0 && info.kpCount === 0) return "Удалить замер? Он попадёт в Корзину — можно будет восстановить.";
  if (lines.length === 0) return "Удалить замер? Он попадёт в Корзину вместе со своими КП — можно будет восстановить.";
  lines.push(info.kpCount > 0 ? "Удалить вместе с КП? Можно будет восстановить из Корзины." : "Удалить? Можно будет восстановить из Корзины.");
  return lines.join("\n");
}

/** Собрать сведения из ответа GET /api/objects/:id; не тот формат — null. */
export function objectDeleteInfoFrom(data: unknown): ObjectDeleteInfo | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { money?: { paid?: unknown }; estimates?: unknown };
  if (!Array.isArray(d.estimates)) return null;
  const alive = (d.estimates as { deletedAt?: unknown; status?: unknown; contractSignedAt?: unknown; actSignedAt?: unknown }[]).filter((e) => e && !e.deletedAt);
  const paid = typeof d.money?.paid === "number" && Number.isFinite(d.money.paid) ? d.money.paid : 0;
  return {
    paid,
    kpCount: alive.length,
    contractSigned: alive.some((e) => !!e.contractSignedAt),
    actSigned: alive.some((e) => !!e.actSignedAt),
    sentToClient: alive.some((e) => e.status === "SENT" || e.status === "VIEWED" || e.status === "CONFIRMED"),
  };
}
