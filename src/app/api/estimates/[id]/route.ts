import { NextResponse } from "next/server";
import { syncClientStatusForObject, addClientEvent, changeClientStatus } from "@/lib/clients";
import { formatPrice } from "@/lib/format";
import { currencyFor } from "@/lib/company";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEstimateLocked, estimateLockMessage } from "@/lib/estimate-lock";
import { getScope, inScope } from "@/lib/company";
import { readAdjustInputs, resolveAdjust, persistPartner, estimateAdjustData } from "@/lib/kp-adjust-server";
import { KpAdjustError } from "@/lib/kp-adjust-server";
import { KP_PRICE_VIEWS } from "@/lib/kp/types";
import type { CalculationResult } from "@/lib/types";
import { reportError } from "@/lib/report-error";

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
    reportError(error, "estimates/[id]", "Get estimate error");
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
      // Вид цен для клиента (16.10.2026). Не считается правкой содержания:
      // версия КП не создаётся, принятое КП переключать можно.
      priceView,
    } = body;
    if (priceView !== undefined && !KP_PRICE_VIEWS.includes(priceView)) {
      return NextResponse.json({ error: "Неизвестный вид КП" }, { status: 400 });
    }

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
    const allowedMasterStatuses = ["DRAFT", "SENT", "REVISED", "REJECTED", "CONFIRMED"];
    if (status !== undefined && !allowedMasterStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Недопустимый статус" },
        { status: 400 }
      );
    }

    // «Выбрал клиент» руками мастера (15.10.2026). Клиент получает PDF в
    // WhatsApp и по ссылке почти не ходит, поэтому «Принято» ставил бы некому.
    // Мастер отмечает выбранный вариант сам; остальные отправленные варианты
    // объекта становятся «пересмотренными», чтобы деньги и этап объекта
    // считались по одной цене.
    if (status === "CONFIRMED") {
      if (!["SENT", "VIEWED", "REVISED"].includes(existing.status)) {
        return NextResponse.json({ error: "Это КП нельзя отметить выбранным" }, { status: 400 });
      }
      const confirmed = await prisma.estimate.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: { partner: { select: { amount: true, percent: true, coef: true } } },
      });
      if (existing.measurementObjectId) {
        await prisma.estimate.updateMany({
          where: {
            measurementObjectId: existing.measurementObjectId,
            id: { not: id },
            deletedAt: null,
            status: { in: ["SENT", "VIEWED"] },
          },
          data: { status: "REVISED" },
        });
        syncClientStatusForObject(existing.measurementObjectId).catch(() => {});
      }
      if (existing.clientId) {
        const currency = await currencyFor(existing.masterId);
        addClientEvent({
          clientId: existing.clientId,
          type: "KP_CONFIRMED",
          content: existing.total ? `Сумма: ${formatPrice(existing.total, currency)} · отметил мастер` : "Отметил мастер",
          metadata: { estimateId: id },
        }).catch(() => {});
        changeClientStatus(existing.clientId, "WON", "Мастер отметил выбранное КП").catch(() => {});
      }
      return NextResponse.json(confirmed);
    }

    // Версии КП (15.10.2026). Мастер отправляет клиенту PDF, потом меняет
    // скидку/наценку в том же КП и отправляет снова — у клиента три разных
    // предложения, а в базе одно, последнее: какое он выбрал, отметить негде
    // (Нариман, 14.10). Поэтому перед правкой уже отправленного КП сохраняем
    // его прежнее состояние отдельной записью на том же объекте, а живая
    // запись становится новым предложением (createdAt — сейчас).
    if (touchesContent && ["SENT", "VIEWED"].includes(existing.status)) {
      // Только расчёт и клиент: договор/акт у отправленного-но-не-подписанного
      // КП пусты, а их уникальные ссылки копировать нельзя.
      const copy = await prisma.estimate.create({
        data: {
          masterId: existing.masterId,
          companyId: existing.companyId,
          clientName: existing.clientName,
          clientPhone: existing.clientPhone,
          clientAddress: existing.clientAddress,
          clientId: existing.clientId,
          measurementObjectId: existing.measurementObjectId,
          roomsData: existing.roomsData ?? {},
          calculationData: existing.calculationData ?? {},
          totalArea: existing.totalArea,
          total: existing.total,
          discountPercent: existing.discountPercent,
          discountAmount: existing.discountAmount,
          economyTotal: existing.economyTotal,
          standardTotal: existing.standardTotal,
          premiumTotal: existing.premiumTotal,
          recommendedVariant: existing.recommendedVariant,
          room3dPreviewUrl: existing.room3dPreviewUrl,
          validUntil: existing.validUntil,
          status: existing.status,
          priceView: existing.priceView,
          createdAt: existing.createdAt,
        },
      });
      if (existing.partner) {
        await prisma.estimatePartner.create({
          data: { estimateId: copy.id, amount: existing.partner.amount, percent: existing.partner.percent, coef: existing.partner.coef },
        });
      }
      await prisma.estimate.update({ where: { id }, data: { createdAt: new Date() } });
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
        ...(priceView !== undefined && { priceView }),
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
    reportError(error, "estimates/[id]", "Update estimate error");
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
    reportError(error, "estimates/[id]", "Delete estimate error");
    return NextResponse.json(
      { error: "Ошибка удаления расчёта" },
      { status: 500 }
    );
  }
}
