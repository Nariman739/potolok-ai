import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  activateSubscription,
  notifyUserAboutPaymentDecision,
  rejectPayment,
} from "@/lib/payment";

/**
 * TipTop Pay (tiptoppay.kz) — оплата картой на сайте. API повторяет
 * CloudPayments: Basic Auth PublicId:ApiSecret, уведомления Check/Pay/Fail
 * с подписью HMAC-SHA256 от тела запроса (заголовок Content-HMAC, base64).
 *
 * Поток (14.10.2026):
 *  1. /api/payment/tiptop/create — создаём PendingPayment, отдаём клиенту
 *     сумму и publicId; его id уходит в виджет как externalId → InvoiceId.
 *  2. Клиент платит в виджете TipTop (карта / Google Pay), наш сайт карту не видит.
 *  3. Активация ДВУМЯ путями, оба идемпотентны (activateSubscription делает
 *     atomic claim по статусу):
 *     - уведомление Pay от TipTop на /api/payment/tiptop/notify/pay;
 *     - клиент после успеха зовёт /api/payment/tiptop/confirm — сервер сам
 *       спрашивает TipTop о транзакции (/payments/get) и, если Completed и
 *       сумма/InvoiceId сходятся, включает PRO. Так мастер видит PRO сразу,
 *       даже если уведомление задержалось или URL в ЛК ещё не настроен.
 *
 * Ключи: TIPTOP_PUBLIC_ID (можно светить, он уходит в браузер) и
 * TIPTOP_API_SECRET (только сервер). Пока сайт в ЛК «тестовый» — деньги не
 * списываются, в ответах TestMode=true.
 */

const API_BASE = "https://api.tiptoppay.kz";
/** Служебный «админ» для PendingPayment.reviewedBy, когда одобрил не человек. */
export const TIPTOP_REVIEWER = "tiptop";

export function getTiptopConfig(): { publicId: string; secret: string } | null {
  const publicId = process.env.TIPTOP_PUBLIC_ID?.trim();
  const secret = process.env.TIPTOP_API_SECRET?.trim();
  if (!publicId || !secret) return null;
  return { publicId, secret };
}

export const TIPTOP_ENABLED = getTiptopConfig() !== null;

type TiptopTransaction = {
  TransactionId: number;
  Amount: number;
  Currency: string;
  InvoiceId: string | null;
  AccountId: string | null;
  Status: string; // AwaitingAuthentication | Authorized | Completed | Cancelled | Declined
  TestMode: boolean;
  Token?: string | null;
  CardLastFour?: string | null;
  Reason?: string | null;
};

type ApiResponse<T> = { Success: boolean; Message?: string | null; Model?: T };

