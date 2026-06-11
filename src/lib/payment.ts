import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramPhoto,
} from "@/lib/telegram";
import type { Master, PendingPayment } from "@/generated/prisma/client";

export const FOUNDER_PROMOCODE = (process.env.FOUNDER_PROMOCODE ?? "POTOLOKFEST").toUpperCase();
export const FOUNDER_DISCOUNT_PRICE = Number(process.env.FOUNDER_PRICE ?? 3000);
export const FOUNDER_DISCOUNT_MONTHS = Number(process.env.FOUNDER_DISCOUNT_MONTHS ?? 3);
export const STANDARD_PRICE = Number(process.env.STANDARD_PRICE ?? 9999);
export const SUBSCRIPTION_DAYS_PER_PAYMENT = 30;

// FEST2026 — фестивальный промокод: 3 месяца Pro бесплатно
export const FEST_TRIAL_PROMOCODE = (process.env.FEST_TRIAL_PROMOCODE ?? "FEST2026").toUpperCase();
export const FEST_TRIAL_MONTHS = Number(process.env.FEST_TRIAL_MONTHS ?? 3);

function getAdminChatId(): string | null {
  return process.env.ADMIN_TG_CHAT_ID ?? null;
}

function getKaspiPhone(): string {
  return process.env.KASPI_PHONE ?? "+7 700 000 0000";
}

function getKaspiReceiverName(): string {
  return process.env.KASPI_RECEIVER_NAME ?? "Нариман Ж.";
}

function getTelegramGroupUrl(): string | null {
  return process.env.TELEGRAM_GROUP_INVITE_URL ?? null;
}

function getWhatsappGroupUrl(): string | null {
  return process.env.WHATSAPP_GROUP_INVITE_URL ?? null;
}

export function getPaymentConfig() {
  return {
    kaspiPhone: getKaspiPhone(),
    kaspiReceiverName: getKaspiReceiverName(),
    founderPromocode: FOUNDER_PROMOCODE,
    founderPrice: FOUNDER_DISCOUNT_PRICE,
    founderMonths: FOUNDER_DISCOUNT_MONTHS,
    standardPrice: STANDARD_PRICE,
  };
}

/**
 * Возвращает цену для следующей оплаты этого мастера.
 * Founder за первые 3 оплаты платит 3000₸, потом 9999₸.
 */
export function getMasterPriceForNextPayment(master: {
  monthlyPrice: number;
  isFounder: boolean;
  founderMonthsPaid: number;
}): number {
  if (master.isFounder && master.founderMonthsPaid < FOUNDER_DISCOUNT_MONTHS) {
    return FOUNDER_DISCOUNT_PRICE;
  }
  // Floor: даже если в БД у мастера записано меньше STANDARD_PRICE
  // (баг, ручная правка, миграция) — берём не ниже STANDARD_PRICE.
  // Founder обрабатывается выше отдельным return.
  return Math.max(master.monthlyPrice, STANDARD_PRICE);
}

