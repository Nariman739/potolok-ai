import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getScope, inScope, currencyFor } from "@/lib/company";
import { priceBookCompanyId, priceMapFor } from "@/lib/price-items";
import { pickPrimaryEstimate } from "@/lib/object-stage";
import type { CalculationResult } from "@/lib/types";
import {
  autoWorkOrderLines, isOwnLine, parseWorkOrderDoc, percentAmount, percentLine, sanitizePercent,
  sanitizeWorkOrderLines, workOrderTotal,
  type WorkOrderLine, type WorkOrderLinesDoc, type WorkOrderPay,
} from "@/lib/work-order-lines";

/**
 * Наряд монтажнику (Этап 3). POST — ссылка: создаётся один раз и живёт вместе
 * с объектом, наряд всегда показывает актуальные комнаты и сумму.
 *
 * GET / PUT (29.10.2026) — строки оплаты монтажнику: мастер правит их в
 * приложении как КП (количество, ставка, свои строки) до отправки, монтажник
 * видит ровно это по ссылке и в PDF. См. src/lib/work-order-lines.ts.
 *
 * Процент от КП (12.11.2026): PUT { pay: { mode: "percent", percent } } — оплата
 * одной строкой «N % от суммы заказа» (+ свои строки мастера), сумму считает сервер
 * от итога главного КП. PUT { pay: { mode: "lines" } } — обратно по работам.
 * Выбор владельца запоминается на компанию (Company.installerPayMode/Percent) и
 * подставляется в новых нарядах. PUT без pay (старые сборки) — как раньше, по строкам.
 *
 * installerFee пишет только этот маршрут (и PATCH объекта — тогда строки
 * сбрасываются): одна сумма, один источник.
 */

type Scope = Awaited<ReturnType<typeof getScope>>;

async function loadObject(id: string, scope: Scope) {
  return prisma.measurementObject.findFirst({
    where: { id, ...inScope(scope), deletedAt: null },
    select: {
      id: true,
      workOrderToken: true,
      workOrderLines: true,
      installerFee: true,
      installer: { select: { defaultFee: true } },
      estimates: { where: { deletedAt: null }, select: { id: true, status: true, total: true, createdAt: true, updatedAt: true, deletedAt: true } },
    },
  });
}
type Obj = NonNullable<Awaited<ReturnType<typeof loadObject>>>;
type Primary = ReturnType<typeof pickPrimaryEstimate<Obj["estimates"][number]>>;

/** Умолчание компании владельца: процент или по работам (+ последний %). */
async function payDefaultFor(scope: Scope): Promise<{ companyId: string; mode: "percent" | "lines"; percent: number | null }> {
  const companyId = await priceBookCompanyId(scope.ownerId);
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { installerPayMode: true, installerPayPercent: true } });
  const percent = sanitizePercent(c?.installerPayPercent);
  return { companyId, mode: c?.installerPayMode === "percent" && percent != null ? "percent" : "lines", percent };
}

/** Авто-строки из главного КП + от какого КП они. */
async function autoLinesFor(obj: Obj, scope: Scope, currency: string) {
  const primary = pickPrimaryEstimate(obj.estimates);
  const calc = primary
    ? (await prisma.estimate.findUnique({ where: { id: primary.id }, select: { calculationData: true } }))?.calculationData
    : null;
  // Ставки по умолчанию — в валюте владельца (10.11.2026)
  const prices = await priceMapFor(await priceBookCompanyId(scope.ownerId), currency);
  const lines = autoWorkOrderLines(calc as CalculationResult | null, prices, currency);
  return { lines, primary };
}

/** Строки «процентом»: строка процента первой, затем свои строки мастера. */
function percentLines(percent: number, primary: NonNullable<Primary>, own: WorkOrderLine[]): { lines: WorkOrderLine[]; pay: WorkOrderPay } {
  const base = Math.max(0, Math.round(primary.total));
  return { lines: [percentLine(percent, base), ...own.filter(isOwnLine)], pay: { mode: "percent", percent, base } };
}

function docFrom(lines: WorkOrderLine[], primary: { id: string; updatedAt: Date } | null, pay?: WorkOrderPay): WorkOrderLinesDoc {
  return {
    v: 1,
    lines,
    updatedAt: new Date().toISOString(),
    estimateId: primary?.id,
    estimateUpdatedAt: primary?.updatedAt.toISOString(),
    ...(pay && { pay }),
  };
}

