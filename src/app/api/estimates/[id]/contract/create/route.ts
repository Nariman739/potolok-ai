import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addClientEvent } from "@/lib/clients";
import crypto from "crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
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

    // Идемпотентность — если уже создан, просто возвращаем существующий
    if (estimate.contractPublicId) {
      return NextResponse.json({
        contractPublicId: estimate.contractPublicId,
        contractCreatedAt: estimate.contractCreatedAt,
        contractSignedAt: estimate.contractSignedAt,
      });
    }

    const contractPublicId = crypto.randomUUID();
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
      version: 1,
      createdAt: new Date().toISOString(),
    };

    await prisma.estimate.update({
      where: { id },
      data: {
        contractPublicId,
        contractCreatedAt: new Date(),
        contractTextSnapshot: snapshot as unknown as object,
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
