import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { addClientEvent, changeClientStatus } from "@/lib/clients";
import { formatPrice } from "@/lib/format";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const body = await request.json();
    const { signerName, signerPassport, agreed } = body as {
      signerName?: string;
      signerPassport?: string;
      agreed?: boolean;
    };

    if (!agreed) {
      return NextResponse.json(
        { error: "Нужно подтвердить согласие с условиями" },
        { status: 400 },
      );
    }
    if (!signerName || signerName.trim().length < 3) {
      return NextResponse.json(
        { error: "Введите ваше ФИО" },
        { status: 400 },
      );
    }

    const estimate = await prisma.estimate.findUnique({
      where: { contractPublicId: publicId },
      include: {
        master: { select: { telegramChatId: true, notifyDealWon: true } },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Договор не найден" },
        { status: 404 },
      );
    }

    if (estimate.contractSignedAt) {
      return NextResponse.json(
        { error: "Договор уже подписан" },
        { status: 400 },
      );
    }

    // Из заголовков — IP и UA
    const h = await headers();
    const forwarded = h.get("x-forwarded-for") || "";
    const realIp = h.get("x-real-ip") || "";
    const ip = (forwarded.split(",")[0] || realIp || "").trim() || null;
    const userAgent = h.get("user-agent") || null;

    const signedName = signerName.trim();
    const signedPassport = signerPassport?.trim() || null;
    const signedAt = new Date();

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        contractSignedAt: signedAt,
        contractSignerName: signedName,
        contractSignerPassport: signedPassport,
        contractSignerIp: ip,
        contractSignerUserAgent: userAgent,
      },
    });

    // CRM event + перевод сделки в WON
    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "CONTRACT_SIGNED",
        content: `${signedName} подписал договор электронно`,
        metadata: {
          estimateId: estimate.id,
          contractPublicId: publicId,
          ip,
          passport: signedPassport,
        },
      }).catch(() => {});
      changeClientStatus(estimate.clientId, "WON", "Договор подписан клиентом").catch(
        () => {},
      );
    }

    // Telegram-уведомление мастеру
    if (
      estimate.master?.telegramChatId &&
      estimate.master.notifyDealWon !== false
    ) {
      const price = estimate.total || 0;
      const text =
        `📝 <b>${signedName} подписал договор электронно!</b>\n\n` +
        (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
        `📅 ${signedAt.toLocaleString("ru-RU")}\n` +
        `\n<i>Скачайте подписанный PDF из дашборда.</i>`;
      sendTelegramMessage(estimate.master.telegramChatId, text);
    }

    return NextResponse.json({
      success: true,
      signedAt: signedAt.toISOString(),
      signerName: signedName,
    });
  } catch (error) {
    console.error("Sign contract error:", error);
    return NextResponse.json(
      { error: "Ошибка подтверждения" },
      { status: 500 },
    );
  }
}
