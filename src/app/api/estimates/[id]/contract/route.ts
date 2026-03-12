import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";
import PDFDocument from "pdfkit";
import { NOTO_SANS_REGULAR, NOTO_SANS_BOLD } from "@/lib/fonts";

function fmtPrice(n: number | undefined | null): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(Number(n) || 0)) + " ₸";
}

function getRoomResults(calc: CalculationResult): RoomResult[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return calc?.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function yearWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "год";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "года";
  return "лет";
}

function numberToWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "ноль тенге";
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
    "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят",
    "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот",
    "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  function three(num: number): string {
    if (num === 0) return "";
    const parts: string[] = [];
    const h = Math.floor(num / 100), rem = num % 100, t = Math.floor(rem / 10), u = rem % 10;
    if (h > 0) parts.push(hundreds[h]);
    if (rem >= 10 && rem < 20) parts.push(teens[rem - 10]);
    else { if (t > 0) parts.push(tens[t]); if (u > 0) parts.push(units[u]); }
    return parts.join(" ");
  }
  const parts: string[] = [];
  const mil = Math.floor(n / 1_000_000);
  const tho = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;
  if (mil > 0) {
    const w = mil % 10 === 1 && mil % 100 !== 11 ? "миллион"
      : [2, 3, 4].includes(mil % 10) && ![12, 13, 14].includes(mil % 100) ? "миллиона" : "миллионов";
    parts.push(`${three(mil)} ${w}`);
  }
  if (tho > 0) {
    const tStr = three(tho).replace(/\bодин$/, "одна").replace(/\bдва$/, "две");
    const w = tho % 10 === 1 && tho % 100 !== 11 ? "тысяча"
      : [2, 3, 4].includes(tho % 10) && ![12, 13, 14].includes(tho % 100) ? "тысячи" : "тысяч";
    parts.push(`${tStr} ${w}`);
  }
  if (rest > 0) parts.push(three(rest));
  return parts.join(" ").trim() + " тенге";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const masterAuth = await requireAuth();
    const { id } = await params;

    const master = await prisma.master.findUnique({ where: { id: masterAuth.id } });
    if (!master || !master.contractType || master.contractType === "none") {
      return NextResponse.json({ error: "Настройте тип договора в разделе Профиль" }, { status: 400 });
    }

    const estimate = await prisma.estimate.findFirst({ where: { id, masterId: master.id } });
    if (!estimate) return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });

    const calc = estimate.calculationData as unknown as CalculationResult;
    const isIp = master.contractType === "ip";
    const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
    const dateStr = new Date(estimate.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
    const city = master.contractCity || "_______________";
    const total = estimate.total || estimate.standardTotal || 0;
    const prepayment = Math.round(total * ((master.prepaymentPercent || 50) / 100));
    const remainder = total - prepayment;
    const masterName = master.legalName || master.companyName || `${master.firstName} ${master.lastName || ""}`.trim();
    const masterPhone = master.whatsappPhone || master.phone || "";
    const clientName = estimate.clientName || "___________________________";
    const clientPhone = estimate.clientPhone || "_______________";
    const clientAddress = estimate.clientAddress || "___________________________";
    const roomResults = getRoomResults(calc);
    const title = isIp ? "ДОГОВОР НА ОКАЗАНИЕ УСЛУГ" : "СОГЛАШЕНИЕ О ВЫПОЛНЕНИИ РАБОТ";

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const promise = collectPdf(doc);
    const W = 595.28;
    const L = 50, R = 50, CW = W - L - R;

    doc.registerFont("Sans", NOTO_SANS_REGULAR);
    doc.registerFont("Sans-Bold", NOTO_SANS_BOLD);

    // Title
    doc.font("Sans-Bold").fontSize(14).fillColor("#000")
      .text(title, L, 50, { width: CW, align: "center" });
    doc.font("Sans").fontSize(11)
      .text(`№ ${contractNum} от ${dateStr}`, L, doc.y + 4, { width: CW, align: "center" })
      .text(city, L, doc.y + 2, { width: CW, align: "center" });
    doc.moveDown(0.8);

    // Parties
    const executorDesc = isIp
      ? `${masterName}${master.bin ? `, БИН ${master.bin}` : ""}${master.iin ? `, ИИН ${master.iin}` : ""}, именуемый(-ая) в дальнейшем «Исполнитель»`
      : `${masterName}${master.iin ? `, ИИН ${master.iin}` : ""}${master.passportData ? `, уд. личности ${master.passportData}` : ""}, именуемый(-ая) в дальнейшем «Исполнитель»`;

    doc.font("Sans").fontSize(10)
      .text(`${executorDesc}, с одной стороны, и`, L, doc.y, { width: CW })
      .moveDown(0.3)
      .text(`${clientName}, именуемый(-ая) в дальнейшем «Заказчик», с другой стороны, заключили настоящий ${isIp ? "Договор" : "Соглашение"}:`, L, doc.y, { width: CW });
    doc.moveDown(0.6);

    const section = (num: string, heading: string) => {
      if (doc.y > 720) doc.addPage();
      doc.font("Sans-Bold").fontSize(10).text(`${num}. ${heading}`, L, doc.y, { width: CW });
      doc.font("Sans").fontSize(10);
      doc.moveDown(0.2);
    };
    const para = (text: string) => {
      doc.text(text, L, doc.y, { width: CW });
      doc.moveDown(0.2);
    };

    // 1. Предмет
    section("1", `ПРЕДМЕТ ${isIp ? "ДОГОВОРА" : "СОГЛАШЕНИЯ"}`);
    para(`1.1. Исполнитель выполняет монтаж натяжных потолков по адресу: ${clientAddress}.`);
    para("1.2. Перечень работ:");

    // Works table
    const colX = [L, L + 30, L + 232, L + 277, L + 322, L + 402];
    const colW = [28, 200, 43, 43, 78, CW - 352];
    let ty = doc.y;
    doc.rect(L, ty, CW, 16).fill("#f0f0f0");
    doc.font("Sans-Bold").fontSize(8).fillColor("#000");
    ["№", "Наименование", "Кол.", "Ед.", "Цена", "Сумма"].forEach((h, i) =>
      doc.text(h, colX[i] + 2, ty + 4, { width: colW[i], align: i >= 3 ? "right" : "left" })
    );
    ty += 18;
    let rowNum = 0;
    for (const rr of roomResults) {
      for (const item of (rr.items ?? [])) {
        if (ty > 760) { doc.addPage(); ty = 50; }
        rowNum++;
        doc.font("Sans").fontSize(8).fillColor("#000");
        doc.text(String(rowNum), colX[0] + 2, ty, { width: colW[0] });
        doc.text(`${item.itemName} (${rr.roomName})`, colX[1] + 2, ty, { width: colW[1] - 4 });
        const rowH = doc.y - ty;
        doc.text(`${item.quantity}`, colX[2] + 2, ty, { width: colW[2], align: "right" });
        doc.text(item.unit, colX[3] + 2, ty, { width: colW[3], align: "right" });
        doc.text(fmtPrice(item.unitPrice), colX[4] + 2, ty, { width: colW[4], align: "right" });
        doc.font("Sans-Bold").text(fmtPrice(item.total), colX[5] + 2, ty, { width: colW[5], align: "right" });
        ty += Math.max(rowH, 12) + 2;
        doc.moveTo(L, ty).lineTo(L + CW, ty).strokeColor("#ccc").lineWidth(0.5).stroke();
        ty += 2;
      }
    }
    doc.y = ty + 4;

    // 2. Оплата
    section("2", "СТОИМОСТЬ И ОПЛАТА");
    para(`2.1. Общая стоимость: ${fmtPrice(total)} (${numberToWords(total)}).`);
    para(`2.2. Предоплата ${master.prepaymentPercent || 50}% — ${fmtPrice(prepayment)} — до начала работ. Остаток ${fmtPrice(remainder)} — после подписания Акта.`);

    // 3. Сроки
    section("3", "СРОКИ");
    para("3.1. Дата начала работ: «____» ____________ 20___ г.");
    para("3.2. Срок выполнения: ______ рабочих дней.");

    // 4. Гарантия
    section("4", "ГАРАНТИЯ");
    para(`4.1. На материалы — ${master.warrantyMaterials || 10} ${yearWord(master.warrantyMaterials || 10)}; на монтаж — ${master.warrantyInstall || 2} ${yearWord(master.warrantyInstall || 2)}.`);
    para("4.2. Гарантия не распространяется на повреждения от затопления, механических воздействий или нарушения условий эксплуатации.");

    // 5. Прочее
    section("5", "ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ");
    para(`5.1. ${isIp ? "Договор" : "Соглашение"} вступает в силу с момента подписания. Составлен в двух экземплярах.`);
    para("5.2. Все споры решаются путём переговоров, при недостижении согласия — в судебном порядке.");

    // Signatures
    if (doc.y > 680) doc.addPage();
    doc.moveDown(1);
    doc.font("Sans-Bold").fontSize(10).text("РЕКВИЗИТЫ И ПОДПИСИ СТОРОН", L, doc.y, { width: CW });
    doc.moveDown(0.6);

    const sigY = doc.y;
    const halfW = Math.floor((CW - 20) / 2);
    const colR = L + halfW + 20;

    doc.font("Sans-Bold").fontSize(9).text("Исполнитель:", L, sigY);
    doc.font("Sans").fontSize(9);
    let ey = sigY + 14;
    doc.text(masterName, L, ey, { width: halfW }); ey = doc.y + 2;
    if (isIp && master.bin) { doc.text(`БИН: ${master.bin}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    if (master.iin) { doc.text(`ИИН: ${master.iin}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    if (master.legalAddress) { doc.text(`Адрес: ${master.legalAddress}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    if (master.bankName) { doc.text(`Банк: ${master.bankName}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    if (master.iban) { doc.text(`IBAN: ${master.iban}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    if (masterPhone) { doc.text(`Тел: ${masterPhone}`, L, ey, { width: halfW }); ey = doc.y + 2; }
    doc.text("Подпись ________________", L, ey + 8, { width: halfW });

    doc.font("Sans-Bold").fontSize(9).text("Заказчик:", colR, sigY);
    doc.font("Sans").fontSize(9);
    let cy2 = sigY + 14;
    doc.text(`ФИО: ${clientName}`, colR, cy2, { width: halfW }); cy2 = doc.y + 2;
    doc.text(`Тел: ${clientPhone}`, colR, cy2, { width: halfW }); cy2 = doc.y + 2;
    doc.text(`Адрес: ${clientAddress}`, colR, cy2, { width: halfW }); cy2 = doc.y + 2;
    doc.text("ИИН: _______________", colR, cy2, { width: halfW }); cy2 = doc.y + 2;
    doc.text("Подпись ________________", colR, cy2 + 8, { width: halfW });

    doc.end();
    const buf = await promise;
    const fnLabel = (estimate.clientName || "client").replace(/[^a-zA-Z0-9а-яА-Я]/g, "_");
    const filename = `Dogovor-${fnLabel}-${estimate.publicId.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract PDF error:", error);
    return NextResponse.json({ error: "Ошибка генерации договора" }, { status: 500 });
  }
}
