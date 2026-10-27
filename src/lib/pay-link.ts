import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import { isLaunchPriceOpen, pricesFor } from "@/lib/billing";
import { currencyFor } from "@/lib/company";
import { formatMoney } from "@/lib/currency";

/**
 * Ссылка на оплату с автовходом (25.10.2026). Мастер нажимает её в Telegram
 * или по пушу → /api/auth/bridge выдаёт сессию → сразу /pricing под своим
 * аккаунтом: карта или Kaspi, без пароля. Это главный путь для iPhone, где в
 * самом приложении про оплату говорить нельзя (App Store 3.1.1).
 *
 * platform у токена = null → bridge НЕ ставит куку app_platform, и сайт
 * показывает цены даже в Safari на iPhone (по User-Agent нельзя отличить
 * Safari от встроенного браузера приложения — на этом и был баг).
 */
const PAY_LINK_TTL_MS = 24 * 60 * 60 * 1000;
/** Не чаще раза в N дней на мастера, чтобы не превратиться в спам. */
const NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://potolok.ai").replace(/\/$/, "");
}

export async function mintPayLink(masterId: string, ttlMs = PAY_LINK_TTL_MS): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  // Неоткрытые ссылки этого мастера, которые уже протухли, — подчищаем здесь же,
  // иначе каждый повтор 402 (оффлайн-очередь мобилки) копит строки.
  await prisma.bridgeToken.deleteMany({ where: { masterId, expiresAt: { lt: new Date() } } }).catch(() => {});
  await prisma.bridgeToken.create({
    data: { masterId, token, platform: null, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return `${siteUrl()}/api/auth/bridge?bt=${token}&redirect=${encodeURIComponent("/pricing")}`;
}

export type NudgeKind = "grace" | "blocked";

/** Куда у мастера вообще может дойти ссылка — чтобы текст ошибки не обещал лишнего. */
export async function payChannels(masterId: string): Promise<{ telegram: boolean; push: boolean }> {
  const [m, devices] = await Promise.all([
    prisma.master.findUnique({ where: { id: masterId }, select: { telegramChatId: true } }),
    prisma.pushDevice.count({ where: { masterId, disabledAt: null } }),
  ]);
  return { telegram: !!m?.telegramChatId, push: devices > 0 };
}

/**
 * «Бесплатные объекты закончились» + ссылка. grace — этот замер ещё сохранится
 * (в долг), blocked — уже нет. Telegram (если привязан) и пуш в приложение.
 * Текст пуша без цены и без ссылки — цена и ссылка в data/Telegram.
 */
export async function sendPayNudge(masterId: string, kind: NudgeKind): Promise<boolean> {
  const m = await prisma.master.findUnique({
    where: { id: masterId },
    select: { firstName: true, telegramChatId: true, payNudgeSentAt: true },
  });
  if (!m) return false;
  if (m.payNudgeSentAt && Date.now() - m.payNudgeSentAt.getTime() < NUDGE_COOLDOWN_MS) return false;
  const devices = await prisma.pushDevice.count({ where: { masterId, disabledAt: null } });
  // Некуда слать — не тратим ссылку и не ставим отметку: текст ошибки в
  // приложении сам объяснит, где оформить PRO.
  if (!m.telegramChatId && devices === 0) return false;

  const url = await mintPayLink(masterId);
  // Цена и способ — по валюте: из России платят переводом (Золотая Корона,
  // Сбер, Т-Банк), карты РФ и Kaspi у них не работают (27.10.2026).
  const currency = await currencyFor(masterId).catch(() => "KZT" as const);
  const prices = pricesFor(currency);
  const price = formatMoney(isLaunchPriceOpen() ? prices.launchMonth : prices.month, currency);
  const how = currency === "RUB" ? "оплата переводом из России за 5 минут" : "оплата картой или Kaspi за минуту";
  const name = m.firstName ? `${m.firstName}, ` : "";

  // Сначала отметка, потом отправка: если пуш/Telegram упадут, повтор будет
  // не раньше, чем через 3 дня — лучше недослать, чем задолбать.
  await prisma.master.update({ where: { id: masterId }, data: { payNudgeSentAt: new Date() } });

  const tgText =
    kind === "grace"
      ? `${name}бесплатные объекты закончились — этот замер мы сохранили «в долг», следующий будет только с PRO.\n\n` +
        `PRO — ${price} в месяц. Нажмите, войдёте сразу под своим аккаунтом, ${how}:\n${url}\n\n` +
        `Всё, что вы уже сделали, остаётся открытым в любом случае.`
      : `${name}для нового объекта нужен тариф PRO — ${price} в месяц.\n\n` +
        `Нажмите, войдёте сразу под своим аккаунтом, ${how}:\n${url}\n\n` +
        `Старые замеры и КП открыты, ничего не пропадёт.`;

  if (m.telegramChatId) {
    await sendTelegramMessage(m.telegramChatId, tgText).catch((err) => console.error("pay nudge tg failed:", err));
  }

  await sendPushToMaster(masterId, {
    title: kind === "grace" ? "Этот замер — сверх бесплатных" : "Для нового объекта нужен PRO",
    body:
      kind === "grace"
        ? "Сохранили его в долг. Следующий — только с PRO. Ссылка для подключения ждёт в Telegram и в профиле."
        : "Старые замеры и КП открыты. Ссылка для подключения PRO — в Telegram и в профиле.",
    data: { screen: "/(tabs)/profile", payUrl: url },
  });

  return true;
}
