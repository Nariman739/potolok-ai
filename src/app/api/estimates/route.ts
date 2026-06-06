import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
          error: `Лимит КП исчерпан (${limit}/мес). Перейдите на PRO для безлимита.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      roomsData,
      calculationData,
      totalArea,
      total,
      discountPercent,
      clientName,
      clientPhone,
      clientAddress,
      clientId: providedClientId,
      // Если КП создан из сохранённого замера — этот замер «съедается»:
      // удаляем его, чтобы один объект не висел в двух местах
      // (в Saved Measurements и внутри Estimate.roomsData).
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

    // Подхватываем 3D-превью из первой комнаты у которой оно есть
    const room3dPreviewUrl =
      Array.isArray(roomsData)
        ? (roomsData.find((r: { previewUrl3d?: string }) => r?.previewUrl3d)?.previewUrl3d ?? null)
        : null;

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
        calculationData,
        totalArea: totalArea || 0,
        total: total || 0,
        discountPercent: parseFloat(discountPercent) || 0,
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientAddress: clientAddress || null,
        clientId: linkedClientId,
        validUntil,
        room3dPreviewUrl,
      },
    });

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

    // Замер «съеден» — он жил в Saved Measurements, теперь его данные внутри
    // Estimate.roomsData. Удаляем чтобы не было двух копий одного замера.
    if (fromMeasurementId) {
      try {
        const m = await prisma.measurementObject.findFirst({
          where: { id: fromMeasurementId, masterId: master.id, deletedAt: null },
          select: { id: true },
        });
        if (m) {
          // Soft-delete: исходный замер «съеден» — лежит в корзине,
          // мастер может восстановить если хочет иметь его отдельно.
          await prisma.measurementObject.update({
            where: { id: m.id },
            data: { deletedAt: new Date() },
          });
        }
      } catch (e) {
        console.warn("Failed to consume measurement after estimate create:", e);
      }
    }

    return NextResponse.json(estimate);
  } catch (error) {
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
