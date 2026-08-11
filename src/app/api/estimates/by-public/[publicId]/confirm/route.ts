import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatPrice } from "@/lib/format";
import { changeClientStatus, addClientEvent } from "@/lib/clients";
import { checkRateLimit } from "@/lib/rate-limit";

// HIGH-1 fix (аудит 2026-06-06): был in-memory Map, сбрасывался на каждом
// cold-start Vercel Lambda → защита от перебора publicId по факту не работала
// под нагрузкой. Перешли на Upstash (distributed) через checkRateLimit.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;
    await request.json().catch(() => ({}));

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = await checkRateLimit(`confirm:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const estimate = await prisma.estimate.findFirst({
      where: { publicId, deletedAt: null },
      select: {
        id: true,
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

    // 404 (not 403) on unknown publicId — no signal about existence.
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
      where: { id: estimate.id },
      data: { status: "CONFIRMED" },
    });

    const price = estimate.total || estimate.standardTotal || 0;

    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "KP_CONFIRMED",
        content: price ? `Сумма: ${formatPrice(price)}` : null,
        metadata: { estimateId: estimate.id },
      }).catch(() => {});
      changeClientStatus(estimate.clientId, "WON", "КП подтверждено клиентом").catch(
        () => {},
      );
    }

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
    console.error("Confirm estimate (by-public) error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
