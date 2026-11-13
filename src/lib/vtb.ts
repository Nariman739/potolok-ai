import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { activateSubscription, notifyOwnerPush, notifyUserAboutPaymentDecision, quotePayment, DAYS_YEAR } from "@/lib/payment";
import type { BillingPeriod } from "@/lib/billing";
import { asCurrency, type CurrencyCode } from "@/lib/currency";
import { reportError } from "@/lib/report-error";
import { ALL_QA_PHONES } from "@/lib/qa";

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
 * Включение: VTB_ENABLED=true и ЯВНЫЙ VTB_MODE (13.11.2026, аудит А7):
 *  - VTB_MODE=prod — VTB_API_USER / VTB_PASSWORD / VTB_GATEWAY, настоящие деньги и PRO;
 *  - VTB_MODE=test — VTB_TEST_* (песочница банка): заказ только QA-мастерам
 *    (ALL_QA_PHONES + VTB_TEST_MASTER_IDS), PRO НЕ включается никогда;
 *  - пусто или другое значение — оплата выключена + ошибка конфигурации в Sentry.
 * Раньше без VTB_MODE режим был тестовым, и оплата тестовой картой включала
 * боевой PRO.
 */

export const VTB_REVIEWER = "vtb";
/** Пометка заявки картой ВТБ в PendingPayment.comment (по ней её узнаёт крон и /pricing). */
export const VTB_COMMENT = "Оплата картой (ВТБ)";
/** Заявка песочницы (VTB_MODE=test): отдельная пометка — не видна мастеру в истории, не зачисляется боевым режимом. */
export const VTB_TEST_COMMENT = "Оплата картой (ВТБ, ТЕСТ)";
export function isVtbComment(c: string | null | undefined): boolean {
  return c === VTB_COMMENT || c === VTB_TEST_COMMENT;
}
export function vtbCommentFor(cfg: { test: boolean }): string {
  return cfg.test ? VTB_TEST_COMMENT : VTB_COMMENT;
}

const GATEWAY_TEST = "https://vtbkz.rbsuat.com/payment/rest";
const GATEWAY_PROD = "https://payment.vtb.kz/payment/rest";
const KZT_NUMERIC = "398";

export type VtbConfig = { gateway: string; userName: string; password: string; test: boolean };

let modeWarned = false;

export function getVtbConfig(): VtbConfig | null {
  if (process.env.VTB_ENABLED !== "true") return null;
  const mode = process.env.VTB_MODE;
  if (mode !== "prod" && mode !== "test") {
    // Безопасно по умолчанию: без явного режима денег не принимаем и PRO не даём.
    if (!modeWarned) {
      modeWarned = true;
      reportError(new Error("VTB config: VTB_ENABLED=true, но VTB_MODE не prod/test"), "payment/vtb", "ВТБ выключен: VTB_MODE не задан или неверен", { mode: mode ?? "(пусто)" });
    }
    return null;
  }
  const test = mode === "test";
  const userName = test ? process.env.VTB_TEST_API_USER : process.env.VTB_API_USER;
  const password = test ? process.env.VTB_TEST_PASSWORD : process.env.VTB_PASSWORD;
  const gateway = (test ? process.env.VTB_TEST_GATEWAY : process.env.VTB_GATEWAY) || (test ? GATEWAY_TEST : GATEWAY_PROD);
  if (!userName || !password) return null;
  return { gateway: gateway.replace(/\/$/, ""), userName, password, test };
}

export const VTB_ENABLED = getVtbConfig() !== null;

/** Показывать ли оплату картой ВТБ этому мастеру: боевой режим — всем, песочница — только QA. */
export function vtbAvailableFor(master: { id: string; phone: string } | null): boolean {
  const cfg = getVtbConfig();
  if (!cfg) return false;
  return !cfg.test || (!!master && vtbTestAllowed(master));
}

