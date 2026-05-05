import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { addClientEvent } from "@/lib/clients";
import { formatPrice } from "@/lib/format";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const body = await request.json();
    const { signerName, agreed } = body as {
      signerName?: string;
      agreed?: boolean;
    };

    if (!agreed) {
      return NextResponse.json(
        { error: "Нужно подтвердить согласие" },
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
      where: { actPublicId: publicId },
      include: {
        master: { select: { telegramChatId: true, notifyDealWon: true } },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Акт не найден" },
        { status: 404 },
      );
    }

    if (estimate.actSignedAt) {
      return NextResponse.json(
        { error: "Акт уже подписан" },
        { status: 400 },
      );
    }

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") || "";
    const realIp = h.get("x-real-ip") || "";
    const ip = (forwarded.split(",")[0] || realIp || "").trim() || null;
    const userAgent = h.get("user-agent") || null;

    const signedName = signerName.trim();
    const signedAt = new Date();

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        actSignedAt: signedAt,
        actSignerName: signedName,
        actSignerIp: ip,
        actSignerUserAgent: userAgent,
      },
    });

    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "ACT_SIGNED",
        content: `${signedName} подписал акт выполненных работ`,
        metadata: { estimateId: estimate.id, actPublicId: publicId, ip },
      }).catch(() => {});
    }

    if (
      estimate.master?.telegramChatId &&
      estimate.master.notifyDealWon !== false
    ) {
      const price = estimate.total || 0;
      const text =
        `📝 <b>${signedName} подписал АКТ выполненных работ!</b>\n\n` +
        (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
        `📅 ${signedAt.toLocaleString("ru-RU")}\n` +
        `\n<i>Объект закрыт. Скачайте подписанный акт из дашборда.</i>`;
      sendTelegramMessage(estimate.master.telegramChatId, text);
    }

    return NextResponse.json({
      success: true,
      signedAt: signedAt.toISOString(),
      signerName: signedName,
    });
  } catch (error) {
    console.error("Sign act error:", error);
    return NextResponse.json(
      { error: "Ошибка подтверждения" },
      { status: 500 },
    );
  }
}
