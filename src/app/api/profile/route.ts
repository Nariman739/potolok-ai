import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENCY_CODES } from "@/lib/currency";
import { KP_PRICE_VIEWS } from "@/lib/kp/types";
import { DEFAULT_KP_CONFIG } from "@/lib/kp/templates";

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

    const updateData: Record<string, string | number | boolean | object> = {};
    // Настройки дизайнера мобилки (13.10.2026): { hiddenPalette: string[] }.
    // Храним на сервере, чтобы скрытые карточки не терялись при переустановке.
    if ("designerPrefs" in body) {
      const dp = body.designerPrefs;
      if (!dp || typeof dp !== "object" || Array.isArray(dp)) {
        return NextResponse.json({ error: "designerPrefs должен быть объектом" }, { status: 400 });
      }
      const hidden = Array.isArray(dp.hiddenPalette)
        ? dp.hiddenPalette.filter((k: unknown) => typeof k === "string" && k.length <= 120).slice(0, 300)
        : [];
      updateData.designerPrefs = { hiddenPalette: hidden };
    }
    // Дефолтный вид цен для новых КП (16.10.2026): detailed | summary. Живёт
    // в kpConfig рядом с остальными настройками КП, остальное там не трогаем.
    if ("kpPriceView" in body) {
      if (!KP_PRICE_VIEWS.includes(body.kpPriceView)) {
        return NextResponse.json({ error: "Неизвестный вид КП" }, { status: 400 });
      }
      const current = await prisma.master.findUnique({ where: { id: master.id }, select: { kpConfig: true } });
      const raw = current?.kpConfig && typeof current.kpConfig === "object" ? (current.kpConfig as Record<string, unknown>) : null;
      // У мастера, который брендинг на сайте не открывал, kpConfig пуст: кладём
      // дефолт шаблона целиком, иначе редактор брендинга получит объект без секций.
      const cfg = raw && Array.isArray(raw.sections) && raw.sections.length > 0
        ? raw
        : { ...(JSON.parse(JSON.stringify(DEFAULT_KP_CONFIG)) as Record<string, unknown>), ...(raw ?? {}) };
      updateData.kpConfig = { ...cfg, priceView: body.kpPriceView };
    }
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
