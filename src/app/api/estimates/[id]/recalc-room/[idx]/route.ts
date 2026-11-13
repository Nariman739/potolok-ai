import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEstimateLocked, estimateLockMessage } from "@/lib/estimate-lock";
import { getScope, inScope, currencyFor } from "@/lib/company";
import { calculate } from "@/lib/calculate";
import { buildRoomInputFromDesigner } from "@/lib/room-input-builder";
import type { CalculationResult, RoomInput, RoomResult } from "@/lib/types";
import { resolveAdjust, estimateAdjustData, discountInputFromState, persistPartner, partnerRoomBases } from "@/lib/kp-adjust-server";
import { scaleCalc, sumCalc, computeDiscount, computePartner } from "@/lib/kp-adjust";
import { priceBookCompanyId, priceMapFor, customItemsMapFor, ownItemsByIdFor } from "@/lib/price-items";
import { reportError } from "@/lib/report-error";

interface DesignerPayload {
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  cornerRadii?: number[];
  area: number;
  perimeter: number;
  elements: Parameters<typeof buildRoomInputFromDesigner>[0]["elements"];
  previewUrl3d?: string;
  name?: string;
}

/** Порядок ключей и отсутствующие поля не считаются правкой. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

type SavedDrawing = { walls?: number[]; angles?: number[]; normalCorners?: boolean[]; elements?: unknown[] };

/** Те же стены и углы, что сохранены в КП. Пустые углы и повороты сравнивать не с чем. */
function sameGeometry(saved: SavedDrawing, next: DesignerPayload): boolean {
  if (!same(saved.walls, next.walls)) return false;
  if (saved.angles?.length && next.angles?.length && !same(saved.angles, next.angles)) return false;
  if (saved.normalCorners?.length && next.normalCorners?.length && !same(saved.normalCorners, next.normalCorners)) return false;
  return true;
}