/** КП пересчитали или главным стало другое после того, как мастер зафиксировал строки. */
function isStale(doc: WorkOrderLinesDoc, primary: { id: string; updatedAt: Date; total: number } | null): boolean {
  if (!primary || !doc.estimateId) return false;
  if (doc.estimateId !== primary.id) return true;
  // Процент: важна только сумма КП — правка КП без смены итога наряд не трогает.
  if (doc.pay) return Math.round(primary.total) !== doc.pay.base;
  return !!doc.estimateUpdatedAt && primary.updatedAt.getTime() > new Date(doc.estimateUpdatedAt).getTime() + 1000;
}

/** Для экрана мастера: режим, %, база КП и сумма. База — только мастеру, монтажнику не отдаём. */
function payView(pay: WorkOrderPay | undefined) {
  return pay
    ? { mode: "percent" as const, percent: pay.percent, base: pay.base, amount: percentAmount(pay.percent, pay.base) }
    : { mode: "lines" as const, percent: null, base: null, amount: null };
}

function unauthorized(error: unknown) {
  return error instanceof Error && error.message === "Unauthorized"
    ? NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const doc = parseWorkOrderDoc(obj.workOrderLines);
    const primary = pickPrimaryEstimate(obj.estimates);
    const currency = await currencyFor(scope.ownerId);
    const def = await payDefaultFor(scope);
    let lines: WorkOrderLine[];
    let pay: WorkOrderPay | undefined;
    let edited = !!doc;
    let stale = false;
    if (doc) {
      lines = doc.lines;
      pay = doc.pay;
      stale = isStale(doc, primary);
    } else if (obj.installerFee != null) {
      // Сумма вбита руками до построчного наряда — показываем её одной строкой,
      // а не авто-расчёт: монтажник по ссылке видит именно эту цифру.
      lines = [{ key: "fee", room: "", name: "Оплата за монтаж", qty: 1, unit: "усл.", price: obj.installerFee }];
      edited = true;
    } else if (def.mode === "percent" && def.percent != null && primary) {
      // Компания платит процентом — новый наряд сразу процентом от итога КП.
      ({ lines, pay } = percentLines(def.percent, primary, []));
    } else {
      lines = (await autoLinesFor(obj, scope, currency)).lines;
      // Без КП, но у монтажника из «Людей» есть обычная ставка за объект — подставим.
      const fee = obj.installer?.defaultFee;
      if (lines.length === 0 && fee) lines = [{ key: "fee", room: "", name: "Оплата за монтаж", qty: 1, unit: "усл.", price: fee }];
    }
    // Ставки из прайса по видам работ, которые есть в наряде: мобилка сравнивает
    // с ними и предлагает «сохранить в прайс», если мастер поменял (29.10.2026).
    const priceBook = await priceMapFor(def.companyId, currency);
    const rates: Record<string, number> = {};
    for (const l of lines) if (l.code && rates[l.code] === undefined) rates[l.code] = priceBook[l.code] ?? 0;
    return NextResponse.json({
      url: obj.workOrderToken ? `https://potolok.ai/n/${obj.workOrderToken}` : null,
      lines,
      rates,
      edited,
      stale,
      hasEstimate: !!primary,
      total: workOrderTotal(lines),
      installerFee: obj.installerFee,
      currency,
      pay: payView(pay),
      // Итог главного КП сейчас — для подписи при переключении на процент.
      estimateTotal: primary ? Math.round(primary.total) : null,
      payDefault: { mode: def.mode, percent: def.percent },
    });
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order lines error:", error);
    return NextResponse.json({ error: "Не удалось загрузить наряд" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    const body = (await request.json()) as { lines?: unknown; reset?: unknown; pay?: { mode?: unknown; percent?: unknown } };
    const primary = pickPrimaryEstimate(obj.estimates);
    const current = parseWorkOrderDoc(obj.workOrderLines);

    const save = async (lines: WorkOrderLine[], pay?: WorkOrderPay) => {
      const total = workOrderTotal(lines);
      // installerFee = сумма строк: так «Деньги» на объекте и наряд не расходятся.
      await prisma.measurementObject.update({
        where: { id },
        data: { workOrderLines: docFrom(lines, primary, pay), installerFee: total > 0 ? total : null },
      });
      return NextResponse.json({ lines, edited: true, stale: false, total, pay: payView(pay) });
    };

    // «Пересчитать из КП»: строки снова считаются из КП. installerFee обнуляем —
    // сумма без строк читается как «вбито руками». Зафиксируется при отправке (POST).
    if (body.reset === true) {
      // Процентом — тот же % от нового итога КП, свои строки остаются.
      const def = current?.pay ? null : await payDefaultFor(scope);
      const percent = current?.pay?.percent ?? (def?.mode === "percent" ? def.percent : null);
      if (percent != null && primary) {
        const r = percentLines(percent, primary, current?.lines ?? []);
        return save(r.lines, r.pay);
      }
      const { lines } = await autoLinesFor(obj, scope, await currencyFor(scope.ownerId));
      await prisma.measurementObject.update({
        where: { id },
        data: { workOrderLines: Prisma.DbNull, installerFee: null },
      });
      return NextResponse.json({ lines, edited: false, stale: false, total: workOrderTotal(lines), pay: payView(undefined) });
    }

    // Смена способа оплаты (новая сборка приложения).
    if (body.pay && typeof body.pay === "object") {
      let own: WorkOrderLine[] = current?.lines ?? [];
      if (body.lines !== undefined) {
        const s = sanitizeWorkOrderLines(body.lines);
        if ("error" in s) return NextResponse.json({ error: s.error }, { status: 400 });
        own = s;
      }
      own = own.filter(isOwnLine);
      const def = await payDefaultFor(scope);
      const isOwner = scope.ownerId === master.id;
      if (body.pay.mode === "percent") {
        const percent = sanitizePercent(body.pay.percent);
        if (percent == null) return NextResponse.json({ error: "Процент — от 0,5 до 100" }, { status: 400 });
        if (!primary) return NextResponse.json({ error: "Сначала сделайте КП" }, { status: 400 });
        // Выбор владельца — умолчание компании (правило «не усложнять»: без вопроса).
        if (isOwner) await prisma.company.update({ where: { id: def.companyId }, data: { installerPayMode: "percent", installerPayPercent: percent } });
        const r = percentLines(percent, primary, own);
        return save(r.lines, r.pay);
      }
      if (body.pay.mode === "lines") {
        if (isOwner && def.mode !== "lines") await prisma.company.update({ where: { id: def.companyId }, data: { installerPayMode: "lines" } });
        const { lines: auto } = await autoLinesFor(obj, scope, await currencyFor(scope.ownerId));
        return save([...auto, ...own]);
      }
      return NextResponse.json({ error: "Неизвестный способ оплаты" }, { status: 400 });
    }

    const lines = sanitizeWorkOrderLines(body.lines);
    if ("error" in lines) return NextResponse.json({ error: lines.error }, { status: 400 });
    return save(lines);
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order lines save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить наряд" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const obj = await loadObject(id, scope);
    if (!obj) return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    let token = obj.workOrderToken;
    const data: { workOrderToken?: string; workOrderLines?: WorkOrderLinesDoc; installerFee?: number } = {};
    if (!token) {
      token = randomBytes(9).toString("base64url");
      data.workOrderToken = token;
    }
    // Отправил наряд — строки и сумма зафиксированы (29.10.2026): монтажник
    // видит то, что мастер видел на экране, и «Деньги» знают, сколько ему должны.
    // Сумму, вбитую руками раньше, не трогаем — она и так уходит в наряд.
    if (!parseWorkOrderDoc(obj.workOrderLines) && obj.installerFee == null) {
      const primary = pickPrimaryEstimate(obj.estimates);
      const def = await payDefaultFor(scope);
      if (def.mode === "percent" && def.percent != null && primary) {
        const r = percentLines(def.percent, primary, []);
        data.workOrderLines = docFrom(r.lines, primary, r.pay);
        data.installerFee = workOrderTotal(r.lines);
      } else {
        const { lines } = await autoLinesFor(obj, scope, await currencyFor(scope.ownerId));
        if (lines.length > 0) {
          data.workOrderLines = docFrom(lines, primary);
          data.installerFee = workOrderTotal(lines);
        }
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.measurementObject.update({ where: { id }, data });
    }
    return NextResponse.json({ url: `https://potolok.ai/n/${token}`, token });
  } catch (error) {
    const u = unauthorized(error); if (u) return u;
    console.error("Work order error:", error);
    return NextResponse.json({ error: "Не удалось создать наряд" }, { status: 500 });
  }
}
