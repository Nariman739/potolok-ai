import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";
import PDFDocument from "pdfkit";
import { NOTO_SANS_REGULAR, NOTO_SANS_BOLD } from "@/lib/fonts";

// ── Colors ──
const C = {
  primary: "#1e3a5f",
  primaryLight: "#2d5a8e",
  accent: "#F97316",
  white: "#ffffff",
  text: "#1f2937",
  textLight: "#6b7280",
  textMuted: "#9ca3af",
  bg: "#f8fafc",
  bgRow: "#f1f5f9",
  border: "#e2e8f0",
  success: "#10b981",
  warning: "#d97706",
};

function fmtPrice(n: number | undefined | null): string {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(val)) + " \u20B8";
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Draw rounded rectangle (pdfkit doesn't have built-in) */
function roundedRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number) {
  doc.moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y);
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

    const calc = (estimate.calculationData ?? {}) as unknown as CalculationResult & { quickEstimate?: boolean };
    const company = estimate.master.companyName || estimate.master.firstName || "";
    const total = estimate.total || estimate.standardTotal || 0;
    const contactPhone = estimate.master.whatsappPhone || estimate.master.phone || "";
    const discount = estimate.discountPercent || 0;
    const subtotal = calc?.subtotal || total;
    const isQuick = !!(calc as { quickEstimate?: boolean }).quickEstimate;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomResults: RoomResult[] = calc?.roomResults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms
      ?? [];

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const promise = collectPdf(doc);
    const pageW = 595.28;
    const pageH = 841.89;
    const ML = 40; // margin left
    const MR = 40;
    const contentW = pageW - ML - MR;
    const RE = pageW - MR; // right edge

    doc.registerFont("Sans", NOTO_SANS_REGULAR);
    doc.registerFont("Sans-Bold", NOTO_SANS_BOLD);

    // ================================================================
    // PAGE 1: HERO HEADER
    // ================================================================

    // Dark blue header background
    const headerH = 160;
    doc.rect(0, 0, pageW, headerH).fill(C.primary);

    // Accent stripe at bottom of header
    doc.rect(0, headerH - 4, pageW, 4).fill(C.accent);

    // Company name
    doc.font("Sans-Bold").fontSize(24).fillColor(C.white)
      .text(company, ML, 35, { width: contentW });

    // "Коммерческое предложение" badge
    doc.font("Sans").fontSize(11).fillColor(C.white).opacity(0.85)
      .text("КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", ML, 70, { width: contentW });
    doc.opacity(1);

    // Date + КП number
    const dateStr = new Date(estimate.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    doc.font("Sans").fontSize(9).fillColor(C.white).opacity(0.7)
      .text(`${dateStr}  •  КП #${estimate.publicId.slice(0, 8).toUpperCase()}`, ML, 90);
    doc.opacity(1);

    // Contact phone (right side)
    if (contactPhone) {
      doc.font("Sans").fontSize(10).fillColor(C.white).opacity(0.9)
        .text(contactPhone, ML, 35, { width: contentW, align: "right" });
      doc.opacity(1);
    }

    // Public link (right side)
    const publicUrl = `potolok.ai/kp/${estimate.publicId}`;
    doc.font("Sans").fontSize(8).fillColor(C.white).opacity(0.6)
      .text(publicUrl, ML, 48, { width: contentW, align: "right" });
    doc.opacity(1);

    // ── Summary cards row ──
    const cardY = headerH - 50;
    const cardH = 70;
    const cardGap = 12;
    const cardCount = 4;
    const cardW = (contentW - cardGap * (cardCount - 1)) / cardCount;

    const summaryCards = isQuick
      ? [
          { label: "Позиций", value: `${roomResults[0]?.items?.length ?? 0}`, color: C.primary },
          { label: "ИТОГО", value: fmtPrice(total), color: C.accent },
        ]
      : [
          { label: "Площадь", value: `${(calc.totalArea ?? 0).toFixed(1)} м²`, color: C.primary },
          { label: "Комнат", value: `${roomResults.length}`, color: C.primary },
          { label: "Цена/м²", value: fmtPrice(calc.pricePerM2 ?? 0), color: C.primary },
          { label: "ИТОГО", value: fmtPrice(total), color: C.accent },
        ];

    for (let i = 0; i < summaryCards.length; i++) {
      const cx = ML + i * (cardW + cardGap);
      const card = summaryCards[i];

      // Card shadow
      doc.save();
      roundedRect(doc, cx + 1, cardY + 2, cardW, cardH, 8);
      doc.fill("#00000010");
      doc.restore();

      // Card background
      doc.save();
      roundedRect(doc, cx, cardY, cardW, cardH, 8);
      doc.fill(C.white);
      doc.restore();

      // Card border accent (top line)
      doc.save();
      doc.rect(cx + 8, cardY, cardW - 16, 3)
        .fill(i === summaryCards.length - 1 ? C.accent : C.primaryLight);
      doc.restore();

      // Card value
      doc.font("Sans-Bold").fontSize(i === 3 ? 14 : 16).fillColor(card.color)
        .text(card.value, cx, cardY + 18, { width: cardW, align: "center" });

      // Card label
      doc.font("Sans").fontSize(8).fillColor(C.textLight)
        .text(card.label, cx, cardY + 42, { width: cardW, align: "center" });
    }

    // ── Client info section ──
    let y = headerH + cardH / 2 + 20;

    if (estimate.clientName || estimate.clientPhone || estimate.clientAddress) {
      // Client info card
      doc.save();
      roundedRect(doc, ML, y, contentW, 50, 8);
      doc.fill(C.bg);
      doc.restore();

      // Left: label
      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text("КЛИЕНТ", ML + 14, y + 8);

      // Client details
      const clientParts = [estimate.clientName, estimate.clientPhone, estimate.clientAddress].filter(Boolean);
      doc.font("Sans-Bold").fontSize(11).fillColor(C.text)
        .text(clientParts[0] || "", ML + 14, y + 22);
      if (clientParts.length > 1) {
        doc.font("Sans").fontSize(9).fillColor(C.textLight)
          .text(clientParts.slice(1).join("  •  "), ML + 14 + doc.widthOfString(clientParts[0] || "") + 12, y + 24);
      }

      y += 62;
    }

    // Discount badge (if applicable)
    if (discount > 0) {
      doc.save();
      roundedRect(doc, ML, y, contentW, 32, 6);
      doc.fill("#fef3c7");
      doc.restore();

      doc.font("Sans-Bold").fontSize(10).fillColor(C.warning)
        .text(`СКИДКА ${discount}%`, ML + 14, y + 10, { continued: true });
      doc.font("Sans").fillColor(C.textLight)
        .text(`  — ${fmtPrice(subtotal)} → ${fmtPrice(total)}`);
      y += 42;
    }

    y += 8;

    // ================================================================
    // ROOMS SECTION
    // ================================================================

    const colX = [ML, ML + 260, ML + 340, ML + 420];
    const colW2 = [250, 70, 70, RE - (ML + 420)];

    for (let ri = 0; ri < roomResults.length; ri++) {
      const rr = roomResults[ri];

      // Page break check
      if (y > 680) {
        doc.addPage();
        y = 40;
      }

      // Room header with colored left border
      doc.save();
      doc.rect(ML, y, 4, 22).fill(C.accent);
      doc.restore();

      doc.font("Sans-Bold").fontSize(13).fillColor(C.primary)
        .text(rr.roomName ?? "Комната", ML + 12, y + 3, { continued: (rr.area ?? 0) > 0 });
      if ((rr.area ?? 0) > 0) {
        doc.font("Sans").fontSize(11).fillColor(C.textLight)
          .text(`  ${rr.area.toFixed(1)} м²`);
      }
      y += 30;

      // Table header
      doc.save();
      roundedRect(doc, ML, y, contentW, 20, 4);
      doc.fill(C.primary);
      doc.restore();

      doc.font("Sans-Bold").fontSize(8).fillColor(C.white);
      doc.text("Наименование", colX[0] + 10, y + 6, { width: colW2[0] });
      doc.text("Кол-во", colX[1], y + 6, { width: colW2[1], align: "center" });
      doc.text("Цена", colX[2], y + 6, { width: colW2[2], align: "right" });
      doc.text("Сумма", colX[3], y + 6, { width: colW2[3], align: "right" });
      y += 24;

      // Table rows
      const items = rr.items ?? [];
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[ii];
        if (y > 760) {
          doc.addPage();
          y = 40;
        }

        // Alternating row background
        if (ii % 2 === 0) {
          doc.rect(ML, y - 2, contentW, 16).fill(C.bgRow);
        }

        doc.font("Sans").fontSize(9).fillColor(C.text);
        doc.text(String(item.itemName ?? ""), colX[0] + 10, y, { width: colW2[0] });
        const textH = doc.y - y;
        doc.fillColor(C.textLight);
        doc.text(`${item.quantity ?? 0} ${item.unit ?? ""}`, colX[1], y, { width: colW2[1], align: "center" });
        doc.text(fmtPrice(item.unitPrice), colX[2], y, { width: colW2[2], align: "right" });
        doc.font("Sans-Bold").fillColor(C.text);
        doc.text(fmtPrice(item.total), colX[3], y, { width: colW2[3], align: "right" });

        y += Math.max(textH, 14) + 2;
      }

      // Height multiplier note
      if (rr.heightMultiplied) {
        doc.font("Sans").fontSize(8).fillColor(C.warning)
          .text("* Коэффициент высоты (>3м): ×1.3", ML + 10, y + 2);
        y += 14;
      }

      // Room subtotal bar
      doc.save();
      roundedRect(doc, RE - 200, y, 200, 24, 4);
      doc.fill(C.bg);
      doc.restore();

      doc.font("Sans-Bold").fontSize(11).fillColor(C.primary)
        .text(fmtPrice(rr.subtotalAfterHeight ?? 0), RE - 196, y + 6, { width: 192, align: "right" });
      y += 36;
    }

    // ================================================================
    // GRAND TOTAL SECTION
    // ================================================================

    if (y > 700) { doc.addPage(); y = 40; }

    // Separator line
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor(C.primary).lineWidth(2).stroke();
    y += 16;

    // Min order note
    if (calc.minOrderApplied) {
      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text("* Применён минимальный заказ", ML, y, { width: contentW, align: "right" });
      y += 14;
    }

    // Grand total card
    doc.save();
    roundedRect(doc, ML, y, contentW, 56, 10);
    doc.fill(C.primary);
    doc.restore();

    // Accent stripe inside total card
    doc.rect(ML, y + 52, contentW, 4).fill(C.accent);

    doc.font("Sans").fontSize(10).fillColor(C.white).opacity(0.8)
      .text("ИТОГО К ОПЛАТЕ", ML + 20, y + 10);
    doc.opacity(1);

    doc.font("Sans-Bold").fontSize(22).fillColor(C.white)
      .text(fmtPrice(total), ML + 20, y + 26, { width: contentW - 40, align: "right" });

    y += 72;

    // Stats row below total
    if (!isQuick && (calc.totalArea ?? 0) > 0) {
      const statsText = [
        `${(calc.totalArea ?? 0).toFixed(1)} м²`,
        `${fmtPrice(calc.pricePerM2 ?? 0)}/м²`,
        `${calc.totalSpots ?? 0} светильников`,
        `${roomResults.length} помещений`,
      ].join("  •  ");

      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text(statsText, ML, y, { width: contentW, align: "center" });
      y += 20;
    }

    // ================================================================
    // FOOTER
    // ================================================================

    const footerY = Math.max(y + 30, pageH - 80);

    // Validity note
    if (estimate.validUntil) {
      const validStr = new Date(estimate.validUntil).toLocaleDateString("ru-RU");
      doc.font("Sans").fontSize(8).fillColor(C.textLight)
        .text(`Предложение действительно до ${validStr}`, ML, footerY, { width: contentW, align: "center" });
    }

    // Disclaimer
    doc.font("Sans").fontSize(7).fillColor(C.textMuted)
      .text("Расчёт предварительный. Точная стоимость определяется после замера на объекте.", ML, footerY + 14, { width: contentW, align: "center" });

    // Branding
    doc.font("Sans-Bold").fontSize(8).fillColor(C.textMuted)
      .text("potolok.ai", ML, footerY + 28, { width: contentW, align: "center" });

    doc.end();
    const pdfBuffer = await promise;

    const filename = sanitizeFilename(`KP-${estimate.clientName || "estimate"}-${estimate.publicId.slice(0, 8)}`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
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
