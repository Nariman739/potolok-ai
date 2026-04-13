import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";
import PDFDocument from "pdfkit";
import { NOTO_SANS_REGULAR, NOTO_SANS_BOLD } from "@/lib/fonts";

// ── Colors ──
const C = {
  primary: "#0F172A",      // Dark navy
  primaryMid: "#1E293B",
  accent: "#F97316",       // Vibrant orange
  accentSoft: "#FFF7ED",
  gold: "#D97706",
  white: "#FFFFFF",
  text: "#0F172A",
  textLight: "#64748B",
  textMuted: "#94A3B8",
  bg: "#F8FAFC",
  bgWarm: "#FFFBEB",
  border: "#E2E8F0",
  success: "#059669",
  blue: "#2563EB",
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
    const company = estimate.master.companyName || estimate.master.firstName || "potolok.ai";
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
    const ML = 40;
    const MR = 40;
    const contentW = pageW - ML - MR;
    const RE = pageW - MR;

    doc.registerFont("Sans", NOTO_SANS_REGULAR);
    doc.registerFont("Sans-Bold", NOTO_SANS_BOLD);

    // ================================================================
    // PAGE 1: PREMIUM HEADER
    // ================================================================

    // Full-width dark header with gradient feel
    const headerH = 200;
    doc.rect(0, 0, pageW, headerH).fill(C.primary);

    // Subtle decorative accent bar
    doc.rect(0, headerH - 5, pageW, 5).fill(C.accent);

    // Geometric accent element (top-right corner decoration)
    doc.save().opacity(0.08);
    doc.rect(pageW - 200, 0, 200, 120).fill(C.white);
    doc.restore();

    doc.save().opacity(0.05);
    doc.rect(pageW - 150, 0, 150, 80).fill(C.white);
    doc.restore();

    // Company name — big and bold
    doc.font("Sans-Bold").fontSize(28).fillColor(C.white)
      .text(company, ML, 32, { width: contentW * 0.65 });

    // Subtitle
    doc.font("Sans").fontSize(11).fillColor(C.white).opacity(0.6)
      .text("КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", ML, 72);
    doc.opacity(1);

    // Date + ID
    const dateStr = new Date(estimate.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    doc.font("Sans").fontSize(9).fillColor(C.white).opacity(0.45)
      .text(`${dateStr}  ·  #${estimate.publicId.slice(0, 8).toUpperCase()}`, ML, 90);
    doc.opacity(1);

    // Contact phone — prominent right side
    if (contactPhone) {
      doc.font("Sans-Bold").fontSize(14).fillColor(C.white)
        .text(contactPhone, ML, 32, { width: contentW, align: "right" });
    }

    // Public link
    const publicUrl = `potolok.ai/kp/${estimate.publicId}`;
    doc.font("Sans").fontSize(8).fillColor(C.white).opacity(0.4)
      .text(publicUrl, ML, 52, { width: contentW, align: "right" });
    doc.opacity(1);

    // ── BIG TOTAL PRICE — hero element ──
    const totalBoxY = 115;
    const totalBoxW = contentW;
    const totalBoxH = 68;

    // Total background — warm accent
    doc.save();
    roundedRect(doc, ML, totalBoxY, totalBoxW, totalBoxH, 12);
    doc.fill(C.accent);
    doc.restore();

    // Inner subtle gradient
    doc.save().opacity(0.15);
    doc.rect(ML, totalBoxY, totalBoxW * 0.4, totalBoxH).fill(C.white);
    doc.restore();

    // Total label
    doc.font("Sans").fontSize(10).fillColor(C.white).opacity(0.85)
      .text("ИТОГО К ОПЛАТЕ", ML + 24, totalBoxY + 14);
    doc.opacity(1);

    // Total price — large
    doc.font("Sans-Bold").fontSize(30).fillColor(C.white)
      .text(fmtPrice(total), ML + 24, totalBoxY + 30, { width: totalBoxW - 48, align: "right" });

    // ── Summary stats row ──
    let y = headerH + 18;

    if (!isQuick) {
      const stats = [
        { label: "Площадь", value: `${(calc.totalArea ?? 0).toFixed(1)} м²`, icon: "◻" },
        { label: "Комнат", value: `${roomResults.length}`, icon: "⌂" },
        { label: "Цена за м²", value: fmtPrice(calc.pricePerM2 ?? 0), icon: "₸" },
        { label: "Светильников", value: `${calc.totalSpots ?? 0}`, icon: "●" },
      ];

      const statW = contentW / stats.length;
      for (let i = 0; i < stats.length; i++) {
        const sx = ML + i * statW;
        doc.font("Sans-Bold").fontSize(16).fillColor(C.text)
          .text(stats[i].value, sx, y, { width: statW, align: "center" });
        doc.font("Sans").fontSize(8).fillColor(C.textMuted)
          .text(stats[i].label.toUpperCase(), sx, y + 20, { width: statW, align: "center" });
      }
      y += 46;
    } else {
      y += 8;
    }

    // ── Client section ──
    if (estimate.clientName || estimate.clientPhone) {
      doc.save();
      roundedRect(doc, ML, y, contentW, 44, 8);
      doc.fillAndStroke(C.bg, C.border);
      doc.restore();

      // Orange left accent
      doc.rect(ML, y + 8, 3, 28).fill(C.accent);

      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text("КЛИЕНТ", ML + 16, y + 10);

      const clientParts = [estimate.clientName, estimate.clientPhone, estimate.clientAddress].filter(Boolean);
      doc.font("Sans-Bold").fontSize(12).fillColor(C.text)
        .text(clientParts[0] || "", ML + 16, y + 24);
      if (clientParts.length > 1) {
        doc.font("Sans").fontSize(9).fillColor(C.textLight)
        doc.font("Sans-Bold").fontSize(12);
      const nameW = doc.widthOfString(clientParts[0] || "");
      doc.font("Sans").fontSize(9).fillColor(C.textLight)
        .text(clientParts.slice(1).join("  ·  "), ML + 16 + nameW + 10, y + 26);
      }
      y += 54;
    }

    // Discount badge
    if (discount > 0) {
      doc.save();
      roundedRect(doc, ML, y, contentW, 30, 6);
      doc.fill(C.bgWarm);
      doc.restore();

      doc.font("Sans-Bold").fontSize(10).fillColor(C.gold)
        .text(`🏷 СКИДКА ${discount}%`, ML + 14, y + 9, { continued: true });
      doc.font("Sans").fillColor(C.textLight)
        .text(`  ${fmtPrice(subtotal)} → ${fmtPrice(total)}`);
      y += 40;
    }

    y += 6;

    // ================================================================
    // ROOMS SECTION — clean, professional tables
    // ================================================================

    const colX = [ML, ML + 265, ML + 340, ML + 418];
    const colW2 = [255, 65, 70, RE - (ML + 418)];

    for (let ri = 0; ri < roomResults.length; ri++) {
      const rr = roomResults[ri];

      if (y > 680) { doc.addPage(); y = 40; }

      // Room header — clean with accent left bar
      doc.save();
      roundedRect(doc, ML, y, contentW, 28, 6);
      doc.fill(C.bg);
      doc.restore();
      doc.rect(ML, y + 4, 4, 20).fill(C.accent);

      doc.font("Sans-Bold").fontSize(13).fillColor(C.primary)
        .text(`${ri + 1}. ${rr.roomName ?? "Комната"}`, ML + 16, y + 7, { continued: (rr.area ?? 0) > 0 });
      if ((rr.area ?? 0) > 0) {
        doc.font("Sans").fontSize(10).fillColor(C.textLight)
          .text(` · ${rr.area.toFixed(1)} м²`);
      }
      y += 36;

      // Table header
      doc.save();
      roundedRect(doc, ML, y, contentW, 22, 4);
      doc.fill(C.primaryMid);
      doc.restore();

      doc.font("Sans-Bold").fontSize(8).fillColor(C.white);
      doc.text("Наименование", colX[0] + 12, y + 7, { width: colW2[0] });
      doc.text("Кол-во", colX[1], y + 7, { width: colW2[1], align: "center" });
      doc.text("Цена", colX[2], y + 7, { width: colW2[2], align: "right" });
      doc.text("Сумма", colX[3], y + 7, { width: colW2[3], align: "right" });
      y += 26;

      // Table rows
      const items = rr.items ?? [];
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[ii];
        if (y > 760) { doc.addPage(); y = 40; }

        // Alternating backgrounds
        if (ii % 2 === 0) {
          doc.rect(ML, y - 2, contentW, 18).fill("#F1F5F9");
        }

        doc.font("Sans").fontSize(9).fillColor(C.text);
        doc.text(String(item.itemName ?? ""), colX[0] + 12, y + 1, { width: colW2[0] });
        const textH = doc.y - (y + 1);

        doc.fillColor(C.textLight);
        doc.text(`${item.quantity ?? 0} ${item.unit ?? ""}`, colX[1], y + 1, { width: colW2[1], align: "center" });
        doc.text(fmtPrice(item.unitPrice), colX[2], y + 1, { width: colW2[2], align: "right" });

        doc.font("Sans-Bold").fillColor(C.text);
        doc.text(fmtPrice(item.total), colX[3], y + 1, { width: colW2[3], align: "right" });

        y += Math.max(textH, 14) + 4;
      }

      // Height multiplier note
      if (rr.heightMultiplied) {
        doc.font("Sans").fontSize(8).fillColor(C.gold)
          .text("* Коэффициент высоты (>3м): ×1.3", ML + 12, y + 2);
        y += 14;
      }

      // Room subtotal
      y += 4;
      doc.save();
      roundedRect(doc, RE - 180, y, 180, 26, 6);
      doc.fill(C.bg);
      doc.restore();

      doc.font("Sans-Bold").fontSize(12).fillColor(C.primary)
        .text(fmtPrice(rr.subtotalAfterHeight ?? 0), RE - 176, y + 7, { width: 172, align: "right" });
      y += 38;
    }

    // ================================================================
    // GRAND TOTAL SECTION — premium feel
    // ================================================================

    if (y > 690) { doc.addPage(); y = 40; }

    // Thin separator
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor(C.border).lineWidth(1).stroke();
    y += 12;

    // Min order note
    if (calc.minOrderApplied) {
      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text("* Применён минимальный заказ", ML, y, { width: contentW, align: "right" });
      y += 14;
    }

    // Grand total card — premium dark box
    const gtH = 64;
    doc.save();
    roundedRect(doc, ML, y, contentW, gtH, 12);
    doc.fill(C.primary);
    doc.restore();

    // Accent stripe at bottom of total
    doc.save();
    roundedRect(doc, ML, y + gtH - 5, contentW, 5, 0);
    doc.fill(C.accent);
    doc.restore();

    doc.font("Sans").fontSize(10).fillColor(C.white).opacity(0.65)
      .text("ИТОГО К ОПЛАТЕ", ML + 24, y + 14);
    doc.opacity(1);

    doc.font("Sans-Bold").fontSize(26).fillColor(C.white)
      .text(fmtPrice(total), ML + 24, y + 28, { width: contentW - 48, align: "right" });

    y += gtH + 16;

    // Stats summary
    if (!isQuick && (calc.totalArea ?? 0) > 0) {
      const statsText = [
        `${(calc.totalArea ?? 0).toFixed(1)} м²`,
        `${fmtPrice(calc.pricePerM2 ?? 0)}/м²`,
        `${calc.totalSpots ?? 0} светильн.`,
        `${roomResults.length} помещ.`,
      ].join("   ·   ");

      doc.font("Sans").fontSize(8).fillColor(C.textMuted)
        .text(statsText, ML, y, { width: contentW, align: "center" });
      y += 20;
    }

    // ================================================================
    // BENEFITS SECTION — selling points
    // ================================================================

    if (y < 680) {
      y += 16;

      const benefits = [
        { icon: "✓", text: "Гарантия на работу — 10 лет" },
        { icon: "✓", text: "Бесплатный замер на объекте" },
        { icon: "✓", text: "Монтаж за 1 день" },
      ];

      doc.save();
      roundedRect(doc, ML, y, contentW, 22 * benefits.length + 16, 8);
      doc.fill(C.accentSoft);
      doc.restore();

      for (let i = 0; i < benefits.length; i++) {
        const by = y + 10 + i * 22;
        doc.font("Sans-Bold").fontSize(10).fillColor(C.success)
          .text(benefits[i].icon, ML + 16, by);
        doc.font("Sans").fontSize(10).fillColor(C.text)
          .text(benefits[i].text, ML + 32, by);
      }

      y += 22 * benefits.length + 26;
    }

    // ================================================================
    // FOOTER — clean and professional
    // ================================================================

    const footerY = Math.max(y + 20, pageH - 70);

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
    doc.font("Sans-Bold").fontSize(9).fillColor(C.accent)
      .text("potolok.ai", ML, footerY + 30, { width: contentW, align: "center" });

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
    console.error("PDF generation error:", msg);
    return NextResponse.json({ error: "Ошибка генерации" }, { status: 500 });
  }
}
