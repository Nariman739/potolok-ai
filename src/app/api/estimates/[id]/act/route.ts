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
    if (estimate.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Акт доступен только для подтверждённых КП" }, { status: 400 });
    }

    const calc = estimate.calculationData as unknown as CalculationResult;
    const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
    const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
    const city = master.contractCity || "_______________";
    const total = estimate.total || estimate.standardTotal || 0;
    const masterName = master.legalName || master.companyName || `${master.firstName} ${master.lastName || ""}`.trim();
    const masterPhone = master.whatsappPhone || master.phone || "";
    const clientName = estimate.clientName || "___________________________";
    const clientPhone = estimate.clientPhone || "_______________";
    const roomResults = getRoomResults(calc);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const promise = collectPdf(doc);
    const W = 595.28;
    const L = 50, R = 50, CW = W - L - R;

    doc.registerFont("Sans", NOTO_SANS_REGULAR);
    doc.registerFont("Sans-Bold", NOTO_SANS_BOLD);

    // Title
    doc.font("Sans-Bold").fontSize(14).fillColor("#000")
      .text("АКТ ВЫПОЛНЕННЫХ РАБОТ", L, 50, { width: CW, align: "center" });
    doc.font("Sans").fontSize(11)
      .text(`к ${master.contractType === "ip" ? "Договору" : "Соглашению"} № ${contractNum}`, L, doc.y + 4, { width: CW, align: "center" })
      .text(`${today}, ${city}`, L, doc.y + 2, { width: CW, align: "center" });
    doc.moveDown(0.8);

    // Parties
    doc.font("Sans").fontSize(10)
      .text(`Исполнитель: `, L, doc.y, { continued: true })
      .font("Sans-Bold").text(masterName)
      .font("Sans").text(`Заказчик: `, L, doc.y + 2, { continued: true })
      .font("Sans-Bold").text(clientName);
    doc.moveDown(0.6);

    doc.font("Sans").fontSize(10)
      .text("Исполнитель выполнил, а Заказчик принял следующие работы:", L, doc.y, { width: CW });
    doc.moveDown(0.4);

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

    // Total
    doc.font("Sans-Bold").fontSize(11).fillColor("#000")
      .text(`ИТОГО: ${fmtPrice(total)}`, L, doc.y, { width: CW, align: "right" });
    doc.moveDown(0.6);

    doc.font("Sans").fontSize(10)
      .text(`Вышеперечисленные работы выполнены в полном объёме и в установленные сроки. Заказчик претензий по объёму, качеству и срокам не имеет. Общая стоимость: ${fmtPrice(total)} (${numberToWords(total)}).`, L, doc.y, { width: CW });
    doc.moveDown(1);

    // Signatures
    if (doc.y > 680) doc.addPage();
    const sigY = doc.y;
    const halfW = Math.floor((CW - 20) / 2);
    const colR = L + halfW + 20;

    doc.font("Sans-Bold").fontSize(9).text("Исполнитель:", L, sigY);
    doc.font("Sans").fontSize(9);
    doc.text(masterName, L, sigY + 14, { width: halfW });
    if (masterPhone) doc.text(`Тел: ${masterPhone}`, L, doc.y + 2, { width: halfW });
    doc.moveDown(0.5);
    doc.text("Подпись ________________", L, doc.y + 8, { width: halfW });
    doc.text(`Дата: ${today}`, L, doc.y + 4, { width: halfW });

    doc.font("Sans-Bold").fontSize(9).text("Заказчик:", colR, sigY);
    doc.font("Sans").fontSize(9);
    doc.text(clientName, colR, sigY + 14, { width: halfW });
    doc.text(`Тел: ${clientPhone}`, colR, sigY + 28, { width: halfW });
    doc.text("Подпись ________________", colR, sigY + 60, { width: halfW });
    doc.text("Дата: _______________", colR, sigY + 76, { width: halfW });

    doc.end();
    const buf = await promise;
    const fnLabel = (estimate.clientName || "client").replace(/[^a-zA-Z0-9а-яА-Я]/g, "_");
    const filename = `Akt-${fnLabel}-${estimate.publicId.slice(0, 8)}.pdf`;

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
    console.error("Act PDF error:", error);
    return NextResponse.json({ error: "Ошибка генерации акта" }, { status: 500 });
  }
}
