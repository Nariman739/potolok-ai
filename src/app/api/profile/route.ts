import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const master = await requireAuth();
    return NextResponse.json(master);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "Ошибка получения профиля" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const master = await requireAuth();
    const body = await request.json();

    const allowedFields = [
      "firstName",
      "lastName",
      "phone",
      "companyName",
      "brandColor",
      "instagramUrl",
      "whatsappPhone",
      "address",
      "contractType",
      "bin",
      "iin",
      "legalName",
      "legalAddress",
      "bankName",
      "iban",
      "kbe",
      "bik",
      "passportData",
      "contractCity",
    ];

    const intFields = ["prepaymentPercent", "warrantyMaterials", "warrantyInstall"];

    const updateData: Record<string, string | number> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }
    for (const field of intFields) {
      if (field in body) {
        updateData[field] = parseInt(body[field], 10) || 0;
      }
    }

    await prisma.master.update({
      where: { id: master.id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления профиля" },
      { status: 500 }
    );
  }
}
