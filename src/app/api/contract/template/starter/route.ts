import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { generateContractHtml, dateText, durationText, yearsText } from "@/lib/contract-html";
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
  masterPhone: "@@ТЕЛМАСТЕРА@@",
  city: "@@ГОРОД@@",
  work: "@@РАБОТА@@",
  total: 1234567,
  // Даты, срок и гарантии — числами-маркерами, которые в живом договоре не
  // встречаются; потом они меняются на метки (26.09.2026). Раньше в шаблон
  // запекались дата его создания, «_______» вместо города и гарантии из
  // профиля на тот день — и каждый новый договор печатал их как есть.
  createdAt: new Date("2002-02-02T12:00:00Z"),
  workStart: new Date("2001-01-01T12:00:00Z"),
  durationDays: 999,
  warrantyMaterials: 7777,
  warrantyInstall: 8888,
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
      {
        ...owner,
        companyName: MARK.company,
        // Реквизиты в шаблон не запекаем — они меткой {реквизиты_исполнителя},
        // и мастер, поменяв банк в профиле, получит свежие в каждом договоре.
        legalName: null,
        bin: null,
        iin: null,
        passportData: null,
        legalAddress: null,
        bankName: null,
        iban: null,
        kbe: null,
        bik: null,
        phone: MARK.masterPhone,
        whatsappPhone: MARK.masterPhone,
        contractCity: MARK.city,
        warrantyMaterials: MARK.warrantyMaterials,
        warrantyInstall: MARK.warrantyInstall,
      },
      {
        publicId: "{номер}",
        clientName: MARK.client,
        clientPhone: MARK.phone,
        clientAddress: MARK.address,
        total: MARK.total,
        createdAt: MARK.createdAt,
        workStartDate: MARK.workStart,
        workDurationDays: MARK.durationDays,
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
      .replace(new RegExp(esc(MARK.masterPhone), "g"), "{телефон_исполнителя}")
      .replace(new RegExp(esc(MARK.city), "g"), "{город}")
      .replace(new RegExp(esc(dateText(MARK.createdAt, lang)), "g"), "{дата}")
      .replace(new RegExp(esc(dateText(MARK.workStart, lang)), "g"), "{дата_начала}")
      .replace(new RegExp(esc(durationText(MARK.durationDays, lang)), "g"), "{срок}")
      .replace(new RegExp(esc(yearsText(MARK.warrantyMaterials, lang)), "g"), "{гарантия_материал}")
      .replace(new RegExp(esc(yearsText(MARK.warrantyInstall, lang)), "g"), "{гарантия_монтаж}")
      // Номер договора генератор поднимает в верхний регистр.
      .replace(/\{НОМЕР\}/g, "{номер}")
      // В блоке подписей после имени — реквизиты (БИН, счёт, банк) из профиля.
      .replace("<p>{исполнитель}</p>", "<p>{исполнитель}</p>\n      {реквизиты_исполнителя}")
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
