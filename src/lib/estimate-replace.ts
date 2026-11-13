/**
 * «Клиент выбрал» новый вариант, когда в объекте уже есть принятое КП (13.11.2026).
 *
 * Было: мастер отмечал принятым КП, потом договаривался о другой цене — новый вариант
 * отметить было нельзя (приложение прятало кнопку), а сервер оставлял старое CONFIRMED.
 * Объект, «Деньги», наряд и % монтажника считались от старой цены.
 *
 * Стало: при выборе нового варианта прежние принятые КП объекта → REVISED, если по ним
 * НЕ подписан договор или акт. Подписан — выбрать новое нельзя (отмены подписанного
 * договора в продукте нет). Неподписанный договор прежнего КП помечаем «заменён»:
 * клиент видит, что он больше не действует, подписать его нельзя (и на сервере).
 *
 * Гонка «клиент подписывает старый договор, пока мастер выбирает новый вариант»:
 * обе стороны берут строку КП через SELECT … FOR UPDATE в транзакции — кто первый,
 * тот и прав: подписал первым → выбор нового упрётся в подписанный договор; выбрали
 * первым → подпись упрётся в пометку «заменён».
 */
import { Prisma } from "@/generated/prisma/client";

import { PREV_ACT_SIGNED_TEXT, PREV_CONTRACT_SIGNED_TEXT } from "./estimate-replace-text";
export {
  ACT_REPLACED_TEXT,
  ACT_REPLACED_TEXT_KK,
  CONTRACT_REPLACED_TEXT,
  CONTRACT_REPLACED_TEXT_KK,
  MASTER_CONTRACT_REPLACED_TEXT,
  PREV_CONTRACT_SIGNED_TEXT,
  PREV_ACT_SIGNED_TEXT,
} from "./estimate-replace-text";

type Snapshot = Record<string, unknown> & { replacedByEstimateId?: string; replacedAt?: string };

function hasMark(snapshot: unknown): boolean {
  const s = snapshot as Snapshot | null;
  return !!s && typeof s === "object" && typeof s.replacedByEstimateId === "string";
}

/** Договор этого КП заменён новым вариантом (и не подписан). Пометка — в contractTextSnapshot. */
export function isContractReplaced(e: { contractSignedAt: Date | string | null; contractTextSnapshot: unknown }): boolean {
  return !e.contractSignedAt && hasMark(e.contractTextSnapshot);
}

/** Акт этого КП заменён (и не подписан). Пометка — в actTextSnapshot (у неподписанного акта он пуст). */
export function isActReplaced(e: { actSignedAt: Date | string | null; actTextSnapshot: unknown }): boolean {
  return !e.actSignedAt && hasMark(e.actTextSnapshot);
}

export class ReplaceBlockedError extends Error {
  constructor(public readonly kind: "contract" | "act") {
    super(kind === "contract" ? PREV_CONTRACT_SIGNED_TEXT : PREV_ACT_SIGNED_TEXT);
    this.name = "ReplaceBlockedError";
  }
}

/** Это КП нельзя сделать принятым в текущем статусе (проверка под замком). */
export class ConfirmStatusError extends Error {
  constructor(public readonly status: string) {
    super("Это КП нельзя отметить выбранным");
    this.name = "ConfirmStatusError";
  }
}

type LockedRow = {
  id: string;
  status: string;
  total: number | null;
  contractPublicId: string | null;
  contractSignedAt: Date | null;
  contractTextSnapshot: unknown;
  actPublicId: string | null;
  actSignedAt: Date | null;
  actTextSnapshot: unknown;
};

const ROW = `id, status::text AS status, total, "contractPublicId", "contractSignedAt", "contractTextSnapshot", "actPublicId", "actSignedAt", "actTextSnapshot"`;

function marked(snapshot: unknown, by: string, at: string): object {
  return { ...((snapshot as Snapshot | null) ?? {}), replacedByEstimateId: by, replacedAt: at };
}
function unmarked(snapshot: unknown): object | null {
  const s = { ...((snapshot as Snapshot | null) ?? {}) };
  delete s.replacedByEstimateId;
  delete s.replacedAt;
  return Object.keys(s).length ? s : null;
}

/**
 * В транзакции: это КП → CONFIRMED; прежние CONFIRMED объекта → REVISED (с пометкой
 * «заменён» на неподписанных договоре и акте); отправленные SENT/VIEWED → REVISED.
 *
 * by: "master" — «Клиент выбрал» в приложении/CRM (можно из REVISED, а из DRAFT — только
 * если в объекте уже есть принятое); "client" — «Принять» по ссылке (только SENT/VIEWED).
 * Статус проверяется ПОД замком строки объекта: два одновременных выбора (мастер — A,
 * клиент — B) идут по очереди, второй видит уже принятое первым и разжалует его.
 *
 * Бросает ReplaceBlockedError (по прежнему подписан договор/акт) и ConfirmStatusError.
 */
