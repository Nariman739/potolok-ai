import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { activateSubscription, notifyOwnerPush, notifyUserAboutPaymentDecision, quotePayment, DAYS_YEAR } from "@/lib/payment";
import type { BillingPeriod } from "@/lib/billing";
import { asCurrency, type CurrencyCode } from "@/lib/currency";

/**
 * Оплата картой через эквайринг ВТБ Казахстан (шлюз RBS), 10.11.2026.
 *
 * Мастер уходит на страницу банка (formUrl), платит, банк возвращает его на
 * /pricing?vtb=<id заявки>. Итог оплаты узнаём ТОЛЬКО запросом
 * getOrderStatusExtended с нашей стороны: банк не подписывает callback
 * (ответ банка 10.11), поэтому callback — просто сигнал «проверь», а
 * не доказательство оплаты. Три пути к одной идемпотентной settleVtbPayment:
 * callback, confirm при возврате мастера и крон-страховка (billing-reminders).
 *
 * Номер заказа в шлюзе = PendingPayment.id (uuid, лимит orderNumber 36
 * символов): по нему и спрашиваем статус, отдельные поля в схеме не нужны.
 * Шлюз не даёт зарегистрировать один orderNumber дважды — на одну заявку
 * ровно один заказ.
 *
 * Из России проходят только карты «Мир» (любого банка), зачисление только в
 * тенге — у мастера спишутся рубли по курсу его банка. Поэтому заказ всегда
 * в KZT, а сумму для рублёвого мастера даёт cardQuote (см. RUB_CARD_KZT).
 *
 * Включение: VTB_ENABLED=true. Режим VTB_MODE=test (по умолчанию) берёт
 * VTB_TEST_API_USER / VTB_TEST_PASSWORD / VTB_TEST_GATEWAY, VTB_MODE=prod —
 * VTB_API_USER / VTB_PASSWORD / VTB_GATEWAY.
 */

export const VTB_REVIEWER = "vtb";
/** Пометка заявки картой ВТБ в PendingPayment.comment (по ней её узнаёт крон и /pricing). */
export const VTB_COMMENT = "Оплата картой (ВТБ)";

const GATEWAY_TEST = "https://vtbkz.rbsuat.com/payment/rest";
const GATEWAY_PROD = "https://payment.vtb.kz/payment/rest";
const KZT_NUMERIC = "398";

export type VtbConfig = { gateway: string; userName: string; password: string; test: boolean };

export function getVtbConfig(): VtbConfig | null {
  if (process.env.VTB_ENABLED !== "true") return null;
  const test = (process.env.VTB_MODE ?? "test") !== "prod";
  const userName = test ? process.env.VTB_TEST_API_USER : process.env.VTB_API_USER;
  const password = test ? process.env.VTB_TEST_PASSWORD : process.env.VTB_PASSWORD;
  const gateway = (test ? process.env.VTB_TEST_GATEWAY : process.env.VTB_GATEWAY) || (test ? GATEWAY_TEST : GATEWAY_PROD);
  if (!userName || !password) return null;
  return { gateway: gateway.replace(/\/$/, ""), userName, password, test };
}

export const VTB_ENABLED = getVtbConfig() !== null;

// ── Сумма в тенге ────────────────────────────────────────────────────────
/**
 * Сколько тенге списать с рублёвого мастера за тариф (банк принимает только
 * KZT). ВРЕМЕННОЕ правило до решения Наримана: та же сумма в тенге, что у
 * мастеров из Казахстана (1 990 / 4 990 / 39 900 ₸) — при ~6,4 ₸ за рубль это
 * ≈ 310 / 780 / 6 230 ₽ против рублёвых 390 / 790 / 6 900 ₽. Меняется через
 * env без деплоя: VTB_RUB_LAUNCH_KZT, VTB_RUB_MONTH_KZT, VTB_RUB_YEAR_KZT.
 */
