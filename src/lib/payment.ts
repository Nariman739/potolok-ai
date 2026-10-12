import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramPhoto,
} from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import {
  PRICE_MONTH,
  PRICE_YEAR,
  FOUNDER_PRICE_MONTH,
  FOUNDER_PRICE_YEAR,
  FOUNDER_MONTHS,
  FOUNDER_DEADLINE,
  type BillingPeriod,
} from "@/lib/billing";
import type { Master, PendingPayment } from "@/generated/prisma/client";

/** Сколько дней подписки даёт одна оплата. */
export const DAYS_MONTH = 30;
export const DAYS_YEAR = 365;

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
    priceMonth: PRICE_MONTH,
    priceYear: PRICE_YEAR,
    founderPriceMonth: FOUNDER_PRICE_MONTH,
    founderPriceYear: FOUNDER_PRICE_YEAR,
    founderMonths: FOUNDER_MONTHS,
    founderDeadline: FOUNDER_DEADLINE.toISOString(),
  };
}

/**
 * Мастер платит по цене основателя, если он уже основатель и первый год
 * (12 оплаченных месяцев) не кончился — или если ещё можно им стать
 * (сейчас раньше дедлайна). Поле Master.monthlyPrice больше не участвует:
 * у 505 мастеров там 9 999 с прошлой эпохи.
 */
export function isFounderPrice(
  master: { isFounder: boolean; founderMonthsPaid: number },
  now = new Date(),
): boolean {
  if (master.isFounder) return master.founderMonthsPaid < FOUNDER_MONTHS;
  return now < FOUNDER_DEADLINE;
}

export function getMasterPriceForNextPayment(
  master: { isFounder: boolean; founderMonthsPaid: number },
  period: BillingPeriod = "month",
  now = new Date(),
): number {
  const founder = isFounderPrice(master, now);
  if (period === "year") return founder ? FOUNDER_PRICE_YEAR : PRICE_YEAR;
  return founder ? FOUNDER_PRICE_MONTH : PRICE_MONTH;
}

export function periodDays(period: BillingPeriod): number {
  return period === "year" ? DAYS_YEAR : DAYS_MONTH;
}

function formatTenge(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(amount) + "₸";
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** transfer — мастер перевёл сам и прислал чек; invoice — просит счёт в Kaspi Pay. */
export type PaymentMethod = "transfer" | "invoice";

/**
 * Уведомляем админа о новой заявке на оплату.
 * transfer: фото чека + кнопки approve/reject.
 * invoice: «выставь счёт в Kaspi Pay на номер … сумма …» + те же кнопки —
 * Нариман выставляет счёт в приложении Kaspi Pay (20 секунд), мастер платит
 * из своего Kaspi одной кнопкой, чек фискальный делает сам Kaspi.
 */
export async function notifyAdminAboutPayment(
  payment: PendingPayment & { master: Master },
  method: PaymentMethod = "transfer",
): Promise<void> {
  const adminChatId = getAdminChatId();
  if (!adminChatId) {
    console.warn("ADMIN_TG_CHAT_ID не задан — пропускаю уведомление админа");
    return;
  }

  const m = payment.master;
  const days = payment.activatedDays ?? DAYS_MONTH;
  const founderInfo = isFounderPrice(m) ? " · цена основателя" : "";

  const lines = [
    method === "invoice"
      ? `🧾 <b>Выставь счёт в Kaspi Pay</b>\nНомер: <code>${m.phone}</code>, сумма: <b>${formatTenge(payment.amount)}</b>. Оплатит — жми ✅.`
      : `💰 <b>Новая оплата</b>`,
    ``,
    `<b>От:</b> ${m.firstName ?? ""} ${m.lastName ?? ""}`.trim(),
    `<b>Телефон:</b> <code>${m.phone}</code>`,
    m.email ? `<b>Email:</b> ${m.email}` : null,
    m.companyName ? `<b>Компания:</b> ${m.companyName}` : null,
    `<b>Сумма:</b> ${formatTenge(payment.amount)} за ${days === DAYS_YEAR ? "год" : "месяц"}${founderInfo}`,
    `<b>Сейчас:</b> ${m.paidUntil ? `оплачено до ${formatDate(m.paidUntil)}` : "без подписки"}`,
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
      { text: `✅ Активировать ${days} дней`, callback_data: `pay:approve:${payment.id}` },
    ],
    [
      { text: "❌ Отклонить", callback_data: `pay:reject:${payment.id}` },
    ],
  ]);
}

/**
 * Активирует подписку: продлевает paidUntil на срок заявки (30 или 365 дней),
 * делает мастера основателем, если оплата успела до дедлайна, ведёт счётчик
 * оплаченных месяцев по цене основателя.
 * Транзакционно: обновляет PendingPayment.status + Master.
 */
