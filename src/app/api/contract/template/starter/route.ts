import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { generateContractHtml } from "@/lib/contract-html";
import { asLang } from "@/lib/i18n";

/**
 * Типовой договор как отправная точка для правок (26.09.2026).
 *
 * Мастер, который ни разу не трогал договор, должен увидеть не пустое поле,
 * а рабочий текст — свой, с реквизитами и гарантиями из профиля, — и уже его
 * править словами. Поэтому берём наш типовой шаблон, подставляем то, что про
 * мастера известно, а всё, что зависит от конкретного заказа, заменяем
 * метками: имя клиента, адрес, сумму, перечень работ.
 */

/** Данные-образцы, которые затем становятся метками. */
const SAMPLE = {
  clientName: "«{клиент}»",
  clientPhone: "{телефон_клиента}",
  clientAddress: "{адрес}",
  total: 1234567,
};

export async function GET(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const url = new URL(request.url);
    const lang = asLang(url.searchParams.get("lang") ?? master.language);

    const owner = await prisma.master.findUnique({ where: { id: scope.ownerId } });
    if (!owner) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });

    const html = generateContractHtml(
      owner,
      {
        publicId: "{номер}",
        clientName: SAMPLE.clientName,
        clientPhone: SAMPLE.clientPhone,
        clientAddress: SAMPLE.clientAddress,
        total: SAMPLE.total,
        createdAt: new Date(),
      },
      { roomResults: [], extraItems: [] } as never,
      lang,
    );

    // Сумма и таблица работ зависят от заказа — на их место ставим метки.
    const money = SAMPLE.total.toLocaleString(lang === "kk" ? "kk-KZ" : "ru-KZ").replace(/ /g, " ");
    const body = html
      .replace(new RegExp(money.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "{сумма}")
      .replace(/1\s?234\s?567/g, "{сумма}");

    return NextResponse.json({ body, language: lang });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract starter error:", error);
    return NextResponse.json({ error: "Не удалось собрать договор" }, { status: 500 });
  }
}
