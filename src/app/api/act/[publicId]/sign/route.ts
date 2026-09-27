import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import { addClientEvent } from "@/lib/clients";
import { formatPrice } from "@/lib/format";
import { ownerBrandFor } from "@/lib/company";
import { renderAct, ACT_MASTER_SELECT } from "@/lib/act-render";
import type { CalculationResult } from "@/lib/types";

/**
 * Подпись акта заказчиком. Текст акта на обоих языках замораживается в
 * момент подписи — как у договора: расчёт, платежи и шаблон мастера могут
 * измениться потом, а подписанный документ нет (27.09.2026).
 * method: "link" — по ссылке на телефоне клиента, "device" — на устройстве
 * мастера в присутствии клиента.
 */
export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params;
    const body = (await request.json().catch(() => ({}))) as { signerName?: string; agreed?: boolean; method?: string };
    const { signerName, agreed } = body;
    if (!agreed) {
      return NextResponse.json({ error: "Нужно подтвердить согласие" }, { status: 400 });
    }
    if (!signerName || signerName.trim().length < 3) {
      return NextResponse.json({ error: "Введите ваше ФИО" }, { status: 400 });
    }
    const method = body.method === "device" ? "device" : "link";

    const estimate = await prisma.estimate.findFirst({
      where: { actPublicId: publicId, deletedAt: null },
      include: { master: { select: { ...ACT_MASTER_SELECT, telegramChatId: true, notifyDealWon: true } } },
    });
    if (!estimate) return NextResponse.json({ error: "Акт не найден" }, { status: 404 });
    if (estimate.actSignedAt) return NextResponse.json({ error: "Акт уже подписан" }, { status: 400 });

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") || "";
    const realIp = h.get("x-real-ip") || "";
    const ip = (forwarded.split(",")[0] || realIp || "").trim() || null;
    const userAgent = h.get("user-agent") || null;
    const signedName = signerName.trim();
    const signedAt = new Date();

    // Снимок: реквизиты владельца компании, платежи и замечания на этот момент.
    const master = await ownerBrandFor(estimate.masterId, estimate.master);
    const calc = estimate.calculationData as unknown as CalculationResult;
    const signedEstimate = {
      ...estimate,
      actSignedAt: signedAt,
      actSignerName: signedName,
      actSignerIp: ip,
      actSignMethod: method,
    };
    const [ru, kk] = await Promise.all([
      renderAct(master, signedEstimate, calc, "ru"),
      renderAct(master, signedEstimate, calc, "kk"),
    ]);

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        actSignedAt: signedAt,
        actSignerName: signedName,
        actSignerIp: ip,
        actSignerUserAgent: userAgent,
        actSignMethod: method,
        actTextSnapshot: { version: 1, html: { ru, kk }, createdAt: signedAt.toISOString() },
      },
    });

    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "ACT_SIGNED",
        content: `${signedName} подписал акт приёмки работ`,
        metadata: { estimateId: estimate.id, actPublicId: publicId, ip, method },
      }).catch(() => {});
    }
    const price = estimate.total || 0;
    void sendPushToMaster(estimate.masterId, {
      title: `${signedName} принял работы`,
      body: `Акт подписан${price ? ` · ${formatPrice(price)}` : ""}`,
      data: { screen: `/estimate/${estimate.id}` },
    });
    if (estimate.master?.telegramChatId && estimate.master.notifyDealWon !== false) {
      sendTelegramMessage(
        estimate.master.telegramChatId,
        `📝 <b>${signedName} подписал АКТ приёмки работ!</b>\n\n` +
          (price ? `💰 Сумма: <b>${formatPrice(price)}</b>\n` : "") +
          `📅 ${signedAt.toLocaleString("ru-RU")}\n` +
          `\n<i>С этой даты идёт гарантия. Подписанный акт — по той же ссылке.</i>`,
      );
    }
    return NextResponse.json({ success: true, signedAt: signedAt.toISOString(), signerName: signedName });
  } catch (error) {
    console.error("Sign act error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
