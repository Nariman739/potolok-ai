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
  LAUNCH_PRICE_MONTH,
  LAUNCH_PRICE_UNTIL,
  isLaunchPriceOpen,
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
    launchPriceMonth: LAUNCH_PRICE_MONTH,
    launchPriceUntil: LAUNCH_PRICE_UNTIL.toISOString(),
  };
}

/**
 * Сумма и срок одной оплаты. Зависит только от даты, не от мастера
 * (Master.monthlyPrice не участвует: у 505 мастеров там 9 999 с прошлой эпохи).
 * Пока открыта стартовая цена — только месяц по LAUNCH_PRICE_MONTH: годовой
 * оплаты нет, чтобы не фиксировать низкую цену на год (решение 14.10).
 */
export function quotePayment(
  period: BillingPeriod = "month",
  now = new Date(),
): { amount: number; days: number; period: BillingPeriod; launch: boolean } {
  if (isLaunchPriceOpen(now)) {
    return { amount: LAUNCH_PRICE_MONTH, days: DAYS_MONTH, period: "month", launch: true };
  }
  if (period === "year") return { amount: PRICE_YEAR, days: DAYS_YEAR, period, launch: false };
  return { amount: PRICE_MONTH, days: DAYS_MONTH, period, launch: false };
}

function formatTenge(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(amount) + "₸";
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Almaty" });
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
  const founderInfo = payment.createdAt < LAUNCH_PRICE_UNTIL ? " · стартовая цена" : "";

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
 * Активирует подписку: продлевает paidUntil на срок заявки (30 или 365 дней).
 * Кто оплатил по стартовой цене — помечаем isFounder (значок «первые», на цену
 * дальше не влияет). Транзакционно: обновляет PendingPayment.status + Master.
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
  // По дате заявки, а не одобрения: сумму мастер уже заплатил по той цене.
  const becomesFounder = payment.createdAt < LAUNCH_PRICE_UNTIL;

  // Interactive transaction решает race condition: если два админа
  // одновременно нажмут «✅ Активировать», updateMany с условием
  // status: { not: "APPROVED" } делает atomic claim — вторая транзакция
  // ничего не обновит.
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
        // Legacy-поле: держим актуальную цену, чтобы админка не путала.
        monthlyPrice: PRICE_MONTH,
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
  if (isLaunchPriceOpen()) {
    lines.push(``, `До ${formatDate(LAUNCH_PRICE_UNTIL)} продление — тоже ${formatTenge(LAUNCH_PRICE_MONTH)}/мес.`);
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
