import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readAdjustInputs, resolveAdjust, persistPartner, estimateAdjustData } from "@/lib/kp-adjust-server";
import { KpAdjustError } from "@/lib/kp-adjust-server";
import type { CalculationResult } from "@/lib/types";
import { KP_LIMITS } from "@/lib/constants";
import { getOrCreateClient, addClientEvent } from "@/lib/clients";

export async function GET() {
  try {
    const master = await requireAuth();

    const estimates = await prisma.estimate.findMany({
      where: { masterId: master.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicId: true,
        clientName: true,
        clientPhone: true,
        totalArea: true,
        total: true,
        standardTotal: true,
        status: true,
        createdAt: true,
        // Нужно для отображения «3 комнаты · 78 м²» в mobile-карточке.
        // Парсим на сервере, чтобы не таскать roomsData/calculationData
        // целиком в списке (там тяжёлые JSON).
        calculationData: true,
      },
    });

    const withCounts = estimates.map((e) => {
      const calc = e.calculationData as { roomResults?: unknown[] } | null;
      const roomsCount = Array.isArray(calc?.roomResults) ? calc!.roomResults!.length : 0;
      const { calculationData: _omit, ...rest } = e;
      return { ...rest, roomsCount };
    });

    return NextResponse.json(withCounts);
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get estimates error:", error);
    return NextResponse.json(
      { error: "Ошибка получения расчётов" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    // Auto-reset KP counter if new month
    const now = new Date();
    const masterDb = await prisma.master.findUnique({
      where: { id: master.id },
      select: { kpGeneratedThisMonth: true, kpMonthReset: true },
    });
    let kpCount = masterDb?.kpGeneratedThisMonth ?? master.kpGeneratedThisMonth;
    if (masterDb) {
      const resetDate = new Date(masterDb.kpMonthReset);
      if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        await prisma.master.update({
          where: { id: master.id },
          data: { kpGeneratedThisMonth: 0, kpMonthReset: now },
        });
        kpCount = 0;
      }
    }

    // Check KP limit
    const limit = KP_LIMITS[master.subscriptionTier];
    if (kpCount >= limit) {
      return NextResponse.json(
        {
          error: `Лимит КП исчерпан (${limit}/мес). Напишите нам — поднимем.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      roomsData,
      calculationData,
      totalArea,
      clientName,
      clientPhone,
      clientAddress,
      clientId: providedClientId,
      // Объект (замер), из которого посчитано КП. Раньше он здесь «съедался» —
      // уходил в корзину, чтобы не висеть в двух местах. Из-за этого ломался
      // главный сценарий: «через 2-3 дня объект стартует — отправить потолки
      // в цех», ведь кнопка «В цех» работает только с живым замером. Так
      // потерялось 128 объектов из 478. С 19.09.2026 замер остаётся жить,
      // а КП просто помнит, из какого объекта посчитано.
      fromMeasurementId,
    } = body;

    if (!roomsData || !calculationData) {
      return NextResponse.json(
        { error: "Данные расчёта обязательны" },
        { status: 400 }
      );
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    // Скидка и посредник считаются ЗДЕСЬ, а не на клиенте: сервер — единственный,
    // кто размазывает посредника по ценам и кладёт итог в total. Старые
    // приложения шлют discountPercent + уже посчитанный total — total игнорируем,
    // discountPercent подхватывается как «скидка в %» (readAdjustInputs).
    const adjust = resolveAdjust(
      calculationData as CalculationResult,
      readAdjustInputs(body),
      null,
      { calcIsBase: true }
    );
    const total = adjust.total;

    // Подхватываем 3D-превью из первой комнаты у которой оно есть
    const room3dPreviewUrl =
      Array.isArray(roomsData)
        ? (roomsData.find((r: { previewUrl3d?: string }) => r?.previewUrl3d)?.previewUrl3d ?? null)
        : null;

    // Объект, из которого считают КП. Проверяем ДО создания, чтобы связь
    // легла сразу в create — и мобилка получила её уже в ответе (от этого
    // зависит кнопка «В цех» на экране КП).
    let linkedMeasurementId: string | null = null;
    if (fromMeasurementId) {
      const m = await prisma.measurementObject.findFirst({
        where: { id: fromMeasurementId, masterId: master.id, deletedAt: null },
        select: { id: true },
      });
      linkedMeasurementId = m?.id ?? null;
    }

    // CRM: link with existing client by id, or get-or-create by name/phone
    let linkedClientId: string | null = null;
    if (providedClientId) {
      const existing = await prisma.client.findFirst({
        where: { id: providedClientId, masterId: master.id },
        select: { id: true },
      });
      linkedClientId = existing?.id ?? null;
    }
    if (!linkedClientId && (clientName || clientPhone)) {
      const auto = await getOrCreateClient({
        masterId: master.id,
        name: clientName || null,
        phone: clientPhone || null,
        address: clientAddress || null,
      });
      linkedClientId = auto?.id ?? null;
    }

    const estimate = await prisma.estimate.create({
      data: {
        masterId: master.id,
        roomsData,
        ...estimateAdjustData(adjust),
        totalArea: totalArea || 0,
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientAddress: clientAddress || null,
        clientId: linkedClientId,
        measurementObjectId: linkedMeasurementId,
        validUntil,
        room3dPreviewUrl,
      },
    });

    await persistPartner(estimate.id, adjust.partner);

    // CRM: log KP_CREATED event
    if (linkedClientId) {
      addClientEvent({
        clientId: linkedClientId,
        type: "KP_CREATED",
        content: total ? `Сумма: ${Math.round(total)} ₸` : null,
        metadata: { estimateId: estimate.id },
      }).catch(() => {});
    }

    // Increment KP counter
    await prisma.master.update({
      where: { id: master.id },
      data: { kpGeneratedThisMonth: { increment: 1 } },
    });

    return NextResponse.json({
      ...estimate,
      partner: adjust.partner.amount > 0 ? adjust.partner : null,
    });
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения расчёта" },
      { status: 500 }
    );
  }
}
