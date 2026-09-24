import { NextResponse } from "next/server";
import { syncClientStatusForObject } from "@/lib/clients";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEstimateLocked, estimateLockMessage } from "@/lib/estimate-lock";
import { getScope, inScope } from "@/lib/company";
import { readAdjustInputs, resolveAdjust, persistPartner, estimateAdjustData } from "@/lib/kp-adjust-server";
import { KpAdjustError } from "@/lib/kp-adjust-server";
import type { CalculationResult } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    // partner — только для мастера (это его вознаграждение посреднику);
    // публичные роуты Estimate с этой связью не читают.
    const estimate = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: {
        partner: { select: { amount: true, percent: true, coef: true } },
        // Нужен, чтобы на экране КП показать кнопку «В цех»: она умеет работать
        // только с живым замером. Если объект удалён — кнопки быть не должно.
        measurementObject: {
          select: { id: true, address: true, deletedAt: true, rooms: { select: { id: true } } },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    const mo = estimate.measurementObject;
    const workshopReady = !!mo && !mo.deletedAt && mo.rooms.length > 0;

    return NextResponse.json({
      ...estimate,
      // Плоские поля для мобилки: id живого объекта и его адрес, либо null.
      workshopMeasurementId: workshopReady ? mo.id : null,
      measurementAddress: workshopReady ? mo.address : null,
    });
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка получения расчёта" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: { partner: { select: { amount: true, percent: true, coef: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    const {
      clientName,
      clientPhone,
      clientAddress,
      status,
      validUntil,
      // Поля для редактирования расчёта (mobile КП editor 1.0.9)
      roomsData,
      calculationData,
      totalArea,
    } = body;

    // Скидка/посредник/позиции: любое из трёх → пересчитываем итог на сервере.
    // Пришедший calculationData считаем текущим состоянием (с уже размазанным
    // посредником, если он был) — resolveAdjust снимет старый коэффициент и
    // положит новый. Присланный `total` не используем: он выводится.
    const inputs = readAdjustInputs(body);
    const touchesMoney =
      calculationData !== undefined || inputs.discount !== undefined || inputs.partner !== undefined;
    const adjust = touchesMoney
      ? resolveAdjust(
          (calculationData ?? existing.calculationData) as CalculationResult,
          inputs,
          existing
        )
      : null;

    // Принятое клиентом КП нельзя тихо переписать (23.09.2026). Раньше можно было
    // изменить сумму или позиции у CONFIRMED и у подписанного договором КП: клиент
    // открывал ссылку и видел «Принято» на цену, которую не согласовывал.
    // Правки цен по договорённости делаются новым вариантом КП («+ Ещё вариант»).
    const touchesContent = touchesMoney || roomsData !== undefined || totalArea !== undefined;
    if (isEstimateLocked(existing) && touchesContent) {
      return NextResponse.json({ error: estimateLockMessage(existing) }, { status: 409 });
    }

    // Validate status transitions that master can do
    const allowedMasterStatuses = ["DRAFT", "SENT", "REVISED", "REJECTED"];
    if (status !== undefined && !allowedMasterStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Недопустимый статус" },
        { status: 400 }
      );
    }
    // Назад по воронке статус сам не едет (24.09.2026). Приложение помечает КП
    // отправленным, когда мастер делится PDF, — а поделиться можно и тем КП,
    // которое клиент уже открыл или принял. Без этой защиты объект падал
    // с «Согласовали» обратно на «Отправил». Явный отказ мастера пропускаем.
    const movesBack =
      status !== undefined &&
      status !== "REJECTED" &&
      ["VIEWED", "CONFIRMED"].includes(existing.status) &&
      ["DRAFT", "SENT"].includes(status);
    const statusToSet = movesBack ? undefined : status;

    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        ...(clientName !== undefined && { clientName }),
        ...(clientPhone !== undefined && { clientPhone }),
        ...(clientAddress !== undefined && { clientAddress }),
        ...(statusToSet !== undefined && { status: statusToSet }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(roomsData !== undefined && { roomsData }),
        ...(totalArea !== undefined && { totalArea: Number(totalArea) || 0 }),
        ...(adjust && estimateAdjustData(adjust)),
      },
    });
    if (adjust) await persistPartner(id, adjust.partner);
    // Отправил КП → клиент в воронке «в работе», а не «новый».
    if (statusToSet !== undefined && existing.measurementObjectId) {
      syncClientStatusForObject(existing.measurementObjectId).catch(() => {});
    }

    return NextResponse.json({
      ...updated,
      partner: adjust
        ? adjust.partner.amount > 0 ? adjust.partner : null
        : existing.partner,
    });
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления расчёта" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Расчёт не найден" },
        { status: 404 }
      );
    }

    // Soft-delete: запись остаётся в БД, восстанавливается через /dashboard/trash.
    // См. PR-A 2026-06-03 — закрывает блокер «удаление КП необратимо» из аудита.
    await prisma.estimate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof KpAdjustError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete estimate error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления расчёта" },
      { status: 500 }
    );
  }
}
