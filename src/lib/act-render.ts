/**
 * Акт приёмки: сбор данных и печать (27.09.2026).
 *
 * Одна точка входа для публичной страницы и для снимка при подписи —
 * клиент читает ровно то, что потом замораживается под его подписью.
 * «Оплачено» берётся из платежей объекта на момент печати.
 */
import { prisma } from "./prisma";
import { generateActHtml, type ActData, type MasterData } from "./contract-html";
import { asLang, type Lang } from "./i18n";
import type { CalculationResult } from "./types";

export type ActEstimate = {
  publicId: string;
  clientName: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  total: number;
  createdAt: Date;
  measurementObjectId: string | null;
  actCompletionDate: Date | null;
  actSignedAt: Date | null;
  actSignerName: string | null;
  actSignerIp: string | null;
  actSignMethod: string | null;
  actRemarks: unknown;
  actRemarksDueDays: number | null;
  actClientRemarks: string | null;
  actClientRemarksAt: Date | null;
  actObjectNotes: string | null;
  actPhotos: unknown;
};

/** Сколько клиент уже заплатил по объекту этого КП. */
export async function paidForEstimate(measurementObjectId: string | null): Promise<number> {
  if (!measurementObjectId) return 0;
  try {
    const agg = await prisma.payment.aggregate({
      where: { measurementObjectId },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  } catch {
    return 0;
  }
}

export function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export async function buildActData(e: ActEstimate): Promise<ActData> {
  const paid = await paidForEstimate(e.measurementObjectId);
  return {
    publicId: e.publicId,
    clientName: e.actSignerName || e.clientName,
    clientPhone: e.clientPhone,
    clientAddress: e.clientAddress,
    total: e.total,
    paid,
    contractDate: e.createdAt,
    actDate: e.actSignedAt ?? e.actCompletionDate ?? new Date(),
    remarks: stringList(e.actRemarks),
    remarksDueDays: e.actRemarksDueDays,
    clientRemarks: e.actClientRemarks,
    clientRemarksAt: e.actClientRemarksAt,
    objectNotes: e.actObjectNotes,
    photos: stringList(e.actPhotos),
    signed: e.actSignedAt && e.actSignerName
      ? { name: e.actSignerName, at: e.actSignedAt, method: e.actSignMethod, ip: e.actSignerIp }
      : null,
  };
}

export async function renderAct(
  master: MasterData,
  e: ActEstimate,
  calc: CalculationResult,
  language: Lang | string = "ru",
): Promise<string> {
  const data = await buildActData(e);
  return generateActHtml(master, data, calc, asLang(language));
}

/** Поля мастера, нужные акту — общий select для страницы и подписи. */
export const ACT_MASTER_SELECT = {
  firstName: true,
  lastName: true,
  companyName: true,
  phone: true,
  whatsappPhone: true,
  address: true,
  contractType: true,
  bin: true,
  iin: true,
  legalName: true,
  legalAddress: true,
  bankName: true,
  iban: true,
  kbe: true,
  bik: true,
  passportData: true,
  prepaymentPercent: true,
  warrantyMaterials: true,
  warrantyInstall: true,
  contractCity: true,
  language: true,
} as const;
