/**
 * «Документы» в карточке объекта (30.09.2026).
 *
 * Договор и акт — по желанию мастера. Акт идёт в паре с договором: нет
 * договора — акт не предлагаем (Нариман 27.09). Здесь же условия сделки для
 * памятки клиенту «Данные для договора»: сумма, предоплата, остаток — чтобы
 * клиент сверил цифры ДО договора.
 */
import { prisma } from "./prisma";

export type ObjectDocs = {
  estimateId: string | null;
  declined: boolean;
  client: { name: string | null; address: string | null; phone: string | null; iin: string | null };
  terms: { total: number; prepaymentPercent: number; prepayment: number; rest: number; paid: number } | null;
  contract: null | {
    publicId: string; url: string; createdAt: string | null; sentAt: string | null;
    signedAt: string | null; signerName: string | null;
  };
  act: null | {
    publicId: string; url: string; createdAt: string | null; sentAt: string | null;
    signedAt: string | null; signerName: string | null; signMethod: string | null;
    clientRemarks: string | null; clientRemarksAt: string | null; photos: string[];
  };
  /** Что предложить мастеру сейчас: одна мягкая подсказка, не больше. */
  suggest: "contract" | "act" | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function objectDocs(params: {
  estimateId: string | null;
  declinedAt: Date | null;
  stage: string;
  paid: number;
  ownerId: string;
}): Promise<ObjectDocs> {
  const empty: ObjectDocs = {
    estimateId: null, declined: !!params.declinedAt,
    client: { name: null, address: null, phone: null, iin: null },
    terms: null, contract: null, act: null, suggest: null,
  };
  if (!params.estimateId) return empty;
  const e = await prisma.estimate.findUnique({
    where: { id: params.estimateId },
    select: {
      id: true, total: true, clientName: true, clientAddress: true, clientPhone: true, clientIin: true,
      paymentSchedule: true,
      contractPublicId: true, contractCreatedAt: true, contractSentAt: true, contractSignedAt: true, contractSignerName: true,
      actPublicId: true, actCreatedAt: true, actSentAt: true, actSignedAt: true, actSignerName: true, actSignMethod: true,
      actClientRemarks: true, actClientRemarksAt: true, actPhotos: true,
    },
  });
  if (!e) return empty;
  const owner = await prisma.master.findUnique({ where: { id: params.ownerId }, select: { prepaymentPercent: true } });
  const schedule = Array.isArray(e.paymentSchedule) ? (e.paymentSchedule as { percent?: number; when?: string }[]) : null;
  const firstPct = schedule?.length && schedule[0]?.when !== "after_act" && schedule[0]?.when !== "after_install"
    ? Number(schedule[0].percent) || 0
    : schedule?.length ? 0 : owner?.prepaymentPercent ?? 50;
  const pct = Math.max(0, Math.min(100, firstPct));
  const total = Math.round(e.total || 0);
  const prepayment = Math.round((total * pct) / 100);

  const declined = !!params.declinedAt;
  const hasContract = !!e.contractPublicId;
  const afterDeal = ["confirmed", "workshop", "installed", "closed"].includes(params.stage);
  const afterInstall = ["installed", "closed"].includes(params.stage);
  const suggest: ObjectDocs["suggest"] = declined
    ? null
    : !hasContract && afterDeal && params.stage !== "closed"
      ? "contract"
      : hasContract && !e.actPublicId && afterInstall
        ? "act"
        : null;

  return {
    estimateId: e.id,
    declined,
    client: { name: e.clientName, address: e.clientAddress, phone: e.clientPhone, iin: e.clientIin },
    terms: { total, prepaymentPercent: pct, prepayment, rest: Math.max(0, total - prepayment), paid: params.paid },
    contract: e.contractPublicId
      ? {
          publicId: e.contractPublicId, url: `https://potolok.ai/contract/${e.contractPublicId}`,
          createdAt: iso(e.contractCreatedAt), sentAt: iso(e.contractSentAt),
          signedAt: iso(e.contractSignedAt), signerName: e.contractSignerName,
        }
      : null,
    act: e.actPublicId
      ? {
          publicId: e.actPublicId, url: `https://potolok.ai/act/${e.actPublicId}`,
          createdAt: iso(e.actCreatedAt), sentAt: iso(e.actSentAt),
          signedAt: iso(e.actSignedAt), signerName: e.actSignerName, signMethod: e.actSignMethod,
          clientRemarks: e.actClientRemarks, clientRemarksAt: iso(e.actClientRemarksAt),
          photos: Array.isArray(e.actPhotos) ? (e.actPhotos as unknown[]).filter((x): x is string => typeof x === "string") : [],
        }
      : null,
    suggest,
  };
}
