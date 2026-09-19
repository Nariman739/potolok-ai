import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import { formatPrice } from "@/lib/format";
import { changeClientStatus, addClientEvent } from "@/lib/clients";

// In-memory rate limit (best-effort; fine for a single-instance Vercel function).
// 5 attempts per IP per 15 minutes — enough to keep enumeration noise down
// without blocking legit "double-tap" confirms.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; firstAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

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
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });
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
        // Нужен, чтобы отправить пуш на телефон мастера.
        masterId: true,
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

    const clientStr = estimate.clientName || "Клиент";

    if (
      estimate.master?.telegramChatId &&
      estimate.master.notifyDealWon !== false
    ) {
      const text =
        `✅ <b>${clientStr} принял КП!</b>\n\n` +
        (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
        `\n<i>Откройте дашборд PotolokAI, чтобы посмотреть детали.</i>`;
      sendTelegramMessage(estimate.master.telegramChatId, text);
    }

    // Пуш на телефон. Самое важное уведомление в продаже — раньше доходило
    // только до тех 9% мастеров, у кого привязан Telegram.
    //
    // after(): на Vercel функция засыпает сразу после ответа клиенту, а здесь
    // ещё поход в базу за устройствами и запрос в Expo. Без этого уведомление
    // молча терялось бы — и никто бы не заметил.
    if (estimate.master?.notifyDealWon !== false) {
      after(async () => {
        await sendPushToMaster(estimate.masterId, {
          title: `${clientStr} принял КП!`,
          body: price ? `Сумма ${formatPrice(price)}. Пора в цех.` : "Пора в цех.",
          data: { screen: `/estimate/${estimate.id}` },
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm estimate (by-public) error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
