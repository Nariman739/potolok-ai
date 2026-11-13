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
import type { Prisma } from "@/generated/prisma/client";

import { PREV_ACT_SIGNED_TEXT, PREV_CONTRACT_SIGNED_TEXT } from "./estimate-replace-text";
export {
  CONTRACT_REPLACED_TEXT,
  CONTRACT_REPLACED_TEXT_KK,
  MASTER_CONTRACT_REPLACED_TEXT,
  PREV_CONTRACT_SIGNED_TEXT,
  PREV_ACT_SIGNED_TEXT,
} from "./estimate-replace-text";

type Snapshot = Record<string, unknown> & { replacedByEstimateId?: string; replacedAt?: string };

/** Договор этого КП заменён новым вариантом (и не подписан). */
export function isContractReplaced(e: { contractSignedAt: Date | string | null; contractTextSnapshot: unknown }): boolean {
  if (e.contractSignedAt) return false;
  const s = e.contractTextSnapshot as Snapshot | null;
  return !!s && typeof s === "object" && typeof s.replacedByEstimateId === "string";
}

export class ReplaceBlockedError extends Error {
  constructor(public readonly kind: "contract" | "act") {
    super(kind === "contract" ? PREV_CONTRACT_SIGNED_TEXT : PREV_ACT_SIGNED_TEXT);
    this.name = "ReplaceBlockedError";
  }
}

type LockedRow = {
  id: string;
  status: string;
  total: number | null;
  contractPublicId: string | null;
  contractSignedAt: Date | null;
  actSignedAt: Date | null;
  contractTextSnapshot: unknown;
};

/**
 * В транзакции: это КП → CONFIRMED; прежние CONFIRMED объекта → REVISED (с пометкой
 * «заменён» на неподписанном договоре); отправленные SENT/VIEWED → REVISED, как раньше.
 * Бросает ReplaceBlockedError, если по прежнему принятому КП подписан договор/акт.
 * Возвращает итоги разжалованных КП (для записи в ленту мастера).
 */
export async function confirmReplacing(
  tx: Prisma.TransactionClient,
  estimateId: string,
  objectId: string | null,
): Promise<{ replacedTotals: number[] }> {
  const replacedTotals: number[] = [];
  if (objectId) {
    const prev = await tx.$queryRaw<LockedRow[]>`
      SELECT id, status, total, "contractPublicId", "contractSignedAt", "actSignedAt", "contractTextSnapshot"
      FROM "Estimate"
      WHERE "measurementObjectId" = ${objectId} AND id <> ${estimateId}
        AND status = 'CONFIRMED' AND "deletedAt" IS NULL
      FOR UPDATE`;
    const signed = prev.find((p) => p.contractSignedAt || p.actSignedAt);
    if (signed) throw new ReplaceBlockedError(signed.contractSignedAt ? "contract" : "act");
    const now = new Date().toISOString();
    for (const p of prev) {
      replacedTotals.push(Math.round(p.total ?? 0));
      await tx.estimate.update({
        where: { id: p.id },
        data: {
          status: "REVISED",
          ...(p.contractPublicId && {
            contractTextSnapshot: { ...((p.contractTextSnapshot as Snapshot | null) ?? {}), replacedByEstimateId: estimateId, replacedAt: now } as object,
          }),
        },
      });
    }
    await tx.estimate.updateMany({
      where: { measurementObjectId: objectId, id: { not: estimateId }, deletedAt: null, status: { in: ["SENT", "VIEWED"] } },
      data: { status: "REVISED" },
    });
  }
  // Само КП: если его договор был помечен «заменён» (мастер вернулся к прежнему
  // варианту) — пометку снимаем, договор снова действует.
  const [self] = await tx.$queryRaw<LockedRow[]>`
    SELECT id, status, total, "contractPublicId", "contractSignedAt", "actSignedAt", "contractTextSnapshot"
    FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`;
  const snap = (self?.contractTextSnapshot as Snapshot | null) ?? null;
  const clearMark = !!snap && typeof snap === "object" && "replacedByEstimateId" in snap;
  if (clearMark) {
    delete snap.replacedByEstimateId;
    delete snap.replacedAt;
  }
  await tx.estimate.update({
    where: { id: estimateId },
    data: { status: "CONFIRMED", ...(clearMark && { contractTextSnapshot: snap as object }) },
  });
  return { replacedTotals };
}
