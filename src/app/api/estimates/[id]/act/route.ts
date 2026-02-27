import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateActHtml } from "@/lib/contract-html";
import type { CalculationResult } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const masterAuth = await requireAuth();
    const { id } = await params;

    const master = await prisma.master.findUnique({
      where: { id: masterAuth.id },
    });

    if (!master || !master.contractType || master.contractType === "none") {
      return NextResponse.json(
        { error: "Настройте тип договора в разделе Профиль" },
        { status: 400 }
      );
    }

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    if (estimate.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Акт доступен только для подтверждённых КП" },
        { status: 400 }
      );
    }

    const calc = estimate.calculationData as unknown as CalculationResult;

    const html = generateActHtml(
      {
        firstName: master.firstName,
        lastName: master.lastName,
        companyName: master.companyName,
        phone: master.phone,
        whatsappPhone: master.whatsappPhone,
        address: master.address,
        contractType: master.contractType,
        bin: master.bin,
        iin: master.iin,
        legalName: master.legalName,
        legalAddress: master.legalAddress,
        bankName: master.bankName,
        iban: master.iban,
        kbe: master.kbe,
        bik: master.bik,
        passportData: master.passportData,
        prepaymentPercent: master.prepaymentPercent,
        warrantyMaterials: master.warrantyMaterials,
        warrantyInstall: master.warrantyInstall,
        contractCity: master.contractCity,
      },
      {
        publicId: estimate.publicId,
        clientName: estimate.clientName,
        clientPhone: estimate.clientPhone,
        clientAddress: estimate.clientAddress,
        total: estimate.total || estimate.standardTotal || 0,
        createdAt: estimate.createdAt,
      },
      calc
    );

    const clientLabel = estimate.clientName || "client";
    const filename = `Акт-${clientLabel}-${estimate.publicId.slice(0, 8)}.html`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Act generation error:", error);
    return NextResponse.json(
      { error: "Ошибка генерации акта" },
      { status: 500 }
    );
  }
}