async function tiptopPost<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const cfg = getTiptopConfig();
  if (!cfg) throw new Error("TipTop не настроен (TIPTOP_PUBLIC_ID / TIPTOP_API_SECRET)");
  const auth = Buffer.from(`${cfg.publicId}:${cfg.secret}`).toString("base64");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TipTop ${path}: HTTP ${res.status}`);
  return (await res.json()) as ApiResponse<T>;
}

/** Транзакция по её номеру из виджета. */
export async function getTransaction(transactionId: number): Promise<TiptopTransaction | null> {
  const r = await tiptopPost<TiptopTransaction>("/payments/get", { TransactionId: transactionId });
  return r.Success && r.Model ? r.Model : null;
}

/** Транзакция по нашему номеру заявки (InvoiceId) — если клиент не принёс TransactionId. */
export async function findTransactionByInvoice(invoiceId: string): Promise<TiptopTransaction | null> {
  const r = await tiptopPost<TiptopTransaction>("/payments/find", { InvoiceId: invoiceId });
  return r.Success && r.Model ? r.Model : null;
}

/** Проверка подписи уведомления: base64(HMAC-SHA256(rawBody, ApiSecret)). */
export function verifyNotificationHmac(rawBody: string, header: string | null): boolean {
  const cfg = getTiptopConfig();
  if (!cfg || !header) return false;
  const expected = createHmac("sha256", cfg.secret).update(rawBody, "utf8").digest();
  let got: Buffer;
  try {
    got = Buffer.from(header.trim(), "base64");
  } catch {
    return false;
  }
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Тело уведомления: TipTop шлёт form-urlencoded (по умолчанию) или JSON. */
export function parseNotificationBody(rawBody: string, contentType: string | null): Record<string, string> {
  if (contentType?.includes("application/json")) {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v == null ? "" : String(v)]));
  }
  return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

function sameAmount(a: number | string, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(b * 100);
}

/**
 * Check-уведомление: TipTop спрашивает «можно ли проводить этот платёж?».
 * Коды: 0 — да; 10 — неверный номер заказа; 12 — неверная сумма; 13 — нельзя.
 */
export async function checkNotification(f: Record<string, string>): Promise<{ code: number }> {
  const payment = f.InvoiceId ? await prisma.pendingPayment.findUnique({ where: { id: f.InvoiceId } }) : null;
  if (!payment) return { code: 10 };
  if (payment.status === "APPROVED") return { code: 13 };
  if (!sameAmount(f.Amount, payment.amount)) return { code: 12 };
  if (f.Currency && f.Currency !== "KZT") return { code: 12 };
  return { code: 0 };
}

/**
 * Включает PRO по подтверждённой транзакции. Идемпотентно: повторный вызов
 * по уже одобренной заявке ничего не меняет и не шлёт уведомлений.
 */
export async function settleTransaction(tx: TiptopTransaction): Promise<
  | { ok: true; paymentId: string; alreadyApproved: boolean; paidUntil: Date | null }
  | { ok: false; reason: string }
> {
  if (!tx.InvoiceId) return { ok: false, reason: "нет InvoiceId" };
  const payment = await prisma.pendingPayment.findUnique({ where: { id: tx.InvoiceId }, include: { master: true } });
  if (!payment) return { ok: false, reason: `заявка ${tx.InvoiceId} не найдена` };
  if (tx.Status !== "Completed" && tx.Status !== "Authorized") {
    return { ok: false, reason: `статус ${tx.Status}` };
  }
  if (!sameAmount(tx.Amount, payment.amount)) {
    return { ok: false, reason: `сумма ${tx.Amount} ≠ ${payment.amount}` };
  }
  if (payment.status === "APPROVED") {
    return { ok: true, paymentId: payment.id, alreadyApproved: true, paidUntil: payment.master.paidUntil };
  }

  const result = await activateSubscription({ paymentId: payment.id, adminId: TIPTOP_REVIEWER });
  if (!result.firstApproved && result.payment.reviewedBy !== TIPTOP_REVIEWER) {
    // Кто-то (Telegram-кнопка или параллельное уведомление) успел раньше.
    return { ok: true, paymentId: payment.id, alreadyApproved: true, paidUntil: result.master.paidUntil };
  }

  await prisma.pendingPayment.update({
    where: { id: payment.id },
    data: {
      reviewNotes: `TipTop #${tx.TransactionId}${tx.TestMode ? " (тест)" : ""}${tx.CardLastFour ? ` · карта *${tx.CardLastFour}` : ""}`,
    },
  });

  // Мастеру — пуш/TG, Нариману — отчёт в TG. Ошибки уведомлений не должны
  // ронять ответ TipTop: иначе он повторит уведомление до 100 раз.
  await notifyUserAboutPaymentDecision({
    master: result.master,
    payment: result.payment,
    approved: true,
    firstApproved: result.firstApproved,
  }).catch((err) => console.error("tiptop notifyUser failed:", err));

  const adminChatId = process.env.ADMIN_TG_CHAT_ID;
  if (adminChatId) {
    const m = result.master;
    const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.phone;
    await sendTelegramMessage(
      adminChatId,
      `💳 <b>Оплата картой${tx.TestMode ? " (ТЕСТ)" : ""}</b>\n${name} · <code>${m.phone}</code>\n` +
        `${new Intl.NumberFormat("ru-RU").format(payment.amount)}₸ за ${(result.payment.activatedDays ?? 30) >= 365 ? "год" : "месяц"} · PRO до ${result.master.paidUntil?.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" })}\nTipTop #${tx.TransactionId}`,
    ).catch((err) => console.error("tiptop notifyAdmin failed:", err));
  }

  return { ok: true, paymentId: payment.id, alreadyApproved: false, paidUntil: result.master.paidUntil };
}

/** Pay-уведомление: поля приходят строками. */
export async function payNotification(f: Record<string, string>): Promise<{ code: number }> {
  const tx: TiptopTransaction = {
    TransactionId: Number(f.TransactionId),
    Amount: Number(f.Amount),
    Currency: f.Currency || "KZT",
    InvoiceId: f.InvoiceId || null,
    AccountId: f.AccountId || null,
    Status: f.Status || "Completed",
    TestMode: f.TestMode === "1" || f.TestMode === "true",
    Token: f.Token || null,
    CardLastFour: f.CardLastFour || null,
  };
  const r = await settleTransaction(tx);
  if (!r.ok) console.error("tiptop pay notification not settled:", r.reason, f.InvoiceId);
  // Для Pay TipTop принимает только {code:0}; расхождения разбираем по логам.
  return { code: 0 };
}

/** Fail-уведомление: отмечаем заявку отклонённой с причиной, если её ещё не одобрили. */
export async function failNotification(f: Record<string, string>): Promise<{ code: number }> {
  const payment = f.InvoiceId ? await prisma.pendingPayment.findUnique({ where: { id: f.InvoiceId } }) : null;
  if (payment && payment.status === "PENDING") {
    await rejectPayment({
      paymentId: payment.id,
      adminId: TIPTOP_REVIEWER,
      notes: `TipTop: ${f.Reason || "отказ банка"}${f.ReasonCode ? ` (${f.ReasonCode})` : ""}`,
    });
  }
  return { code: 0 };
}
