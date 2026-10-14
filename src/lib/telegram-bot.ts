// Telegram-бот PotolokAI — только уведомления и пара команд.
//
// История: до 14.10.2026 здесь жили расчёт по фото через ИИ и Instagram-постинг
// (/post, 5 агентов, контент-план). Постингом никто не пользовался с апреля,
// а мастера, присылавшие боту фото, упирались в «сделаю пост для Instagram».
// Всё вырезано (решение Наримана). Замеры и КП — в приложении; бот присылает
// события (клиент открыл КП, подписал договор/акт), напоминания и коды сброса.

import { prisma } from "@/lib/prisma";
import { currencyFor } from "@/lib/company";
import { formatMoney } from "@/lib/currency";
import { sendTelegramMessage } from "@/lib/telegram";

/** Что умеет бот — одним текстом, чтобы /help и ответ на «не команду» совпадали. */
export const BOT_HELP =
  `🤖 <b>Бот PotolokAI</b>\n\n` +
  `Сюда приходят уведомления из приложения:\n` +
  `👀 клиент открыл или подтвердил КП\n` +
  `✍️ клиент подписал договор или акт\n` +
  `⏰ напоминания по объектам\n` +
  `🔐 код для сброса пароля\n\n` +
  `Замеры, расчёты и КП — в приложении potolok.ai.\n\n` +
  `<b>Команды:</b>\n` +
  `/kp — последние 5 КП со ссылками\n` +
  `/help — эта справка`;

export async function handleBotCommand(
  chatId: string,
  command: string,
  masterId: string,
): Promise<void> {
  switch (command) {
    case "/list":
    case "/kp": {
      const estimates = await prisma.estimate.findMany({
        where: { masterId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { publicId: true, clientName: true, total: true, status: true, createdAt: true },
      });

      if (estimates.length === 0) {
        await sendTelegramMessage(chatId, "📋 У вас пока нет КП. Сделайте замер в приложении — КП появится здесь.");
        return;
      }

      const statusEmoji: Record<string, string> = {
        DRAFT: "📝",
        SENT: "📤",
        VIEWED: "👀",
        CONFIRMED: "✅",
        REJECTED: "❌",
        REVISED: "🔄",
      };

      // Валюта владельца компании (07.10.2026)
      const currency = await currencyFor(masterId);
      const lines = ["📋 <b>Последние КП:</b>\n"];
      for (const est of estimates) {
        const emoji = statusEmoji[est.status] || "📄";
        const date = est.createdAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
        const client = est.clientName || "Без имени";
        lines.push(`${emoji} ${client} — ${formatMoney(est.total, currency, "ru")} (${date})`);
        lines.push(`   🔗 potolok.ai/kp/${est.publicId}\n`);
      }
      await sendTelegramMessage(chatId, lines.join("\n"));
      break;
    }

    case "/help":
    default:
      await sendTelegramMessage(chatId, BOT_HELP);
      break;
  }
}
