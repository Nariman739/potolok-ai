import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";

function fmtPrice(n: number | undefined | null): string {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(val)) + " ₸";
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function loadFont(doc: jsPDF, filename: string, fontName: string, style: string) {
  const fontPath = path.join(process.cwd(), "public", "fonts", filename);
  const fontData = fs.readFileSync(fontPath, { encoding: "latin1" });
  doc.addFileToVFS(filename, fontData);
  doc.addFont(filename, fontName, style);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, masterId: master.id },
      include: { master: { select: { companyName: true, firstName: true, phone: true, whatsappPhone: true } } },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    const calc = (estimate.calculationData ?? {}) as unknown as CalculationResult;
    const company = estimate.master.companyName || estimate.master.firstName || "";
    const total = estimate.total || estimate.standardTotal || 0;
    const contactPhone = estimate.master.whatsappPhone || estimate.master.phone || "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomResults: RoomResult[] = calc?.roomResults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms
      ?? [];

    // Create PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 15;
    const marginR = 15;
    const contentW = pageW - marginL - marginR;

    // Load Cyrillic fonts
    loadFont(doc, "Roboto-Regular.ttf", "Roboto", "normal");
    loadFont(doc, "Roboto-Bold.ttf", "Roboto", "bold");
    doc.setFont("Roboto", "normal");

    let y = 20;

    // Header: company name + date
    doc.setFont("Roboto", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 95); // #1e3a5f
    doc.text(company, marginL, y);

    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.text("Коммерческое предложение", pageW - marginR, y - 4, { align: "right" });
    const dateStr = new Date(estimate.createdAt).toLocaleDateString("ru-RU");
    doc.text(dateStr, pageW - marginR, y + 1, { align: "right" });

    if (contactPhone) {
      doc.setFontSize(9);
      doc.text(contactPhone, marginL, y + 6);
      y += 6;
    }

    y += 10;

    // Client info
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55); // #1f2937
    if (estimate.clientName) {
      doc.setFont("Roboto", "bold");
      doc.text("Клиент: ", marginL, y);
      const klW = doc.getTextWidth("Клиент: ");
      doc.setFont("Roboto", "normal");
      doc.text(estimate.clientName, marginL + klW, y);
      y += 6;
    }
    if (estimate.clientPhone) {
      doc.setFont("Roboto", "bold");
      doc.text("Телефон: ", marginL, y);
      const phW = doc.getTextWidth("Телефон: ");
      doc.setFont("Roboto", "normal");
      doc.text(estimate.clientPhone, marginL + phW, y);
      y += 6;
    }
    if (estimate.clientAddress) {
      doc.setFont("Roboto", "bold");
      doc.text("Адрес: ", marginL, y);
      const adW = doc.getTextWidth("Адрес: ");
      doc.setFont("Roboto", "normal");
      doc.text(estimate.clientAddress, marginL + adW, y);
      y += 6;
    }

    // Separator
    y += 2;
    doc.setDrawColor(30, 58, 95);
    doc.setLineWidth(0.5);
    doc.line(marginL, y, pageW - marginR, y);
    y += 6;

    // Rooms
    for (const rr of roomResults) {
      // Check if we need a new page (at least 30mm for header + one row)
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      // Room header
      doc.setFont("Roboto", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 95);
      doc.text(`${rr.roomName ?? "Комната"} — ${(rr.area ?? 0).toFixed(1)} м²`, marginL, y);
      y += 2;

      // Room items table
      const items = rr.items ?? [];
      if (items.length > 0) {
        autoTable(doc, {
          startY: y,
          margin: { left: marginL, right: marginR },
          head: [["Наименование", "Кол-во", "Цена", "Сумма"]],
          body: items.map(item => [
            String(item.itemName ?? ""),
            `${item.quantity ?? 0} ${item.unit ?? ""}`,
            fmtPrice(item.unitPrice),
            fmtPrice(item.total),
          ]),
          styles: {
            font: "Roboto",
            fontSize: 9,
            cellPadding: 2,
          },
          headStyles: {
            font: "Roboto",
            fontStyle: "bold",
            fillColor: [243, 244, 246],
            textColor: [107, 114, 128],
            fontSize: 8,
          },
          columnStyles: {
            0: { cellWidth: contentW * 0.45 },
            1: { cellWidth: contentW * 0.15, halign: "center" },
            2: { cellWidth: contentW * 0.18, halign: "right" },
            3: { cellWidth: contentW * 0.22, halign: "right", fontStyle: "bold" },
          },
          theme: "plain",
          didDrawPage: () => { /* autoTable handles page breaks */ },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 2;
      }

      // Height multiplier note
      if (rr.heightMultiplied) {
        doc.setFont("Roboto", "normal");
        doc.setFontSize(8);
        doc.setTextColor(217, 119, 6); // #d97706
        doc.text("× 1.3 (высота > 3м)", marginL, y + 3);
        y += 5;
      }

      // Room subtotal
      doc.setFont("Roboto", "bold");
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      const subtotalText = `Итого ${rr.roomName ?? "Комната"}: ${fmtPrice(rr.subtotalAfterHeight ?? 0)}`;
      doc.text(subtotalText, pageW - marginR, y + 3, { align: "right" });
      y += 10;
    }

    // Bottom separator
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setDrawColor(30, 58, 95);
    doc.setLineWidth(0.5);
    doc.line(marginL, y, pageW - marginR, y);
    y += 8;

    // Min order note
    if (calc.minOrderApplied) {
      doc.setFont("Roboto", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text("* Применён минимальный заказ", pageW - marginR, y, { align: "right" });
      y += 5;
    }

    // Grand total
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 95);
    doc.text(`ИТОГО: ${fmtPrice(total)}`, pageW - marginR, y, { align: "right" });
    y += 6;

    // Price per m² info
    if ((calc.totalArea ?? 0) > 0) {
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `${fmtPrice(Math.round(total / calc.totalArea))}/м²  |  ${calc.totalArea.toFixed(1)} м²`,
        pageW - marginR, y, { align: "right" }
      );
      y += 6;
    }

    // Footer
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175); // #9ca3af
    const footerY = Math.max(y + 15, 275);
    doc.text("* Расчёт предварительный. Точная стоимость определяется после замера.", pageW / 2, footerY, { align: "center" });
    doc.text("Создано в PotolokAI", pageW / 2, footerY + 4, { align: "center" });

    // Output
    const pdfArrayBuffer = doc.output("arraybuffer");
    const filename = sanitizeFilename(`KP-${estimate.clientName || "estimate"}-${estimate.publicId.slice(0, 8)}`);

    return new NextResponse(Buffer.from(pdfArrayBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error("PDF generation error:", msg, error);
    return NextResponse.json({ error: "Ошибка генерации", details: msg }, { status: 500 });
  }
}
