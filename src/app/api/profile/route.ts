import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENCY_CODES } from "@/lib/currency";

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
      "onboardingCompleted",
      // Язык мастера: приложение присылает свой выбор, сервер отвечает на нём
      // же — помощник, уведомления, документы клиенту (25.09.2026).
      "language",
      // Валюта цен и документов (07.10.2026): KZT | RUB.
      "currency",
      // Откуда узнал: instagram | friend | other (07.10.2026).
      "source",
    ];

    const intFields = ["prepaymentPercent", "warrantyMaterials", "warrantyInstall"];
    const boolFields = ["onboardingCompleted"];

    const updateData: Record<string, string | number | boolean> = {};
    if ("language" in body && body.language !== "ru" && body.language !== "kk") {
      return NextResponse.json({ error: "Неизвестный язык" }, { status: 400 });
    }
    if ("currency" in body && !CURRENCY_CODES.includes(body.currency)) {
      return NextResponse.json({ error: "Неизвестная валюта" }, { status: 400 });
    }
    if ("source" in body && !["instagram", "friend", "other"].includes(body.source)) {
      return NextResponse.json({ error: "Неизвестный источник" }, { status: 400 });
    }
    for (const field of allowedFields) {
      if (field in body && !boolFields.includes(field)) {
        updateData[field] = body[field];
      }
    }
    for (const field of intFields) {
      if (field in body) {
        updateData[field] = parseInt(body[field], 10) || 0;
      }
    }
    for (const field of boolFields) {
      if (field in body) {
        updateData[field] = Boolean(body[field]);
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