function formatTenge(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(amount) + "₸";
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Уведомляем админа о новой заявке на оплату.
 * Отправляем фото чека (если есть) + текст с inline-кнопками approve/reject.
 */
export async function notifyAdminAboutPayment(payment: PendingPayment & { master: Master }): Promise<void> {
  const adminChatId = getAdminChatId();
  if (!adminChatId) {
    console.warn("ADMIN_TG_CHAT_ID не задан — пропускаю уведомление админа");
    return;
  }

  const m = payment.master;
  const founderInfo = m.isFounder
    ? ` (Founder, ${m.founderMonthsPaid + 1}/${FOUNDER_DISCOUNT_MONTHS} месяц)`
    : "";

  const lines = [
    `💰 <b>Новая оплата</b>`,
    ``,
    `<b>От:</b> ${m.firstName ?? ""} ${m.lastName ?? ""}`.trim(),
    `<b>Телефон:</b> <code>${m.phone}</code>`,
    m.email ? `<b>Email:</b> ${m.email}` : null,
    m.companyName ? `<b>Компания:</b> ${m.companyName}` : null,
    `<b>Сумма:</b> ${formatTenge(payment.amount)}${founderInfo}`,
    `<b>Тариф:</b> ${m.subscriptionTier}, до ${formatDate(m.paidUntil)}`,
    payment.promocode ? `<b>Промокод:</b> ${payment.promocode}` : null,
    payment.comment ? `<b>Комментарий:</b> ${payment.comment}` : null,
  ].filter(Boolean) as string[];

  const text = lines.join("\n");

  if (payment.screenshotUrl) {
    try {
      await sendTelegramPhoto(adminChatId, payment.screenshotUrl, "Скрин чека");
    } catch (err) {
      console.error("Failed to send receipt photo to admin:", err);
    }
  }

  await sendTelegramMessageWithButtons(adminChatId, text, [
    [
      { text: "✅ Активировать 30 дней", callback_data: `pay:approve:${payment.id}` },
    ],
    [
      { text: "❌ Отклонить", callback_data: `pay:reject:${payment.id}` },
    ],
  ]);
}

/**
 * Активирует подписку юзеру: продлевает paidUntil, обновляет founderMonthsPaid,
 * переключает monthlyPrice если фест-скидка закончилась.
 * Транзакционно: обновляет PendingPayment.status + Master.
 *
 * Возвращает обновлённого Master.
 */
export async function activateSubscription(params: {
  paymentId: string;
  adminId: string;
  days?: number;
}): Promise<{ master: Master; payment: PendingPayment; firstApproved: boolean }> {
  const days = params.days ?? SUBSCRIPTION_DAYS_PER_PAYMENT;

  const payment = await prisma.pendingPayment.findUnique({
    where: { id: params.paymentId },
    include: { master: true },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "APPROVED") {
    return { master: payment.master, payment, firstApproved: false };
  }

  const now = new Date();
  const isFestPayment = (payment.promocode ?? "").toUpperCase() === FOUNDER_PROMOCODE;

  // Interactive transaction решает race condition: если два админа
  // одновременно нажмут «✅ Активировать», updateMany с условием
  // status: { not: "APPROVED" } делает atomic claim — вторая транзакция
  // ничего не обновит. founderMonthsPaid читается ВНУТРИ tx из свежих
  // данных, не из payment.master (который был прочитан до tx).
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.pendingPayment.updateMany({
      where: { id: payment.id, status: { not: "APPROVED" } },
      data: {
        status: "APPROVED",
        reviewedAt: now,
        reviewedBy: params.adminId,
        activatedDays: days,
      },
    });
    if (claimed.count === 0) return null; // already approved by concurrent tx

    const master = await tx.master.findUnique({
      where: { id: payment.masterId },
    });
    if (!master) throw new Error("Master not found");

    const currentPaidUntil = master.paidUntil && master.paidUntil > now ? master.paidUntil : now;
    const newPaidUntil = new Date(currentPaidUntil.getTime() + days * 24 * 60 * 60 * 1000);
    const wasFounder = master.isFounder;
    const newFounderMonthsPaid = (wasFounder || isFestPayment)
      ? master.founderMonthsPaid + 1
      : master.founderMonthsPaid;

    // Founder-скидка истекла → новая цена = STANDARD_PRICE
    let newMonthlyPrice = master.monthlyPrice;
    if (wasFounder && newFounderMonthsPaid >= FOUNDER_DISCOUNT_MONTHS) {
      newMonthlyPrice = STANDARD_PRICE;
    }

    const prevApproved = await tx.pendingPayment.count({
      where: { masterId: payment.masterId, status: "APPROVED", id: { not: payment.id } },
    });
    const firstApproved = prevApproved === 0;

    const updatedMaster = await tx.master.update({
      where: { id: payment.masterId },
      data: {
        paidUntil: newPaidUntil,
        subscriptionTier: "PRO",
        founderMonthsPaid: newFounderMonthsPaid,
        monthlyPrice: newMonthlyPrice,
        welcomeSent: firstApproved ? true : master.welcomeSent,
      },
    });

    const updatedPayment = await tx.pendingPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    return { master: updatedMaster, payment: updatedPayment, firstApproved };
  });

  if (!result) {
    const fresh = await prisma.pendingPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { master: true },
    });
    return { master: fresh.master, payment: fresh, firstApproved: false };
  }

  return result;
}