function rubCardKzt(q: { launch: boolean; period: BillingPeriod }): number | null {
  const key = q.launch ? "VTB_RUB_LAUNCH_KZT" : q.period === "year" ? "VTB_RUB_YEAR_KZT" : "VTB_RUB_MONTH_KZT";
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** Курс только для подсказки «около N ₽» рублёвому мастеру — на сумму не влияет. */
const KZT_PER_RUB = Number(process.env.VTB_KZT_PER_RUB ?? 6.4);

export type CardQuote = {
  /** Сумма заказа в банке, ₸. */
  amountKzt: number;
  days: number;
  period: BillingPeriod;
  /** Для рублёвого мастера: примерно столько рублей спишет его банк. */
  approxRub: number | null;
};

/** Сумма оплаты картой ВТБ: всегда в тенге, для рублёвых — по правилу выше. */
export function cardQuote(period: BillingPeriod, currency: CurrencyCode | string | null | undefined, now = new Date()): CardQuote {
  const kz = quotePayment(period, now, "KZT");
  if (asCurrency(currency) !== "RUB") return { amountKzt: kz.amount, days: kz.days, period: kz.period, approxRub: null };
  const amountKzt = rubCardKzt(kz) ?? kz.amount;
  return {
    amountKzt,
    days: kz.days,
    period: kz.period,
    approxRub: KZT_PER_RUB > 0 ? Math.round(amountKzt / KZT_PER_RUB / 10) * 10 : null,
  };
}

// ── Шлюз ─────────────────────────────────────────────────────────────────
async function call<T>(cfg: VtbConfig, method: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ userName: cfg.userName, password: cfg.password, ...params });
  const res = await fetch(`${cfg.gateway}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`VTB ${method}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function registerOrder(
  cfg: VtbConfig,
  p: { orderNumber: string; amountKzt: number; returnUrl: string; description: string; clientId: string; callbackUrl: string | null },
): Promise<{ orderId: string; formUrl: string }> {
  const params: Record<string, string> = {
    orderNumber: p.orderNumber,
    amount: String(Math.round(p.amountKzt * 100)),
    currency: KZT_NUMERIC,
    returnUrl: p.returnUrl,
    // После отказа форма банка сама предлагает повторить; на failUrl мастер
    // попадает, когда сдаётся, — там тот же экран проверки статуса.
    failUrl: p.returnUrl,
    description: p.description,
    clientId: p.clientId,
    language: "ru",
    // 20 минут на оплату: потом заказ закрывается, крон перестаёт его ждать.
    sessionTimeoutSecs: "1200",
  };
  if (p.callbackUrl) params.dynamicCallbackUrl = p.callbackUrl;
  const r = await call<{ orderId?: string; formUrl?: string; errorCode?: string; errorMessage?: string }>(cfg, "register.do", params);
  if (!r.orderId || !r.formUrl) throw new Error(`VTB register.do: ${r.errorCode ?? "?"} ${r.errorMessage ?? ""}`.trim());
  return { orderId: r.orderId, formUrl: r.formUrl };
}

/** Статус заказа (getOrderStatusExtended). orderStatus: 0 создан, 1 холд, 2 оплачен, 3 отменён, 4 возврат, 5 3DS, 6 отклонён. */
export type VtbOrderStatus = {
  errorCode?: string;
  errorMessage?: string;
  orderNumber?: string;
  orderStatus?: number;
  actionCode?: number;
  actionCodeDescription?: string;
  amount?: number;
  currency?: string;
  cardAuthInfo?: { maskedPan?: string };
  bankInfo?: { bankCountryName?: string };
  paymentAmountInfo?: { paymentState?: string; depositedAmount?: number; refundedAmount?: number };
};

/** null — заказа в шлюзе нет (мастер не дошёл до банка или register упал). */
export async function getOrderStatus(cfg: VtbConfig, by: { orderNumber: string } | { orderId: string }): Promise<VtbOrderStatus | null> {
  const r = await call<VtbOrderStatus>(cfg, "getOrderStatusExtended.do", by);
  if (r.errorCode === "6") return null;
  if (r.errorCode && r.errorCode !== "0") throw new Error(`VTB getOrderStatusExtended: ${r.errorCode} ${r.errorMessage ?? ""}`.trim());
  return r;
}

// ── Зачисление ───────────────────────────────────────────────────────────
export type SettleResult =
  | { ok: true; paymentId: string; alreadyApproved: boolean; paidUntil: Date | null }
  | { ok: false; reason: string; final: boolean; declined?: boolean };

/**
 * Включает PRO по заказу, оплату которого подтвердил шлюз. Идемпотентно:
 * повторный вызов по одобренной заявке ничего не меняет и никого не уведомляет
 * (атомарность — в activateSubscription). final=true — заказ уже не станет
 * оплаченным (отказ, отмена, нет в шлюзе), крону его больше не ждать.
 */
export async function settleVtbPayment(paymentId: string, cfg = getVtbConfig()): Promise<SettleResult> {
  if (!cfg) return { ok: false, reason: "ВТБ не настроен", final: false };
  const payment = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, include: { master: true } });
  if (!payment || payment.comment !== VTB_COMMENT) return { ok: false, reason: "заявка не найдена", final: true };
  if (payment.status === "APPROVED") {
    return { ok: true, paymentId, alreadyApproved: true, paidUntil: payment.master.paidUntil };
  }

  const st = await getOrderStatus(cfg, { orderNumber: payment.id });
  if (!st) return { ok: false, reason: "заказа нет в банке", final: true };
  if (st.orderNumber !== payment.id) return { ok: false, reason: "чужой заказ", final: true };
  if (st.orderStatus !== 2) {
    // 0 — создан или отклонён с возможностью повтора, 5 — идёт 3DS: ещё может стать оплаченным.
    const final = st.orderStatus === 3 || st.orderStatus === 4 || st.orderStatus === 6;
    // Последняя попытка отклонена (actionCode ≠ 0), но форма банка ещё ждёт
    // повтора — мастеру на возврате говорим «не прошла», крон ждёт дальше.
    const declined = final || (st.orderStatus === 0 && !!st.actionCode && st.actionCode !== 0);
    return { ok: false, reason: `статус ${st.orderStatus}${st.actionCodeDescription ? ` · ${st.actionCodeDescription}` : ""}`, final, declined };
  }
  if (st.currency !== KZT_NUMERIC || payment.currency !== "KZT") {
    return { ok: false, reason: `валюта ${st.currency} / ${payment.currency}`, final: true };
  }
  if (st.amount !== payment.amount * 100) {
    return { ok: false, reason: `сумма ${st.amount} ≠ ${payment.amount * 100}`, final: true };
  }

  const result = await activateSubscription({ paymentId: payment.id, adminId: VTB_REVIEWER, trackPurchase: !cfg.test });
  // Одобрил кто-то другой (параллельный callback, confirm, крон или кнопка
  // в Telegram): срок уже продлён, второй раз не продлеваем и не уведомляем.
  if (!result.claimed) {
    return { ok: true, paymentId, alreadyApproved: true, paidUntil: result.master.paidUntil };
  }

  const card = st.cardAuthInfo?.maskedPan ? ` · карта ${st.cardAuthInfo.maskedPan}` : "";
  const country = st.bankInfo?.bankCountryName ? ` · ${st.bankInfo.bankCountryName}` : "";
  await prisma.pendingPayment.update({
    where: { id: payment.id },
    data: { reviewNotes: `ВТБ${cfg.test ? " (тест)" : ""}${card}${country}` },
  });

  // Уведомления не должны ронять ответ: PRO уже включён.
  await notifyUserAboutPaymentDecision({
    master: result.master,
    payment: result.payment,
    approved: true,
    firstApproved: result.firstApproved,
  }).catch((err) => console.error("vtb notifyUser failed:", err));

  const adminChatId = process.env.ADMIN_TG_CHAT_ID;
  if (adminChatId) {
    const m = result.master;
    const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.phone;
    const sum = new Intl.NumberFormat("ru-RU").format(payment.amount);
    const term = (result.payment.activatedDays ?? 30) >= DAYS_YEAR ? "год" : "месяц";
    await sendTelegramMessage(
      adminChatId,
      `💳 <b>Оплата картой ВТБ${cfg.test ? " (ТЕСТ)" : ""}</b>\n${name} · <code>${m.phone}</code>\n` +
        `${sum}₸ за ${term}${card}${country} · PRO до ${m.paidUntil?.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" })}`,
    ).catch((err) => console.error("vtb notifyAdmin failed:", err));
    await notifyOwnerPush(
      `💳 Оплата картой ВТБ${cfg.test ? " (тест)" : ""}: ${sum}₸`,
      `${name}. PRO включён автоматически, делать ничего не нужно.`,
    ).catch((err) => console.error("vtb notifyOwnerPush failed:", err));
  }

  return { ok: true, paymentId, alreadyApproved: false, paidUntil: result.master.paidUntil };
}

