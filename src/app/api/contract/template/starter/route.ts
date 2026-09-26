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

/**
 * Маркеры: подставляем их вместо данных, потом меняем на метки. Так текст
 * собирает тот же генератор, что и боевой договор, и вёрстка не расходится.
 */
const MARK = {
  client: "@@КЛИЕНТ@@",
  phone: "@@ТЕЛКЛИЕНТА@@",
  address: "@@АДРЕС@@",
  company: "@@ИСПОЛНИТЕЛЬ@@",
  work: "@@РАБОТА@@",
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

    const calc = {
      roomResults: [
        { roomName: MARK.work, items: [{ itemName: MARK.work, quantity: 1, unit: "усл.", unitPrice: MARK.total, total: MARK.total }] },
      ],
      extraItems: [],
    };

    const html = generateContractHtml(
      { ...owner, companyName: MARK.company },
      {
        publicId: "{номер}",
        clientName: MARK.client,
        clientPhone: MARK.phone,
        clientAddress: MARK.address,
        total: MARK.total,
        createdAt: new Date(),
      },
      calc as never,
      lang,
    );

    // Всё, что зависит от заказа и профиля, становится метками: договор
    // печатается каждый раз заново, и данные должны браться свежие.
    const money = MARK.total.toLocaleString(lang === "kk" ? "kk-KZ" : "ru-KZ").replace(/\u00a0/g, " ");
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let body = html
      .replace(new RegExp(esc(MARK.client), "g"), "{клиент}")
      .replace(new RegExp(esc(MARK.phone), "g"), "{телефон_клиента}")
      .replace(new RegExp(esc(MARK.address), "g"), "{адрес}")
      .replace(new RegExp(esc(MARK.company), "g"), "{исполнитель}")
      .replace(new RegExp(esc(money), "g"), "{сумма}")
      .replace(/1\s?234\s?567/g, "{сумма}");

    // Сумма прописью — единственное место, где число превращается в слова;
    // ищем строку в скобках рядом с суммой.
    body = body.replace(/\(([^)]*(?:тенге|теңге))\)/g, "({сумма_прописью})");

    // Суммы этапов оплаты считаются от итога заказа — в шаблоне на их месте
    // должна стоять метка, иначе у всех клиентов застынет одна и та же
    // цифра (26.09.2026).
    body = body.replace(/\d[\d\s\u00a0\u202f]{3,}\s?₸/g, "{предоплата}");

    // Строки таблицы работ заменяем одной меткой: перечень собирается из КП.
    const rowRe = new RegExp(`<tr>(?:(?!</tr>)[\\s\\S])*?${esc(MARK.work)}(?:(?!</tr>)[\\s\\S])*?</tr>`, "g");
    body = body.replace(rowRe, "{таблица_работ}");

    return NextResponse.json({ body, language: lang });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract starter error:", error);
    return NextResponse.json({ error: "Не удалось собрать договор" }, { status: 500 });
  }
}
