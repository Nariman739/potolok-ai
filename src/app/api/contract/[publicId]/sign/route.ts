import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { addClientEvent, changeClientStatus } from "@/lib/clients";
import { formatPrice } from "@/lib/format";
import { currencyFor, ownerBrandFor } from "@/lib/company";
import { CONTRACT_MASTER_SELECT, contractHash, renderLiveContract } from "@/lib/contract-render";
import { asLang } from "@/lib/i18n";
import { reportError } from "@/lib/report-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const body = await request.json();
    const { signerName, signerPassport, agreed, seenHash, lang: langParam } = body as {
      signerName?: string;
      signerPassport?: string;
      agreed?: boolean;
      /** Отпечаток текста, который клиент видел на странице. */
      seenHash?: string;
      lang?: string;
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

    const estimate = await prisma.estimate.findFirst({
      where: { contractPublicId: publicId, deletedAt: null },
      include: {
        master: { select: { ...CONTRACT_MASTER_SELECT, telegramChatId: true, notifyDealWon: true } },
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

    // Подпись замораживает текст, который клиент видел: неподписанный договор
    // рисуется из живого шаблона, и снимок дня создания мог от него отстать.
    const brand = await ownerBrandFor(estimate.masterId, estimate.master);
    const [ru, kk] = await Promise.all([
      renderLiveContract(estimate, brand, "ru"),
      renderLiveContract(estimate, brand, "kk"),
    ]);
    const lang = asLang(langParam ?? brand.language);
    if (seenHash && contractHash(lang === "kk" ? kk.html : ru.html) !== seenHash) {
      return NextResponse.json(
        {
          error: lang === "kk" ? "Шарт мәтіні өзгерді. Жаңа мәтінді оқып, қайта қол қойыңыз" : "Текст договора изменился. Прочитайте новый текст и подпишите ещё раз",
          changed: true,
        },
        { status: 409 },
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
        contractTextSnapshot: {
          ...((estimate.contractTextSnapshot as object | null) ?? {}),
          html: { ru: ru.html, kk: kk.html },
          templateVersion: { ru: ru.templateVersion, kk: kk.templateVersion },
          frozenAt: signedAt.toISOString(),
        },
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
      // Валюта владельца компании (07.10.2026)
      const currency = await currencyFor(estimate.masterId);
      const text =
        `📝 <b>${signedName} подписал договор электронно!</b>\n\n` +
        (price ? `💰 Сумма: <b>${formatPrice(price, currency)}</b>\n` : "") +
        `📅 ${signedAt.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}\n` +
        `\n<i>Скачайте подписанный PDF из дашборда.</i>`;
      sendTelegramMessage(estimate.master.telegramChatId, text);
    }

    return NextResponse.json({
      success: true,
      signedAt: signedAt.toISOString(),
      signerName: signedName,
    });
  } catch (error) {
    reportError(error, "contract/[publicId]/sign", "Sign contract error");
    return NextResponse.json(
      { error: "Ошибка подтверждения" },
      { status: 500 },
    );
  }
}
