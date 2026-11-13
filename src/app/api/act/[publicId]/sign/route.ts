import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { BAD_JSON_TEXT, readJsonObject } from "@/lib/read-json";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToMaster } from "@/lib/push";
import { addClientEvent } from "@/lib/clients";
import { formatPrice } from "@/lib/format";
import { asCurrency } from "@/lib/currency";
import { ownerBrandFor } from "@/lib/company";
import { renderAct, ACT_MASTER_SELECT } from "@/lib/act-render";
import type { CalculationResult } from "@/lib/types";
import { ACT_REPLACED_TEXT, isActReplaced, lockForSign, otherVariantChosen } from "@/lib/estimate-replace";

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
    // Пустое или битое тело, а также не-объект (null, массив) — ошибка клиента: 400, а не 500.
    const body = (await readJsonObject(request)) as { signerName?: string; agreed?: boolean; method?: string } | null;
    if (!body) return NextResponse.json({ error: BAD_JSON_TEXT }, { status: 400 });
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
      include: { master: { select: { ...ACT_MASTER_SELECT, telegramChatId: true, notifyDealWon: true, currency: true } } },
    });
    if (!estimate) return NextResponse.json({ error: "Акт не найден" }, { status: 404 });
    if (estimate.actSignedAt) return NextResponse.json({ error: "Акт уже подписан" }, { status: 400 });
    // Мастер выбрал другой вариант КП — этот акт не действует (13.11.2026)
    if (isActReplaced(estimate) || (await otherVariantChosen(prisma, estimate))) return NextResponse.json({ error: ACT_REPLACED_TEXT, replaced: true }, { status: 409 });

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") || "";
    const realIp = h.get("x-real-ip") || "";
    const ip = (forwarded.split(",")[0] || realIp || "").trim() || null;
    const userAgent = h.get("user-agent") || null;
    const signedName = signerName.trim();
    const signedAt = new Date();

    // Снимок: реквизиты владельца компании, платежи и замечания на этот момент.
    const master = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);
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

    // Строка под замком (FOR UPDATE): из двух подписей пройдёт одна, а выбор нового
    // варианта (confirmReplacing) либо уже пометил акт «заменён» — отказ, либо ждёт.
    // Замки объект → КП (как у выбора варианта): подпись и выбор другого варианта идут по очереди.
    const outcome = await prisma.$transaction(async (tx) => {
      await lockForSign(tx, estimate.id, estimate.measurementObjectId);
      const [row] = await tx.$queryRaw<{ actSignedAt: Date | null; actTextSnapshot: unknown; status: string }[]>`
        SELECT "actSignedAt", "actTextSnapshot", status::text AS status FROM "Estimate" WHERE id = ${estimate.id} FOR UPDATE`;
      if (!row || row.actSignedAt) return "signed" as const;
      if (isActReplaced(row)) return "replaced" as const;
      // Акт, созданный уже после выбора другого варианта: пометки нет, но КП не принято
      if (await otherVariantChosen(tx, { id: estimate.id, status: row.status, measurementObjectId: estimate.measurementObjectId })) return "replaced" as const;
      const { count } = await tx.estimate.updateMany({
      where: { id: estimate.id, actSignedAt: null },
      data: {
        actSignedAt: signedAt,
        actSignerName: signedName,
        actSignerIp: ip,
        actSignerUserAgent: userAgent,
        actSignMethod: method,
        actTextSnapshot: { version: 1, html: { ru, kk }, createdAt: signedAt.toISOString() },
      },
    });
      return count === 0 ? ("signed" as const) : ("ok" as const);
    });
    if (outcome === "replaced") return NextResponse.json({ error: ACT_REPLACED_TEXT, replaced: true }, { status: 409 });
    if (outcome === "signed") {
      return NextResponse.json({ error: "Акт уже подписан" }, { status: 400 });
    }

    if (estimate.clientId) {
      await addClientEvent({
        clientId: estimate.clientId,
        type: "ACT_SIGNED",
        content: `${signedName} подписал акт приёмки работ`,
        metadata: { estimateId: estimate.id, actPublicId: publicId, ip, method },
      }).catch(() => {});
    }
    const price = estimate.total || 0;
    // Валюта — владельца компании, уже подтянута ownerBrandFor (07.10.2026)
    const currency = asCurrency(master.currency);
    after(() => sendPushToMaster(estimate.masterId, {
      title: `${signedName} принял работы`,
      body: `Акт подписан${price ? ` · ${formatPrice(price, currency)}` : ""}`,
      data: { screen: `/estimate/${estimate.id}` },
    }));
    const chatId = estimate.master?.telegramChatId;
    if (chatId && estimate.master.notifyDealWon !== false) {
      after(() => sendTelegramMessage(
        chatId,
        `📝 <b>${signedName} подписал АКТ приёмки работ!</b>\n\n` +
          (price ? `💰 Сумма: <b>${formatPrice(price, currency)}</b>\n` : "") +
          `📅 ${signedAt.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}\n` +
          `\n<i>С этой даты идёт гарантия. Подписанный акт — по той же ссылке.</i>`,
      ));
    }
    return NextResponse.json({ success: true, signedAt: signedAt.toISOString(), signerName: signedName });
  } catch (error) {
    console.error("Sign act error:", error);
    return NextResponse.json({ error: "Ошибка подтверждения" }, { status: 500 });
  }
}