/** Тестовый заказ (песочница) — только QA: телефоны из src/lib/qa.ts и id из VTB_TEST_MASTER_IDS (через запятую). */
export function vtbTestAllowed(master: { id: string; phone: string }): boolean {
  if (ALL_QA_PHONES.includes(master.phone)) return true;
  const ids = (process.env.VTB_TEST_MASTER_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return ids.includes(master.id);
}

// ── Сумма в тенге ────────────────────────────────────────────────────────
/**
 * Сколько тенге списать с рублёвого мастера (банк принимает только KZT).
 * Решение Наримана 10.11.2026 «для России рубли»: мастер видит свои рублёвые
 * цены (390 / 790 / 6 900 ₽, см. pricesFor), а в банк уходит сумма в тенге,
 * подогнанная под них (≈ 6,4 ₸ за рубль): 2 500 / 5 000 / 44 000 ₸. Меняется
 * через env без деплоя: VTB_RUB_LAUNCH_KZT, VTB_RUB_MONTH_KZT, VTB_RUB_YEAR_KZT.
 */
const RUB_CARD_KZT_DEFAULT = { launch: 2500, month: 5000, year: 44000 } as const;

function rubCardKzt(q: { launch: boolean; period: BillingPeriod }): number {
  const [key, def] = q.launch
    ? (["VTB_RUB_LAUNCH_KZT", RUB_CARD_KZT_DEFAULT.launch] as const)
    : q.period === "year"
      ? (["VTB_RUB_YEAR_KZT", RUB_CARD_KZT_DEFAULT.year] as const)
      : (["VTB_RUB_MONTH_KZT", RUB_CARD_KZT_DEFAULT.month] as const);
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : def;
}

export type CardQuote = {
  /** Сумма заказа в банке, ₸. */
  amountKzt: number;
  days: number;
  period: BillingPeriod;
  /** Для рублёвого мастера: его цена тарифа в ₽ — главная цифра на кнопке. */
  rub: number | null;
};

/** Сумма оплаты картой ВТБ: в банк всегда тенге; рублёвому — его цена в ₽ и ₸ по правилу выше. */
export function cardQuote(period: BillingPeriod, currency: CurrencyCode | string | null | undefined, now = new Date()): CardQuote {
  const kz = quotePayment(period, now, "KZT");
  if (asCurrency(currency) !== "RUB") return { amountKzt: kz.amount, days: kz.days, period: kz.period, rub: null };
  const ru = quotePayment(period, now, "RUB");
  return { amountKzt: rubCardKzt(kz), days: kz.days, period: kz.period, rub: ru.amount };
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
  /** Здесь банк отдаёт mdOrder — свой id заказа (для ЛК банка). */
  attributes?: { name: string; value: string }[];
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
  | { ok: false; reason: string; final: boolean; declined?: boolean; mismatch?: boolean; test?: boolean };

/**
 * Включает PRO по заказу, оплату которого подтвердил шлюз. Идемпотентно:
 * повторный вызов по одобренной заявке ничего не меняет и никого не уведомляет
 * (атомарность — в activateSubscription). final=true — заказ уже не станет
 * оплаченным (отказ, отмена, нет в шлюзе), крону его больше не ждать.
 */
export async function settleVtbPayment(paymentId: string, cfg = getVtbConfig()): Promise<SettleResult> {
  if (!cfg) return { ok: false, reason: "ВТБ не настроен", final: false };
  const payment = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, include: { master: true } });
  if (!payment || !isVtbComment(payment.comment)) return { ok: false, reason: "заявка не найдена", final: true };
  // Заявка песочницы не зачисляется боевым режимом и наоборот (режим сменили, пока заявка висела)
  if ((payment.comment === VTB_TEST_COMMENT) !== cfg.test) return { ok: false, reason: "режим заявки не совпадает с режимом оплаты", final: true };
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
  // Банк говорит «оплачено», но сумма или валюта не те, что в заявке: деньги
  // списаны, а автоматически PRO не включаем. Заявка остаётся PENDING (крон
  // её не закрывает), Нариману — один раз в Telegram, решает вручную.
  const mismatch =
    st.currency !== KZT_NUMERIC || payment.currency !== "KZT"
      ? `валюта ${st.currency} / ${payment.currency}`
      : st.amount !== payment.amount * 100
        ? `сумма ${(st.amount ?? 0) / 100} ₸ ≠ ${payment.amount} ₸`
        : null;
  if (mismatch) {
    await flagVtbMismatch(payment.id, mismatch, st, cfg).catch((err) => console.error("vtb mismatch flag failed:", err));
    return { ok: false, reason: `оплачено, но ${mismatch}`, final: false, mismatch: true };
  }

  // Песочница: оплата прошла, но PRO НЕ включаем никогда (аудит А7). Заявку закрываем
  // своей пометкой; мастеру (это всегда QA) ничего не шлём, владельцу — одно сообщение.
  if (cfg.test) {
    const closed = await prisma.pendingPayment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: VTB_REVIEWER, reviewNotes: "ВТБ ТЕСТ: оплата песочницы прошла, PRO не включается" },
    });
    const adminChatId = process.env.ADMIN_TG_CHAT_ID;
    if (closed.count > 0 && adminChatId) {
      await sendTelegramMessage(adminChatId, `🧪 <b>ВТБ ТЕСТ</b>: оплата песочницы прошла, ${payment.amount}₸ · <code>${payment.master.phone}</code>. PRO не включался.`)
        .catch((err) => console.error("vtb test notify failed:", err));
    }
    return { ok: false, reason: "тестовая оплата: PRO не включается", final: true, test: true };
  }

  const result = await activateSubscription({ paymentId: payment.id, adminId: VTB_REVIEWER, trackPurchase: true });
  // Одобрил кто-то другой (параллельный callback, confirm, крон или кнопка
  // в Telegram): срок уже продлён, второй раз не продлеваем и не уведомляем.
  if (!result.claimed) {
    return { ok: true, paymentId, alreadyApproved: true, paidUntil: result.master.paidUntil };
  }

  const card = st.cardAuthInfo?.maskedPan ? ` · карта ${st.cardAuthInfo.maskedPan}` : "";
  const country = st.bankInfo?.bankCountryName ? ` · ${st.bankInfo.bankCountryName}` : "";
  await prisma.pendingPayment.update({
    where: { id: payment.id },
    data: { reviewNotes: `ВТБ${card}${country}` },
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
      `💳 <b>Оплата картой ВТБ</b>\n${name} · <code>${m.phone}</code>\n` +
        `${sum}₸ за ${term}${card}${country} · PRO до ${m.paidUntil?.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" })}`,
    ).catch((err) => console.error("vtb notifyAdmin failed:", err));
    await notifyOwnerPush(
      `💳 Оплата картой ВТБ: ${sum}₸`,
      `${name}. PRO включён автоматически, делать ничего не нужно.`,
    ).catch((err) => console.error("vtb notifyOwnerPush failed:", err));
  }

  return { ok: true, paymentId, alreadyApproved: false, paidUntil: result.master.paidUntil };
}

