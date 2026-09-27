import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import { addClientEvent } from "@/lib/clients";

/**
 * «Есть замечания» на странице акта (27.09.2026) — мотивированный отказ
 * заказчика по ГК РК ст. 630 п. 2. Текст становится частью акта, мастеру
 * уходит пуш и Telegram. Подписать акт клиент сможет позже, после
 * устранения, на той же странице.
 */
export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params;
    const body = (await request.json().catch(() => ({}))) as { text?: unknown; name?: unknown };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (text.length < 5) {
      return NextResponse.json({ error: "Опишите, что нужно исправить" }, { status: 400 });
    }
    const estimate = await prisma.estimate.findFirst({
      where: { actPublicId: publicId, deletedAt: null },
      select: {
        id: true, masterId: true, clientId: true, clientName: true, clientAddress: true, actSignedAt: true,
        master: { select: { telegramChatId: true, notifyDealWon: true } },
      },
    });
    if (!estimate) return NextResponse.json({ error: "Акт не найден" }, { status: 404 });
    if (estimate.actSignedAt) return NextResponse.json({ error: "Акт уже подписан" }, { status: 400 });

    const at = new Date();
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { actClientRemarks: text, actClientRemarksAt: at },
    });

    const who = name || estimate.clientName || "Клиент";
    const where = estimate.clientAddress ? ` (${estimate.clientAddress})` : "";
    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "NOTE",
        content: `Замечания к акту от ${who}: ${text}`,
        metadata: { estimateId: estimate.id, actPublicId: publicId },
      }).catch(() => {});
    }
    void sendPushToMaster(estimate.masterId, {
      title: `${who}: есть замечания к акту`,
      body: text.slice(0, 140),
      data: { screen: `/estimate/${estimate.id}` },
    });
    if (estimate.master?.telegramChatId && estimate.master.notifyDealWon !== false) {
      sendTelegramMessage(
        estimate.master.telegramChatId,
        `⚠️ <b>${who} оставил замечания к акту</b>${where}\n\n${text}\n\n<i>После устранения клиент сможет подписать акт по той же ссылке.</i>`,
      );
    }
    return NextResponse.json({ success: true, at: at.toISOString() });
  } catch (error) {
    console.error("Act remarks error:", error);
    return NextResponse.json({ error: "Не удалось отправить замечания" }, { status: 500 });
  }
}