export async function activateSubscription(params: {
  paymentId: string;
  adminId: string;
  /** Переопределить срок (админка). По умолчанию — срок из заявки. */
  days?: number;
}): Promise<{ master: Master; payment: PendingPayment; firstApproved: boolean }> {
  const payment = await prisma.pendingPayment.findUnique({
    where: { id: params.paymentId },
    include: { master: true },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "APPROVED") {
    return { master: payment.master, payment, firstApproved: false };
  }

  const days = params.days ?? payment.activatedDays ?? DAYS_MONTH;
  const now = new Date();
  // Основатель — по дате заявки, а не одобрения: мастер не должен терять
  // цену из-за того, что чек проверили на день позже дедлайна.
  const becomesFounder = payment.createdAt < FOUNDER_DEADLINE;

  // Interactive transaction решает race condition: если два админа
  // одновременно нажмут «✅ Активировать», updateMany с условием
  // status: { not: "APPROVED" } делает atomic claim — вторая транзакция
  // ничего не обновит. founderMonthsPaid читается ВНУТРИ tx из свежих данных.
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

    const master = await tx.master.findUnique({ where: { id: payment.masterId } });
    if (!master) throw new Error("Master not found");

    const currentPaidUntil = master.paidUntil && master.paidUntil > now ? master.paidUntil : now;
    const newPaidUntil = new Date(currentPaidUntil.getTime() + days * 24 * 60 * 60 * 1000);

    const isFounder = master.isFounder || becomesFounder;
    const paidByFounderPrice = isFounder && master.founderMonthsPaid < FOUNDER_MONTHS;
    const monthsPaid = days >= DAYS_YEAR ? 12 : 1;
    const newFounderMonthsPaid = paidByFounderPrice
      ? master.founderMonthsPaid + monthsPaid
      : master.founderMonthsPaid;

    const prevApproved = await tx.pendingPayment.count({
      where: { masterId: payment.masterId, status: "APPROVED", id: { not: payment.id } },
    });
    const firstApproved = prevApproved === 0;

    const updatedMaster = await tx.master.update({
      where: { id: payment.masterId },
      data: {
        paidUntil: newPaidUntil,
        subscriptionTier: "PRO",
        isFounder,
        founderActivatedAt: isFounder && !master.isFounder ? now : master.founderActivatedAt,
        founderMonthsPaid: newFounderMonthsPaid,
        // Legacy-поле: держим актуальную цену, чтобы админка не путала.
        monthlyPrice: newFounderMonthsPaid < FOUNDER_MONTHS && isFounder ? FOUNDER_PRICE_MONTH : PRICE_MONTH,
        welcomeSent: firstApproved ? true : master.welcomeSent,
      },
    });

    const updatedPayment = await tx.pendingPayment.findUniqueOrThrow({ where: { id: payment.id } });
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
 * Сообщаем мастеру о решении по его оплате: пуш в приложение (есть у
 * большинства) + Telegram, если привязан. Первая оплата — welcome с
 * приглашениями в группы.
 */
export async function notifyUserAboutPaymentDecision(params: {
  master: Master;
  payment: PendingPayment;
  approved: boolean;
  firstApproved?: boolean;
}): Promise<void> {
  const { master, payment, approved, firstApproved } = params;
  const chatId = master.telegramChatId;

  if (!approved) {
    await sendPushToMaster(master.id, {
      title: "Оплата не подтверждена",
      body: payment.reviewNotes
        ? `Причина: ${payment.reviewNotes}. Напишите нам, разберёмся.`
        : "Не нашли перевод. Напишите нам, разберёмся.",
      data: { screen: "/(tabs)/profile" },
    });
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `❌ <b>Оплата не подтверждена</b>\n\n` +
        `Сумма: ${formatTenge(payment.amount)}\n` +
        (payment.reviewNotes ? `Причина: ${payment.reviewNotes}\n` : ``) +
        `\nСвяжитесь с поддержкой: ${getKaspiPhone()}`,
      );
    }
    return;
  }

  const until = formatDate(master.paidUntil);
  await sendPushToMaster(master.id, {
    title: "Оплата принята ✅",
    body: `PRO активен до ${until}. Спасибо, что с нами!`,
    data: { screen: "/(tabs)/profile" },
  });

  if (!chatId) return;

  const lines = [
    `✅ <b>Оплата принята!</b>`,
    ``,
    `Сумма: ${formatTenge(payment.amount)}`,
    `PRO активен до: <b>${until}</b>`,
  ];
  if (master.isFounder && master.founderMonthsPaid < FOUNDER_MONTHS) {
    const remaining = FOUNDER_MONTHS - master.founderMonthsPaid;
    lines.push(``, `🏆 Цена основателя: ещё ${remaining} мес по ${formatTenge(FOUNDER_PRICE_MONTH)}`);
  } else if (master.isFounder) {
    lines.push(``, `Год по цене основателя закончился. Дальше — ${formatTenge(PRICE_MONTH)}/мес`);
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