/**
 * Оплата прошла, но не сходится с заявкой. Отметка в reviewNotes ставится
 * атомарно (только если её ещё нет), поэтому сообщение уходит один раз, хоть
 * callback, confirm и крон придут по этой заявке много раз.
 */
const MISMATCH_NOTE = "ВТБ: оплачено, но";

async function flagVtbMismatch(paymentId: string, mismatch: string, st: VtbOrderStatus, cfg: VtbConfig): Promise<void> {
  const note = `${MISMATCH_NOTE} ${mismatch} — проверить вручную`;
  const claimed = await prisma.pendingPayment.updateMany({
    where: { id: paymentId, status: "PENDING", OR: [{ reviewNotes: null }, { NOT: { reviewNotes: { startsWith: MISMATCH_NOTE } } }] },
    data: { reviewNotes: note },
  });
  if (claimed.count === 0) return;
  const orderId = st.attributes?.find((a) => a.name === "mdOrder")?.value ?? "—";
  const bank = `${(st.amount ?? 0) / 100} ₸, валюта ${st.currency ?? "?"}`;
  reportError(new Error(`VTB paid order mismatch: ${mismatch}`), "payment/vtb", "оплата не сходится с заявкой", {
    paymentId,
    orderId,
    bank,
    test: cfg.test,
  });
  const chatId = process.env.ADMIN_TG_CHAT_ID;
  if (!chatId) return;
  const p = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, include: { master: true } });
  if (!p) return;
  const card = st.cardAuthInfo?.maskedPan ? ` · карта ${st.cardAuthInfo.maskedPan}` : "";
  await sendTelegramMessage(
    chatId,
    `⚠️ <b>ВТБ${cfg.test ? " (ТЕСТ)" : ""}: оплата не сходится с заявкой</b>\n${p.master.firstName ?? ""} · <code>${p.master.phone}</code>${card}\n` +
      `В банке: ${bank}. В заявке: ${p.amount} ${p.currency}.\n` +
      `Деньги списаны, PRO сам НЕ включился — проверь в ЛК банка и включи вручную в админке (Оплаты); мастеру обещали ответ в течение дня.\n` +
      `Заявка ${p.id}\nЗаказ банка ${orderId}`,
  );
}

/** Владельцу: по оплаченному заказу прошёл возврат или отмена (PRO не трогаем — решает Нариман). */
export async function notifyVtbRefund(paymentId: string, operation: string): Promise<void> {
  const chatId = process.env.ADMIN_TG_CHAT_ID;
  if (!chatId) return;
  const p = await prisma.pendingPayment.findUnique({ where: { id: paymentId }, include: { master: true } });
  if (!p || !isVtbComment(p.comment)) return;
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
      // Только заявки текущего режима: тестовые при боевом конфиге не трогаем (и наоборот)
      comment: vtbCommentFor(cfg),
      status: "PENDING",
      // Оплачено, но не сошлось — уже у Наримана на ручной проверке, не трогаем.
      OR: [{ reviewNotes: null }, { NOT: { reviewNotes: { startsWith: MISMATCH_NOTE } } }],
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