export async function confirmReplacing(
  tx: Prisma.TransactionClient,
  estimateId: string,
  objectId: string | null,
  by: "master" | "client",
): Promise<{ replacedTotals: number[]; replaced: { total: number; contract: boolean; act: boolean }[] }> {
  // Замок объекта — очередь для всех выборов в этом объекте (подпись договора берёт
  // только строку КП и сюда не ходит — взаимной блокировки нет).
  if (objectId) await tx.$queryRaw`SELECT id FROM "MeasurementObject" WHERE id = ${objectId} FOR UPDATE`;
  const [self] = await tx.$queryRawUnsafe<LockedRow[]>(`SELECT ${ROW} FROM "Estimate" WHERE id = $1 FOR UPDATE`, estimateId);
  if (!self) throw new ConfirmStatusError("missing");
  const prev = objectId
    ? await tx.$queryRawUnsafe<LockedRow[]>(
        `SELECT ${ROW} FROM "Estimate"
         WHERE "measurementObjectId" = $1 AND id <> $2 AND status = 'CONFIRMED' AND "deletedAt" IS NULL
         FOR UPDATE`,
        objectId,
        estimateId,
      )
    : [];
  const allowed = by === "client"
    ? ["SENT", "VIEWED"]
    : prev.length > 0 ? ["SENT", "VIEWED", "REVISED", "DRAFT"] : ["SENT", "VIEWED", "REVISED"];
  if (!allowed.includes(self.status)) throw new ConfirmStatusError(self.status);
  const signed = prev.find((p) => p.contractSignedAt || p.actSignedAt);
  if (signed) throw new ReplaceBlockedError(signed.contractSignedAt ? "contract" : "act");

  const replacedTotals: number[] = [];
  const replaced: { total: number; contract: boolean; act: boolean }[] = [];
  const now = new Date().toISOString();
  for (const p of prev) {
    replacedTotals.push(Math.round(p.total ?? 0));
    // Подписанных здесь нет (выше — отказ), так что «есть ссылка» = неподписанный документ
    replaced.push({ total: Math.round(p.total ?? 0), contract: !!p.contractPublicId, act: !!p.actPublicId });
    await tx.estimate.update({
      where: { id: p.id },
      data: {
        status: "REVISED",
        ...(p.contractPublicId && { contractTextSnapshot: marked(p.contractTextSnapshot, estimateId, now) }),
        ...(p.actPublicId && { actTextSnapshot: marked(p.actTextSnapshot, estimateId, now) }),
      },
    });
  }
  if (objectId) {
    await tx.estimate.updateMany({
      where: { measurementObjectId: objectId, id: { not: estimateId }, deletedAt: null, status: { in: ["SENT", "VIEWED"] } },
      data: { status: "REVISED" },
    });
  }
  // Само КП: пометки «заменён» (мастер вернулся к прежнему варианту) снимаем — документы снова действуют.
  const clearContract = hasMark(self.contractTextSnapshot);
  const clearAct = hasMark(self.actTextSnapshot);
  await tx.estimate.update({
    where: { id: estimateId },
    data: {
      status: "CONFIRMED",
      ...(clearContract && { contractTextSnapshot: (unmarked(self.contractTextSnapshot) ?? Prisma.DbNull) as never }),
      ...(clearAct && { actTextSnapshot: (unmarked(self.actTextSnapshot) ?? Prisma.DbNull) as never }),
    },
  });
  return { replacedTotals, replaced };
}

/**
 * Какие из КП несут пометку «заменён» на неподписанном документе — для списков CRM,
 * где снимок не выбирается (он тяжёлый у подписанных). jsonb_exists — без чтения JSON.
 */
export async function replacedDocIds(ids: string[], doc: "contract" | "act"): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { prisma } = await import("@/lib/prisma");
  const rows = doc === "contract"
    ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Estimate" WHERE id = ANY(${ids}) AND "contractSignedAt" IS NULL AND jsonb_exists("contractTextSnapshot", 'replacedByEstimateId')`
    : await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Estimate" WHERE id = ANY(${ids}) AND "actSignedAt" IS NULL AND jsonb_exists("actTextSnapshot", 'replacedByEstimateId')`;
  return new Set(rows.map((r) => r.id));
}
