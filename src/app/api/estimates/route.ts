import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { readAdjustInputs, resolveAdjust, persistPartner, estimateAdjustData } from "@/lib/kp-adjust-server";
import { KpAdjustError } from "@/lib/kp-adjust-server";
import type { CalculationResult } from "@/lib/types";
import { KP_LIMITS } from "@/lib/constants";
import { getOrCreateClient, addClientEvent } from "@/lib/clients";
import { withIdempotency } from "@/lib/idempotency";

export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);

    const estimates = await prisma.estimate.findMany({
      where: { ...inScope(scope), deletedAt: null },
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

/**
 * Создание КП идемпотентно (21.09.2026): мобилка шлёт X-Op-Id, и если ответ
 * потерялся на плохой связи, повтор вернёт то же КП, а не создаст второе
 * (вместе со вторым объектом, клиентом и +1 к месячному счётчику).
 */
export async function POST(request: Request) {
  let masterId: string;
  try {
    masterId = (await requireAuth()).id;
  } catch {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  return withIdempotency(request, masterId, "POST /estimates", () => createEstimate(request));
}

async function createEstimate(request: Request): Promise<NextResponse> {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);

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

    // CRM: link with existing client by id, or get-or-create by name/phone
    let linkedClientId: string | null = null;
    if (providedClientId) {
      const existing = await prisma.client.findFirst({
        where: { id: providedClientId, ...inScope(scope) },
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

    // Объект (замер), из которого считают КП: связь нужна для кнопки «В цех»
    // на экране КП. Всё в try/catch — сбой базы (у Neon бывает cold start)
    // не должен стоить мастеру самого КП, максимум связи.
    let linkedMeasurementId: string | null = null;
    try {
      if (fromMeasurementId) {
        const m = await prisma.measurementObject.findFirst({
          where: { id: fromMeasurementId, ...inScope(scope), deletedAt: null },
          select: { id: true },
        });
        linkedMeasurementId = m?.id ?? null;
      }

      // Мастер мог посчитать КП прямо из свежего замера, не нажимая «Сохранить»
      // (это основной путь: «Создать КП» на экране замеров стоит выше кнопки
      // сохранения). Тогда объекта ещё нет — создаём его сами, молча, из тех же
      // комнат. Иначе объект не попадёт в ленту и потолки будет нечем отправить
      // в цех — ровно то, ради чего всё и затевалось (19.09.2026).
      if (!linkedMeasurementId && Array.isArray(roomsData)) {
        type RawRoom = {
          name?: string; walls?: number[]; angles?: number[]; bulges?: number[];
          cornerRadii?: number[]; area?: number; perimeter?: number; elements?: unknown[];
          columns?: unknown[]; wallProfiles?: Record<string, string>; variantOverrides?: Record<string, string>;
        };
        const rooms = (roomsData as RawRoom[]).filter(
          (r) => r && Array.isArray(r.walls) && r.walls.length >= 3,
        );
        // 1) Точная привязка: комнаты уже лежат на сервере (у них есть serverId),
        // значит объект существует — берём его по id комнаты. Без гаданий.
        const roomServerIds = (roomsData as { serverId?: unknown }[])
          .map((r) => (r && typeof r.serverId === "string" ? r.serverId : null))
          .filter((x): x is string => !!x);
        if (roomServerIds.length > 0) {
          const byRoom = await prisma.measurementObject.findFirst({
            where: { ...inScope(scope), deletedAt: null, rooms: { some: { id: { in: roomServerIds } } } },
            select: { id: true },
          });
          if (byRoom) linkedMeasurementId = byRoom.id;
        }
        // 2) Защита от дублей по совпадению стен (Нариман, 20.09: «Толе би 26» и
        // «Гульмира» с одинаковыми 8 комнатами). 21.09: одних стен мало — комната
        // 3×4 есть у каждого второго клиента, и КП нового замера прилипало к
        // чужому объекту. Теперь нужны ещё: нет противоречия по клиенту/адресу
        // и (тот же клиент, или тот же адрес, или свежий объект без КП).
        if (!linkedMeasurementId && rooms.length > 0) {
          const signature = (list: { walls?: unknown }[]) =>
            list.map((r) => (Array.isArray(r.walls) ? (r.walls as number[]).map((w) => Math.round(w)).join(",") : "")).sort().join("|");
          const norm = (v?: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
          const wanted = signature(rooms);
          const totalWanted = Math.round(rooms.reduce((sum, r) => sum + (r.area ?? 0), 0) * 10) / 10;
          const candidates = await prisma.measurementObject.findMany({
            where: {
              ...inScope(scope),
              deletedAt: null,
              totalArea: { gte: totalWanted - 0.2, lte: totalWanted + 0.2 },
            },
            select: {
              id: true, clientId: true, address: true, updatedAt: true,
              client: { select: { name: true, phone: true } },
              rooms: { select: { walls: true } },
              _count: { select: { estimates: { where: { deletedAt: null } } } },
            },
            take: 20,
            orderBy: { updatedAt: "desc" },
          });
          // Свежесть — 2 часа: страховка от «сохранил замер и тут же посчитал КП с потерянной
          // связью». Днями мерить нельзя: одинаковые квартиры в одном ЖК склеивались бы.
          const freshAfter = Date.now() - 2 * 60 * 60 * 1000;
          const wantedAddress = norm(clientAddress);
          const same = candidates.find((c) => {
            if (c.rooms.length !== rooms.length || signature(c.rooms) !== wanted) return false;
            const cAddress = norm(c.address);
            const sameClient = !!c.clientId && !!linkedClientId && c.clientId === linkedClientId;
            const sameAddress = !!cAddress && cAddress === wantedAddress;
            // Клиент «другой», только если это видно по данным: разные телефоны,
            // а без телефонов — разные имена. Один и тот же человек мог быть
            // заведён дважды (сначала имя, потом имя + номер) — это не конфликт.
            const cPhone = (c.client?.phone ?? "").replace(/\D/g, "");
            const wPhone = (clientPhone ?? "").replace(/\D/g, "");
            const otherClient =
              !sameClient && !!c.clientId &&
              (cPhone && wPhone
                ? cPhone.slice(-10) !== wPhone.slice(-10)
                : !!norm(c.client?.name) && !!norm(clientName) && norm(c.client?.name) !== norm(clientName));
            const conflict =
              otherClient || (!!cAddress && !!wantedAddress && cAddress !== wantedAddress && !sameClient);
            if (conflict) return false;
            const freshNoEstimates = c.updatedAt.getTime() >= freshAfter && c._count.estimates === 0;
            return sameClient || sameAddress || freshNoEstimates;
          });
          if (same) linkedMeasurementId = same.id;
        }
        if (!linkedMeasurementId && rooms.length > 0) {
          const created = await prisma.measurementObject.create({
            data: {
              masterId: master.id,
              clientId: linkedClientId,
              // Адрес важнее всего для ленты объектов. Если мастер его не
              // ввёл — подставляем имя клиента, чтобы объект не назывался
              // «Без адреса» и его можно было найти глазами.
              address: clientAddress || clientName || "",
              status: "saved",
              totalArea: Math.round(rooms.reduce((sum, r) => sum + (r.area ?? 0), 0) * 100) / 100,
              measuredAt: new Date(),
              rooms: {
                create: rooms.map((r, i) => ({
                  name: r.name || `Комната ${i + 1}`,
                  walls: r.walls!,
                  normalCorners: Array.isArray(r.angles)
                    ? r.angles.map((a) => a === 0)
                    : r.walls!.map(() => true),
                  angles: r.angles ?? undefined,
                  arcBulges: r.bulges ?? undefined,
                  cornerRadii: r.cornerRadii ?? undefined,
                  area: r.area ?? 0,
                  perimeter: r.perimeter ?? 0,
                  elements: (r.elements ?? []) as object[],
                  // Типы стен (подшторник, парящий), выбранные варианты и колонны —
                  // без них «+ Ещё вариант» и «В цех» открывали комнату уже голой,
                  // и второй вариант КП выходил дешевле первого (21.09.2026).
                  columns: (r.columns as object[] | undefined) ?? undefined,
                  wallProfiles: r.wallProfiles ?? undefined,
                  variantOverrides: r.variantOverrides ?? undefined,
                  sortOrder: i,
                })),
              },
            },
            select: { id: true },
          });
          linkedMeasurementId = created.id;
        }
      }
    } catch (e) {
      console.warn("Failed to resolve/create measurement for estimate:", e);
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