/** Владельцу: по оплаченному заказу прошёл возврат или отмена (PRO не трогаем — решает Нариман). */
export async function notifyVtbRefund(paymentId: string, operation: string): Promise<void> {
  const chatId = process.env.ADMIN_TG_CHAT_ID;
  if (!chatId) return;
  const p = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, include: { master: true } });
  if (!p || p.comment !== VTB_COMMENT) return;
  const what = operation === "refunded" ? "возврат" : "отмена";
  await sendTelegramMessage(
    chatId,
    `↩️ <b>ВТБ: ${what} по оплате</b>\n${p.master.firstName ?? ""} · <code>${p.master.phone}</code> · ${p.amount}₸\n` +
      `PRO до ${p.master.paidUntil?.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) ?? "—"} — срок сам не меняется, поправь вручную, если нужно.\nЗаявка ${p.id}`,
  );
}

/**
 * Крон-страховка: заявки ВТБ, которые ещё PENDING, — спросить банк ещё раз.
 * Callback банк повторяет недолго, а мастер мог закрыть вкладку до возврата.
 * Берём заявки старше 2 минут (идёт оплата) и младше 2 суток.
 */
export async function reconcileVtbPayments(now = new Date()): Promise<{ checked: number; settled: number; closed: number }> {
  const cfg = getVtbConfig();
  if (!cfg) return { checked: 0, settled: 0, closed: 0 };
  const pending = await prisma.pendingPayment.findMany({
    where: {
      comment: VTB_COMMENT,
      status: "PENDING",
      createdAt: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), lte: new Date(now.getTime() - 2 * 60 * 1000) },
    },
    select: { id: true },
    take: 200,
  });
  let settled = 0;
  let closed = 0;
  for (const p of pending) {
    const r = await settleVtbPayment(p.id, cfg).catch((err) => {
      console.error("vtb reconcile failed:", p.id, err);
      return null;
    });
    if (r?.ok && !r.alreadyApproved) settled++;
    else if (r && !r.ok && r.final) {
      // Не оплачена и уже не будет — помечаем, чтобы крон её больше не трогал.
      await prisma.pendingPayment
        .updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "REJECTED", reviewedAt: now, reviewedBy: VTB_REVIEWER, reviewNotes: `ВТБ: ${r.reason}` } })
        .then((u) => { closed += u.count; });
    }
  }
  return { checked: pending.length, settled, closed };
}
