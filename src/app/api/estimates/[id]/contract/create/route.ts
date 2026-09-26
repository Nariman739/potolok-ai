import { NextResponse } from "next/server";
import { renderContract } from "@/lib/contract-render";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownerBrandFor, getScope, inScope } from "@/lib/company";
import { addClientEvent } from "@/lib/clients";
import crypto from "crypto";

type PaymentStage = {
  name: string;
  percent: number;
  when: string;
};

const ALLOWED_WHEN = [
  "before_start",
  "on_start_day",
  "on_delivery",
  "after_install",
  "after_act",
] as const;

function validatePaymentSchedule(raw: unknown): PaymentStage[] | null {
  if (!Array.isArray(raw)) return null;
  const stages: PaymentStage[] = [];
  let totalPercent = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const i = item as Record<string, unknown>;
    const name = typeof i.name === "string" ? i.name.trim() : "";
    const percent = Number(i.percent);
    const when = typeof i.when === "string" ? i.when : "";
    if (!name || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
    if (!(ALLOWED_WHEN as readonly string[]).includes(when)) return null;
    totalPercent += percent;
    stages.push({ name, percent, when });
  }
  if (Math.round(totalPercent) !== 100) return null;
  return stages;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      workStartDate,
      workDurationDays,
      paymentSchedule,
    } = body as {
      workStartDate?: string;
      workDurationDays?: number;
      paymentSchedule?: unknown;
    };

    const estimate = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: {
        master: {
          select: {
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
          },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    }
    // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
    estimate.master = await ownerBrandFor(estimate.masterId, estimate.master);

    // Условия договора
    const validatedSchedule = paymentSchedule
      ? validatePaymentSchedule(paymentSchedule)
      : null;
    if (paymentSchedule && !validatedSchedule) {
      return NextResponse.json(
        { error: "Сумма этапов оплаты должна быть 100%, и каждый этап с правильным «когда»." },
        { status: 400 },
      );
    }
    const startDate = workStartDate ? new Date(workStartDate) : null;
    const duration =
      typeof workDurationDays === "number" && workDurationDays > 0
        ? Math.round(workDurationDays)
        : null;

    // Идемпотентность — если уже создан, обновляем условия (но не publicId/snapshot)
    if (estimate.contractPublicId) {
      if (startDate || duration || validatedSchedule) {
        await prisma.estimate.update({
          where: { id },
          data: {
            ...(startDate && { workStartDate: startDate }),
            ...(duration && { workDurationDays: duration }),
            ...(validatedSchedule && {
              paymentSchedule: validatedSchedule as unknown as object,
            }),
          },
        });
      }
      return NextResponse.json({
        contractPublicId: estimate.contractPublicId,
        contractCreatedAt: estimate.contractCreatedAt,
        contractSignedAt: estimate.contractSignedAt,
      });
    }

    const contractPublicId = crypto.randomUUID();
    // Данные для замороженного текста — ровно те, что уходят в живой рендер.
    const contractData = {
      publicId: estimate.publicId,
      clientName: estimate.clientName,
      clientPhone: estimate.clientPhone,
      clientAddress: estimate.clientAddress,
      total: estimate.total,
      createdAt: estimate.createdAt,
      workStartDate: startDate,
      workDurationDays: duration,
      paymentSchedule: validatedSchedule,
    };
    const calcForSnapshot = estimate.calculationData as never;
    const [renderedRu, renderedKk] = await Promise.all([
      renderContract(estimate.masterId, estimate.master, contractData, calcForSnapshot, "ru"),
      renderContract(estimate.masterId, estimate.master, contractData, calcForSnapshot, "kk"),
    ]);

    const snapshot = {
      master: estimate.master,
      estimate: {
        publicId: estimate.publicId,
        clientName: estimate.clientName,
        clientPhone: estimate.clientPhone,
        clientAddress: estimate.clientAddress,
        total: estimate.total,
        createdAt: estimate.createdAt,
        validUntil: estimate.validUntil,
      },
      terms: {
        workStartDate: startDate?.toISOString() ?? null,
        workDurationDays: duration,
        paymentSchedule: validatedSchedule,
      },
      // Готовый текст документа на обоих языках. Подписанный договор рисуется
      // отсюда, а не из живого расчёта: мастер мог потом поправить и цены, и
      // сам шаблон, а под подписью должно остаться ровно то, что человек
      // читал (26.09.2026).
      // Если у мастера свой шаблон — снимок собирается из него (27.09.2026).
      html: { ru: renderedRu.html, kk: renderedKk.html },
      templateVersion: { ru: renderedRu.templateVersion, kk: renderedKk.templateVersion },
      version: 4,
      createdAt: new Date().toISOString(),
    };

    await prisma.estimate.update({
      where: { id },
      data: {
        contractPublicId,
        contractCreatedAt: new Date(),
        contractTextSnapshot: snapshot as unknown as object,
        ...(startDate && { workStartDate: startDate }),
        ...(duration && { workDurationDays: duration }),
        ...(validatedSchedule && {
          paymentSchedule: validatedSchedule as unknown as object,
        }),
      },
    });

    // CRM event
    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "CONTRACT_CREATED",
        content: "Договор создан и готов к отправке клиенту",
        metadata: { estimateId: id, contractPublicId },
      }).catch(() => {});
    }

    return NextResponse.json({
      contractPublicId,
      contractCreatedAt: new Date().toISOString(),
      contractSignedAt: null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create contract error:", error);
    return NextResponse.json(
      { error: "Ошибка создания договора" },
      { status: 500 },
    );
  }
}
