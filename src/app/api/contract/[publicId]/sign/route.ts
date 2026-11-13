import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { BAD_JSON_TEXT, readJsonObject } from "@/lib/read-json";
import { syncColumnForStatus } from "@/lib/crm-board";
import { sendTelegramMessage } from "@/lib/telegram";
import { addClientEvent, changeClientStatus, syncClientStatusForObject } from "@/lib/clients";
import { formatPrice } from "@/lib/format";
import { currencyFor, ownerBrandFor } from "@/lib/company";
import { CONTRACT_MASTER_SELECT, contractHash, renderLiveContract } from "@/lib/contract-render";
import { asLang } from "@/lib/i18n";
import { reportError } from "@/lib/report-error";
import { confirmReplacing, CONTRACT_REPLACED_TEXT, CONTRACT_REPLACED_TEXT_KK, isContractReplaced, lockForSign, otherVariantChosen, ReplaceBlockedError } from "@/lib/estimate-replace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    // Пустое или битое тело — ошибка клиента: 400, а не 500 (как в auth-роутах).
    const body = await readJsonObject(request);
    if (!body) return NextResponse.json({ error: BAD_JSON_TEXT }, { status: 400 });
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

    // Мастер выбрал другой вариант КП — этот договор не действует (13.11.2026)
    const replacedError = () => NextResponse.json(
      { error: asLang(langParam) === "kk" ? CONTRACT_REPLACED_TEXT_KK : CONTRACT_REPLACED_TEXT, replaced: true },
      { status: 409 },
    );
    if (isContractReplaced(estimate) || (await otherVariantChosen(prisma, estimate))) return replacedError();

    // Подпись замораживает текст, который клиент видел: неподписанный договор
    // рисуется из живого шаблона, и снимок дня создания мог от него отстать.
    const brand = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);
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

    // Строку берём под замок (FOR UPDATE): из двух одновременных подписей пройдёт одна,
    // а выбор мастером нового варианта (confirmReplacing, тоже FOR UPDATE) либо
    // успел пометить договор «заменён» — тогда отказ, либо ждёт и увидит подпись.
    // Замки объект → КП (как у выбора варианта): подпись и выбор другого варианта идут по очереди.
    // Подпись = принятие КП (13.11.2026): в той же транзакции, под теми же замками.
    let accepted = false;
    let outcome: "signed" | "replaced" | "ok";
    try {
    outcome = await prisma.$transaction(async (tx) => {
      await lockForSign(tx, estimate.id, estimate.measurementObjectId);
      const [row] = await tx.$queryRaw<{ contractSignedAt: Date | null; contractTextSnapshot: unknown; status: string }[]>`
        SELECT "contractSignedAt", "contractTextSnapshot", status::text AS status FROM "Estimate" WHERE id = ${estimate.id} FOR UPDATE`;
      if (!row || row.contractSignedAt) return "signed" as const;
      if (isContractReplaced(row)) return "replaced" as const;
      // Договор, созданный уже после выбора другого варианта: пометки нет, но КП не принято
      if (await otherVariantChosen(tx, { id: estimate.id, status: row.status, measurementObjectId: estimate.measurementObjectId })) return "replaced" as const;
      const { count } = await tx.estimate.updateMany({
      where: { id: estimate.id, contractSignedAt: null },
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
      if (count === 0) return "signed" as const;
      // Клиент подписал договор непринятого КП — КП принято (те же правила, что «Выбрал»)
      if (row.status !== "CONFIRMED") {
        await confirmReplacing(tx, estimate.id, estimate.measurementObjectId, "sign");
        accepted = true;
      }
      return "ok" as const;
    });
    } catch (e) {
      // По другому КП объекта уже подписан договор/акт — этот договор не действует
      if (e instanceof ReplaceBlockedError) outcome = "replaced";
      else throw e;
    }
    if (outcome === "replaced") return replacedError();
    if (outcome === "signed") {
      return NextResponse.json({ error: "Договор уже подписан" }, { status: 400 });
    }

    // CRM event + перевод сделки в WON
    if (estimate.clientId) {
      await addClientEvent({
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
      await changeClientStatus(estimate.clientId, "WON", "Договор подписан клиентом").catch(
        () => {},
      );
      // Этап канбана идёт за «Сделкой» — как при смене статуса из карточки (не ниже «Договора»).
      await syncColumnForStatus(estimate.clientId, "WON").catch(() => {});
      if (accepted) {
        await addClientEvent({ clientId: estimate.clientId, type: "KP_CONFIRMED", content: "КП принято подписью договора", metadata: { estimateId: estimate.id, bySign: "contract" } }).catch(() => {});
      }
    }
    // Этап объекта — существующим синком (ручной этап не трогаем, статус клиента только вверх)
    if (accepted && estimate.measurementObjectId) {
      const objectId = estimate.measurementObjectId;
      after(() => syncClientStatusForObject(objectId).catch(() => {}));
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
        (accepted ? `✅ КП теперь принято.\n` : "") +
        `\n<i>Скачайте подписанный PDF из дашборда.</i>`;
      const chatId = estimate.master.telegramChatId;
      after(() => sendTelegramMessage(chatId, text));
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