export async function rejectPayment(params: {
  paymentId: string;
  adminId: string;
  notes?: string;
}): Promise<{ master: Master; payment: PendingPayment }> {
  const payment = await prisma.pendingPayment.findUnique({
    where: { id: params.paymentId },
    include: { master: true },
  });
  if (!payment) throw new Error("Payment not found");

  const updated = await prisma.pendingPayment.update({
    where: { id: payment.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: params.adminId,
      reviewNotes: params.notes ?? null,
    },
  });

  return { master: payment.master, payment: updated };
}

/**
 * Сообщаем юзеру о решении по его оплате.
 * Если оплата APPROVED и это первый платёж — шлём welcome с инвайтами в группы.
 */
export async function notifyUserAboutPaymentDecision(params: {
  master: Master;
  payment: PendingPayment;
  approved: boolean;
  firstApproved?: boolean;
}): Promise<void> {
  const { master, payment, approved, firstApproved } = params;
  const chatId = master.telegramChatId;
  if (!chatId) return; // нет привязанного Telegram — пушим в mobile через отдельный поток (TODO)

  if (!approved) {
    await sendTelegramMessage(
      chatId,
      `❌ <b>Оплата не подтверждена</b>\n\n` +
      `Сумма: ${formatTenge(payment.amount)}\n` +
      (payment.reviewNotes ? `Причина: ${payment.reviewNotes}\n` : ``) +
      `\nСвяжитесь с поддержкой: ${getKaspiPhone()}`,
    );
    return;
  }

  const lines = [
    `✅ <b>Оплата принята!</b>`,
    ``,
    `Сумма: ${formatTenge(payment.amount)}`,
    `Подписка активна до: <b>${formatDate(master.paidUntil)}</b>`,
  ];
  if (master.isFounder && master.founderMonthsPaid < FOUNDER_DISCOUNT_MONTHS) {
    const remaining = FOUNDER_DISCOUNT_MONTHS - master.founderMonthsPaid;
    lines.push(``, `🏆 Скидка Founder: осталось ${remaining} мес по ${formatTenge(FOUNDER_DISCOUNT_PRICE)}`);
  } else if (master.isFounder) {
    lines.push(``, `Скидка Founder закончилась. Следующий платёж — ${formatTenge(master.monthlyPrice)}`);
  }

  await sendTelegramMessage(chatId, lines.join("\n"));

  if (firstApproved) {
    await sendWelcomeWithGroupInvites(chatId);
  }
}

/**
 * Welcome-сообщение с двумя кнопками: TG-группа и WA-группа.
 */
export async function sendWelcomeWithGroupInvites(chatId: string): Promise<void> {
  const tgUrl = getTelegramGroupUrl();
  const waUrl = getWhatsappGroupUrl();

  const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
  if (tgUrl) buttons.push([{ text: "💬 Telegram-группа мастеров", url: tgUrl }]);
  if (waUrl) buttons.push([{ text: "📱 WhatsApp-группа мастеров", url: waUrl }]);

  const text =
    `🎉 <b>Добро пожаловать в PotolokAI!</b>\n\n` +
    `Присоединяйтесь к закрытому сообществу мастеров — там делимся опытом, отвечаем на вопросы и анонсируем обновления.`;

  if (buttons.length === 0) {
    await sendTelegramMessage(chatId, text);
    return;
  }

  await sendTelegramMessageWithButtons(chatId, text, buttons);
}