/**
 * POST /api/estimates/[id]/recalc-room/[idx]
 * Принимает обновлённый чертёж одной комнаты, перестраивает её RoomInput,
 * пересчитывает позиции только этой комнаты и сохраняет; строки остальных
 * комнат и «Дополнительно» остаются как в сохранённом КП.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; idx: string }> }
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id, idx: idxStr } = await params;
    const idx = Number(idxStr);
    if (!Number.isFinite(idx) || idx < 0) {
      return NextResponse.json(
        { error: "Неверный индекс комнаты" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { designer: DesignerPayload };
    if (!body.designer) {
      return NextResponse.json(
        { error: "Нет данных чертежа" },
        { status: 400 }
      );
    }

    const estimate = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      include: { partner: { select: { amount: true, percent: true, coef: true } } },
    });
    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }
    if (isEstimateLocked(estimate)) {
      return NextResponse.json({ error: estimateLockMessage(estimate) }, { status: 409 });
    }

    const roomsData = (estimate.roomsData as unknown as RoomInput[]) ?? [];
    if (idx >= roomsData.length) {
      return NextResponse.json(
        { error: "Комната не найдена" },
        { status: 404 }
      );
    }

    // Собираем обновлённый RoomInput, опираясь на старый (чтобы сохранить ручные настройки).
    const existingRoom = roomsData[idx];
    const newName = body.designer.name?.trim() || existingRoom.name;
    const savedDrawing = (existingRoom.designerData ?? existingRoom) as unknown as SavedDrawing;
    const geometryUnchanged = sameGeometry(savedDrawing, body.designer);

    // Чертёж не меняли: количества, цены и сумма КП остаются как сохранены.
    if (geometryUnchanged && same(savedDrawing.elements ?? [], body.designer.elements ?? [])) {
      if (newName !== existingRoom.name) {
        const calc = estimate.calculationData as unknown as CalculationResult;
        await prisma.estimate.update({
          where: { id },
          data: {
            roomsData: roomsData.map((r, i) => (i === idx ? { ...r, name: newName } : r)) as unknown as object,
            calculationData: {
              ...calc,
              roomResults: calc.roomResults?.map((r, i) => (i === idx ? { ...r, roomName: newName } : r)),
            } as unknown as object,
          },
        });
        revalidatePath(`/dashboard/estimates/${id}`);
        revalidatePath(`/dashboard/estimates/${id}/edit-room/${idx}`);
      }
      return NextResponse.json({ success: true, total: estimate.total, previousTotal: estimate.total, unchanged: true });
    }

    const builtRoom = buildRoomInputFromDesigner(
      {
        id: existingRoom.id,
        name: newName,
        walls: body.designer.walls,
        normalCorners: body.designer.normalCorners,
        angles: body.designer.angles,
        cornerRadii: body.designer.cornerRadii,
        area: body.designer.area,
        perimeter: body.designer.perimeter,
        elements: body.designer.elements,
        previewUrl3d: body.designer.previewUrl3d,
      },
      { ...existingRoom, name: newName }
    );
    // Меняли только элементы: площадь и периметр остаются теми, по которым сохранено КП.
    // Чертёж становится источником площади только при правке формы или размеров.
    const keepsSavedArea = geometryUnchanged && Number.isFinite(existingRoom.length) && Number.isFinite(existingRoom.width);
    const updatedRoom: RoomInput = keepsSavedArea
      ? {
          ...builtRoom,
          length: existingRoom.length,
          width: existingRoom.width,
          shape: existingRoom.shape,
          measuredArea: existingRoom.measuredArea,
          measuredPerimeter: existingRoom.measuredPerimeter,
          measuredMinWidth: existingRoom.measuredMinWidth,
          measuredRect: existingRoom.measuredRect,
        }
      : builtRoom;

    const newRoomsData = roomsData.map((r, i) => (i === idx ? updatedRoom : r));

    // Готовим prices и custom items для пересчёта (как в /api/calculate).
    const companyId = await priceBookCompanyId(scope.ownerId);
    const currency = await currencyFor(scope.ownerId);
    const priceMap = await priceMapFor(companyId, currency);
    const customItemsMap = await customItemsMapFor(companyId);
    const ownItemsById = await ownItemsByIdFor(companyId);

    // Итоги площади/периметра/софитов — по всем комнатам; позиции берём ТОЛЬКО
    // у комнаты idx. Остальные комнаты считаются здесь лишь ради этих итогов.
    const fresh: CalculationResult = calculate(newRoomsData, priceMap, customItemsMap, undefined, ownItemsById, currency);
    const savedCalc = estimate.calculationData as unknown as CalculationResult | null;

    // Правка одной комнаты не трогает остальные (10.11.2026). Раньше calculate()
    // пересчитывал все комнаты по текущему прайсу: в старом КП менялись полотно,
    // пары софитов и цены комнат, которые мастер не открывал, и пропадал блок
    // «Дополнительно». Теперь строки других комнат и «Дополнительно» остаются
    // как сохранены, комната idx встаёт на своё место.
    if (Array.isArray(savedCalc?.roomResults) && savedCalc.roomResults.length === roomsData.length) {
      // В сохранённых ценах уже сидит посредник (коэффициент coef).
      const p = estimate.partner;
      const coef = p?.coef && p.coef > 0 ? p.coef : 1;
      const partnerPercent = p?.percent != null && p.percent > 0 ? p.percent : null;
      const freshRoom = fresh.roomResults[idx];
      const newRoomBase = freshRoom.subtotalAfterHeight ?? freshRoom.subtotal ?? 0;
      // Остальные комнаты и «Дополнительно» как сохранены: их цены и сколько в них посредника.
      const otherPrices = sumCalc({ ...savedCalc, roomResults: savedCalc.roomResults.filter((_, i) => i !== idx) });
      let otherBase = otherPrices / coef;
      // Посредник в %: коэффициент везде один — новой комнате тот же.
      // Посредник суммой: новая комната несёт остаток суммы, которого нет в ценах
      // остальных (это доля старой комнаты idx). Так в ценах всегда ровно сумма
      // мастера, и расхождение не копится от правки к правке.
      const partnerAmount = p && p.amount > 0 && coef > 1 && partnerPercent == null ? p.amount : null;
      if (partnerAmount != null) {
        // Комнаты стоят по разным коэффициентам — база каждой из меток partnerBase/partnerPrice
        // (см. partnerRoomBases; без меток комната «старая», по общему c0).
        const pb = partnerRoomBases(savedCalc, partnerAmount, coef);
        otherBase = pb.totalBase - pb.baseOf(savedCalc.roomResults[idx]);
      }
      const roomCoef =
        partnerAmount != null
          ? newRoomBase > 0 ? 1 + Math.max(0, partnerAmount - (otherPrices - otherBase)) / newRoomBase : 1
          : coef;
      const scaled = roomCoef === 1 ? freshRoom : scaleCalc({ roomResults: [freshRoom], total: 0 }, roomCoef).roomResults[0];
      const room: RoomResult =
        partnerAmount != null
          ? ({ ...scaled, partnerBase: newRoomBase, partnerPrice: scaled.subtotalAfterHeight } as RoomResult)
          : scaled;
      const roomResults = savedCalc.roomResults.map((r, i) => (i === idx ? room : r));
      const sum = sumCalc({ ...savedCalc, roomResults });
      // Минимальный заказ, применённый в КП, держим как был (его сумма — в calc.total);
      // иначе — порог по текущему прайсу, как при обычном расчёте.
      const floor = savedCalc.minOrderApplied
        ? Math.round(savedCalc.total)
        : calculate([], priceMap).total;
      const clientPrice = Math.max(sum, floor);
      const discount = computeDiscount(clientPrice, discountInputFromState(estimate));
      if (clientPrice > 0 && discount.amount >= clientPrice) {
        return NextResponse.json({ error: "Скидка не может быть больше суммы КП" }, { status: 400 });
      }
      const total = clientPrice - discount.amount;
      if (!Number.isFinite(total)) {
        return NextResponse.json({ error: "Не удалось пересчитать: у комнаты нет размеров" }, { status: 400 });
      }
      const calculationData: CalculationResult = {
        ...savedCalc,
        rooms: newRoomsData,
        roomResults,
        subtotal: clientPrice,
        total: clientPrice,
        minOrderApplied: clientPrice > sum,
        totalArea: fresh.totalArea,
        totalPerimeter: fresh.totalPerimeter,
        totalSpots: fresh.totalSpots,
        totalChandeliers: fresh.totalChandeliers,
        pricePerM2: fresh.totalArea > 0 ? Math.round(clientPrice / fresh.totalArea) : 0,
        calculatedAt: fresh.calculatedAt,
      };

      await prisma.estimate.update({
        where: { id },
        data: {
          roomsData: newRoomsData as unknown as object,
          calculationData: calculationData as unknown as object,
          total,
          standardTotal: total,
          discountPercent: discount.percent,
          discountAmount: discount.amount,
          totalArea: calculationData.totalArea,
        },
      });
      // Посредник в %: его сумма идёт от суммы по прайсу, она изменилась. Коэффициент
      // тот же, поэтому цены остальных комнат не трогаем.
      if (partnerPercent != null) {
        await persistPartner(id, computePartner(Math.round(clientPrice / coef), { mode: "percent", value: partnerPercent }));
      }
      // Посредник суммой: сумма — как ввёл мастер; коэффициент — для записи, от новой
      // суммы по прайсу (по нему следующая правка скидки/позиций снимет наценку).
      if (partnerAmount != null) {
        const base = otherBase + newRoomBase;
        if (base > 0) {
          await persistPartner(id, { amount: partnerAmount, percent: null, coef: (base + partnerAmount) / base });
        }
      }

      revalidatePath(`/dashboard/estimates/${id}`);
      revalidatePath(`/dashboard/estimates/${id}/edit-room/${idx}`);
      return NextResponse.json({ success: true, total, previousTotal: estimate.total, areaFromDrawing: !keepsSavedArea });
    }

    // Старое КП без позиций по комнатам — сопоставить не с чем, считаем всё КП заново.
    // calculate() даёт цены по прайсу (без посредника) — накладываем скидку и
    // посредника КП заново, иначе пересчёт одной комнаты сбрасывал бы оба.
    const adjust = resolveAdjust(
      fresh,
      { discount: undefined, partner: undefined },
      estimate,
      { calcIsBase: true }
    );
    const newCalc = adjust.calculationData;
    if (!Number.isFinite(adjust.total)) {
      return NextResponse.json({ error: "Не удалось пересчитать: у комнаты нет размеров" }, { status: 400 });
    }

    await prisma.estimate.update({
      where: { id },
      data: {
        roomsData: newRoomsData as unknown as object,
        ...estimateAdjustData(adjust),
        totalArea: newCalc.totalArea,
      },
    });

    // Сбрасываем кеш RSC — иначе страница КП и редактор показывают старый snapshot.
    revalidatePath(`/dashboard/estimates/${id}`);
    revalidatePath(`/dashboard/estimates/${id}/edit-room/${idx}`);

    return NextResponse.json({ success: true, total: adjust.total, previousTotal: estimate.total, areaFromDrawing: !keepsSavedArea });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    reportError(error, "estimates/[id]/recalc-room/[idx]", "Recalc room error");
    return NextResponse.json(
      { error: "Ошибка пересчёта комнаты" },
      { status: 500 }
    );
  }
}
