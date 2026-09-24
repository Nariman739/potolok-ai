/**
 * Этап объекта — где он на магистрали
 * «Замерил → Посчитал → Отправил → Согласовали → В цех → Закрыл».
 *
 * Этап считается САМ по тому, что уже произошло: есть КП — «посчитал»,
 * КП со статусом SENT — «отправил», клиент открыл — «смотрел», принял —
 * «согласовали», есть запись об отправке в цех — «в цеху». Монтаж и деньги
 * приложение пока не видит, поэтому «смонтировали» и «закрыл» мастер ставит
 * рукой (manualStage). Ручной этап важнее автоматического: клиент мог
 * сказать «да» по телефону, а в приложении КП так и осталось «отправлено».
 *
 * Зеркало на мобилке: potolok-integration/src/lib/object-stage.ts —
 * подписи и порядок должны совпадать.
 */

export const OBJECT_STAGES = [
  "measured",   // Замерил
  "calculated", // Посчитал
  "sent",       // Отправил
  "viewed",     // Смотрел
  "confirmed",  // Согласовали
  "workshop",   // В цеху
  "installed",  // Смонтировали
  "closed",     // Закрыл (монтаж + деньги)
] as const;

export type ObjectStage = (typeof OBJECT_STAGES)[number];

export const STAGE_LABELS: Record<ObjectStage, string> = {
  measured: "Замерил",
  calculated: "Посчитал",
  sent: "Отправил",
  viewed: "Смотрел",
  confirmed: "Согласовали",
  workshop: "В цеху",
  installed: "Смонтировали",
  closed: "Закрыл",
};

export function isObjectStage(v: unknown): v is ObjectStage {
  return typeof v === "string" && (OBJECT_STAGES as readonly string[]).includes(v);
}

export function stageIndex(stage: ObjectStage): number {
  return OBJECT_STAGES.indexOf(stage);
}

/** Минимум, что нужно знать об объекте, чтобы посчитать его этап. */
export type StageInput = {
  manualStage?: string | null;
  estimates: { status: string; deletedAt?: Date | null }[];
  workshopOrders: { id: string }[];
  /** Деньги от клиента получены полностью (Этап 4) — вместе с ручным
   *  «смонтировали» даёт «закрыл»: закрыл = смонтировали И деньги. */
  settled?: boolean;
};

/** Этап только по событиям, без учёта ручного. */
export function autoStage(input: StageInput): ObjectStage {
  const alive = input.estimates.filter((e) => !e.deletedAt);
  if (input.workshopOrders.length > 0) return "workshop";
  if (alive.some((e) => e.status === "CONFIRMED")) return "confirmed";
  if (alive.some((e) => e.status === "VIEWED")) return "viewed";
  if (alive.some((e) => e.status === "SENT")) return "sent";
  if (alive.length > 0) return "calculated";
  return "measured";
}

export function resolveStage(input: StageInput): { stage: ObjectStage; isManual: boolean } {
  if (isObjectStage(input.manualStage)) {
    if (input.manualStage === "installed" && input.settled) return { stage: "closed", isManual: true };
    return { stage: input.manualStage, isManual: true };
  }
  return { stage: autoStage(input), isManual: false };
}

/** Этап для КП, у которого нет объекта (быстрое КП, старые КП до 19.09.2026). */
export function estimateOnlyStage(status: string): ObjectStage {
  switch (status) {
    case "CONFIRMED":
      return "confirmed";
    case "VIEWED":
      return "viewed";
    case "SENT":
      return "sent";
    default:
      return "calculated";
  }
}

/**
 * Какое КП показывать в строке объекта: принятое клиентом, иначе последнее
 * живое и не пересмотренное, иначе просто последнее.
 */
export function pickPrimaryEstimate<T extends { status: string; createdAt: Date; deletedAt?: Date | null }>(
  estimates: T[],
): T | null {
  const alive = estimates.filter((e) => !e.deletedAt);
  if (alive.length === 0) return null;
  const sorted = [...alive].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  // Принятых КП на объекте может быть несколько: мастер делает «+ Ещё вариант»,
  // клиент подтверждает новый. Берём ПОСЛЕДНЕЕ принятое — это и есть цена, о
  // которой договорились. Раньше брали первое попавшееся в массиве, и порядок
  // задавала база: лента показывала одну сумму, карточка другую, «Деньги»
  // третью (аудит 24.09.2026).
  const confirmed = sorted.find((e) => e.status === "CONFIRMED");
  if (confirmed) return confirmed;
  return sorted.find((e) => e.status !== "REVISED") ?? sorted[0];
}
