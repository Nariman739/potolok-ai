import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatPrice } from "@/lib/format";
import { changeClientStatus, addClientEvent } from "@/lib/clients";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Accept body but no longer require variantType
    await request.json().catch(() => ({}));

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: {
        status: true,
        clientName: true,
        total: true,
        standardTotal: true,
        clientId: true,
        master: {
          select: { telegramChatId: true, notifyDealWon: true },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    if (estimate.status !== "SENT" && estimate.status !== "VIEWED") {
      return NextResponse.json(
        { error: "Невозможно подтвердить в текущем статусе" },
        { status: 400 }
      );
    }

    await prisma.estimate.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });

    const price = estimate.total || estimate.standardTotal || 0;

    // CRM: log KP_CONFIRMED event + transition deal to WON (best-effort)
    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "KP_CONFIRMED",
        content: price ? `Сумма: ${formatPrice(price)}` : null,
        metadata: { estimateId: id },
      }).catch(() => {});
      changeClientStatus(estimate.clientId, "WON", "КП подтверждено клиентом").catch(
        () => {},
      );
    }

    // Telegram notification to master (non-blocking)
    if (
      estimate.master?.telegramChatId &&
      estimate.master.notifyDealWon !== false
    ) {
      const clientStr = estimate.clientName || "Клиент";

      const text =
        `✅ <b>${clientStr} принял КП!</b>\n\n` +
        (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
        `\n<i>Откройте дашборд PotolokAI, чтобы посмотреть детали.</i>`;

      sendTelegramMessage(estimate.master.telegramChatId, text);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm estimate error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
