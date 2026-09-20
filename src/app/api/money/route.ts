import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { moneySummary } from "@/lib/money";
import { pickPrimaryEstimate, resolveStage } from "@/lib/object-stage";

/**
 * Экран «Деньги» (Этап 4): должны мне · должен я · заработал за месяц.
 *
 * «Должны мне» — объекты с ценой (КП) и остатком > 0, кроме тех, где клиент
 * ещё не согласовал (по ним ждать денег рано). «Должен я» — монтажнику
 * назначена сумма, а «выплатил» не отмечено. «За месяц» — по дате платежей:
 * получено; прибыль считается по закрытым в этом месяце объектам.
 */

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

function monthBoundsAlmaty(offsetMonths = 0) {
  const nowZ = new Date(Date.now() + ALMATY_OFFSET_MS);
  const start = new Date(Date.UTC(nowZ.getUTCFullYear(), nowZ.getUTCMonth() + offsetMonths, 1));
  const end = new Date(Date.UTC(nowZ.getUTCFullYear(), nowZ.getUTCMonth() + offsetMonths + 1, 1));
  return { start: new Date(start.getTime() - ALMATY_OFFSET_MS), end: new Date(end.getTime() - ALMATY_OFFSET_MS) };
}

export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { start, end } = monthBoundsAlmaty();
    const prev = monthBoundsAlmaty(-1);

    const [objects, owner] = await Promise.all([
      prisma.measurementObject.findMany({
        where: {
          ...inScope(scope),
          deletedAt: null,
          OR: [{ estimates: { some: { deletedAt: null } } }, { payments: { some: {} } }, { installerFee: { not: null } }],
        },
        select: {
          id: true, address: true, manualStage: true, materialCost: true, installerFee: true, installerPaidAt: true, installAt: true,
          client: { select: { id: true, name: true, phone: true } },
          installer: { select: { id: true, name: true, phone: true } },
          estimates: { where: { deletedAt: null }, select: { status: true, total: true, clientName: true, createdAt: true, deletedAt: true, partner: { select: { amount: true } } } },
          workshopOrders: { select: { id: true } },
          payments: { select: { id: true, amount: true, paidAt: true } },
        },
      }),
      prisma.master.findUnique({ where: { id: scope.ownerId }, select: { materialPercent: true } }),
    ]);
    const materialPercent = owner?.materialPercent ?? 40;

    const owedToMe: object[] = [];
    const owedByMe: object[] = [];
    let receivedMonth = 0, receivedPrev = 0, profitMonth = 0, closedMonth = 0, profitEstimated = false;

    for (const o of objects) {
      const primary = pickPrimaryEstimate(o.estimates);
      const money = moneySummary({
        price: primary?.total ?? null,
        payments: o.payments,
        materialCost: o.materialCost,
        materialPercent,
        installerFee: o.installerFee,
        installerPaidAt: o.installerPaidAt,
        partnerAmount: primary?.partner?.amount ?? 0,
      });
      const { stage } = resolveStage({ manualStage: o.manualStage, estimates: o.estimates, workshopOrders: o.workshopOrders, settled: money.settled });
      const title = o.address || o.client?.name || primary?.clientName || "Объект";

      for (const p of o.payments) {
        if (p.paidAt >= start && p.paidAt < end) receivedMonth += p.amount;
        else if (p.paidAt >= prev.start && p.paidAt < prev.end) receivedPrev += p.amount;
      }

      const waitingForClient = ["measured", "calculated", "sent", "viewed"].includes(stage);
      if (money.due != null && money.due > 0 && !waitingForClient) {
        owedToMe.push({
          id: o.id, title, client: o.client, stage,
          price: money.price, paid: money.paid, due: money.due,
          installAt: o.installAt?.toISOString() ?? null,
        });
      }
      if (o.installerFee && !o.installerPaidAt) {
        owedByMe.push({ id: o.id, title, installer: o.installer, fee: o.installerFee, stage, installAt: o.installAt?.toISOString() ?? null });
      }
      // Закрытые в этом месяце — по последнему платежу
      const lastPay = o.payments.reduce<Date | null>((m, p) => (!m || p.paidAt > m ? p.paidAt : m), null);
      if (stage === "closed" && lastPay && lastPay >= start && lastPay < end && money.profit != null) {
        closedMonth++;
        profitMonth += money.profit;
        if (money.profitIsEstimate) profitEstimated = true;
      }
    }

    (owedToMe as { due: number }[]).sort((a, b) => b.due - a.due);

    return NextResponse.json({
      month: { received: receivedMonth, receivedPrev, profit: profitMonth, profitIsEstimate: profitEstimated, closed: closedMonth },
      owedToMe,
      owedToMeTotal: (owedToMe as { due: number }[]).reduce((s, x) => s + x.due, 0),
      owedByMe,
      owedByMeTotal: (owedByMe as { fee: number }[]).reduce((s, x) => s + x.fee, 0),
      materialPercent,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Money error:", error);
    return NextResponse.json({ error: "Ошибка загрузки «Деньги»" }, { status: 500 });
  }
}
