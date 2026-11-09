/**
 * Колонки канбана клиентов на сайте (09.11.2026, «Небо в подарок»).
 * Без Prisma — файл импортируется и в клиентские компоненты.
 *
 * Приоритет: Отказ (статус LOST) → ручная Client.crmColumn → расчёт.
 *
 * | Колонка            | Сама, если                                       | Перенос рукой дополнительно      |
 * |--------------------|--------------------------------------------------|----------------------------------|
 * | Новая заявка       | нет объекта, КП и планового замера                | —                                |
 * | Замер              | этап measured или назначен будущий замер         | —                                |
 * | Расчёт / КП        | этап calculated (КП-черновик)                    | —                                |
 * | КП отправлено      | этап sent                                        | —                                |
 * | Согласование       | этапы viewed, confirmed, workshop без договора   | —                                |
 * | Договор            | есть договор у живого КП клиента                 | —                                |
 * | Закуп материала    | никогда, только рукой                            | —                                |
 * | Планирование       | никогда, только рукой                            | —                                |
 * | Монтаж запланирован| installAt позже сегодняшнего дня                 | диалог даты → installAt объекта  |
 * | Монтаж             | installAt сегодня или уже прошла                 | —                                |
 * | Завершён           | этап installed или closed                        | manualStage installed, статус WON|
 * | Отказ              | статус клиента LOST                              | статус LOST                      |
 *
 * Сверху вниз по важности расчёта: Завершён → даты монтажа → Договор → этап объекта.
 */
import {
  estimateOnlyStage,
  isObjectStage,
  pickPrimaryEstimate,
  resolveStage,
  type ObjectStage,
} from "./object-stage";

export const CRM_COLUMNS = [
  "new",
  "measure",
  "calc",
  "kp_sent",
  "negotiation",
  "contract",
  "purchase",
  "planning",
  "install_planned",
  "install",
  "done",
  "lost",
] as const;

export type CrmColumn = (typeof CRM_COLUMNS)[number];

export const CRM_COLUMN_LABELS: Record<CrmColumn, string> = {
  new: "Новая заявка",
  measure: "Замер",
  calc: "Расчёт / КП",
  kp_sent: "КП отправлено",
  negotiation: "Согласование",
  contract: "Договор",
  purchase: "Закуп материала",
  planning: "Планирование",
  install_planned: "Монтаж запланирован",
  install: "Монтаж",
  done: "Завершён",
  lost: "Отказ",
};

export function isCrmColumn(v: unknown): v is CrmColumn {
  return typeof v === "string" && (CRM_COLUMNS as readonly string[]).includes(v);
}

type EstimateInput = {
  status: string;
  createdAt: Date;
  deletedAt?: Date | null;
  total: number | null;
  contractPublicId?: string | null;
};

type ObjectInput = {
  createdAt: Date;
  installAt: Date | null;
  manualStage: string | null;
  estimates: EstimateInput[];
  workshopOrders: { id: string }[];
};

export type CrmInput = {
  status: string;
  crmColumn?: string | null;
  objects: ObjectInput[];
  /** КП клиента, в том числе без объекта (быстрое КП) */
  estimates: EstimateInput[];
  hasScheduledMeasurement: boolean;
};

/** Главный объект карточки — самый новый. */
export function mainObject<T extends { createdAt: Date }>(objects: T[]): T | null {
  return objects.reduce<T | null>((best, o) => (!best || o.createdAt > best.createdAt ? o : best), null);
}

// Asia/Almaty всегда UTC+5, как в src/lib/clients.ts
function almatyDay(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stageOf(input: CrmInput): ObjectStage | null {
  const main = mainObject(input.objects);
  if (main) {
    return resolveStage({
      manualStage: isObjectStage(main.manualStage) ? main.manualStage : null,
      estimates: main.estimates,
      workshopOrders: main.workshopOrders,
    }).stage;
  }
  const primary = pickPrimaryEstimate(input.estimates);
  return primary ? estimateOnlyStage(primary.status) : null;
}

/** Колонка по данным, без учёта ручной. */
export function autoCrmColumn(input: CrmInput, now: Date = new Date()): CrmColumn {
  if (input.status === "LOST") return "lost";

  const stage = stageOf(input);
  if (stage === "installed" || stage === "closed") return "done";

  const installAt = mainObject(input.objects)?.installAt;
  if (installAt) return almatyDay(installAt) > almatyDay(now) ? "install_planned" : "install";

  const allEstimates = [...input.estimates, ...input.objects.flatMap((o) => o.estimates)];
  if (allEstimates.some((e) => !e.deletedAt && e.contractPublicId)) return "contract";

  switch (stage) {
    case "measured":
      return "measure";
    case "calculated":
      return "calc";
    case "sent":
      return "kp_sent";
    case "viewed":
    case "confirmed":
    case "workshop":
      return "negotiation";
    default:
      return input.hasScheduledMeasurement ? "measure" : "new";
  }
}

export function resolveCrmColumn(input: CrmInput, now: Date = new Date()): CrmColumn {
  if (input.status === "LOST") return "lost";
  return isCrmColumn(input.crmColumn) ? input.crmColumn : autoCrmColumn(input, now);
}
