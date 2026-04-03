import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult, LineItem } from "@/lib/types";
import PDFDocument from "pdfkit";
import { NOTO_SANS_REGULAR, NOTO_SANS_BOLD } from "@/lib/fonts";
import { DEFAULT_PRICES } from "@/lib/constants";

// ── Install price code mapping ──
// Maps client item codes to install item codes
const INSTALL_MAP: Record<string, string> = {
  canvas_320: "install_canvas",
  canvas_550: "install_canvas",
  canvas_over: "install_canvas",
  profile_plastic: "install_profile",
  insert: "install_profile",
  profile_shadow: "install_profile",
  profile_floating: "install_profile",
  spot_client: "install_spot",
  spot_ours: "install_spot",
  spot_double: "install_spot",
  chandelier: "install_chandelier",
  chandelier_install: "install_chandelier",
  track_magnetic: "install_track",
  light_line: "install_lightline",
  curtain_ldsp: "install_curtain",
  curtain_aluminum: "install_curtain",
  gardina_plastic: "install_gardina",
  gardina_aluminum: "install_gardina",
  corner_plastic: "install_corner",
  corner_aluminum: "install_corner",
  pipe_bypass: "install_pipe",
};

const C = {
  primary: "#374151",
  accent: "#2563eb",
  white: "#ffffff",
  text: "#1f2937",
  textLight: "#6b7280",
  textMuted: "#9ca3af",
  bg: "#f8fafc",
  bgRow: "#f1f5f9",
};

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " \u20B8";
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
    .lineTo(x + w - r, y).quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r).quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h).quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y);
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
      include: { master: { select: { companyName: true, firstName: true, phone: true } } },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Расчёт не найден" }, { status: 404 });
    }

    // Load master's install prices (overrides)
    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: master.id, itemCode: { startsWith: "install_" } },
    });
    const priceOverrides: Record<string, number> = {};
    for (const mp of masterPrices) priceOverrides[mp.itemCode] = mp.price;

    function getInstallPrice(code: string): number {
      return priceOverrides[code] ?? DEFAULT_PRICES[code] ?? 0;
    }

    const calc = (estimate.calculationData ?? {}) as unknown as CalculationResult;
    const company = estimate.master.companyName || estimate.master.firstName || "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomResults: RoomResult[] = calc?.roomResults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms
      ?? [];

    // ── Build installer line items per room ──
    interface InstallItem {
      name: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }

    let grandTotal = 0;

    const installRooms = roomResults.map(rr => {
      const installItems: InstallItem[] = [];
      const seen = new Set<string>();

      for (const item of (rr.items ?? []) as LineItem[]) {
        const installCode = INSTALL_MAP[item.itemCode];
        if (!installCode || seen.has(installCode)) continue;
        seen.add(installCode);

        const price = getInstallPrice(installCode);
        if (price <= 0) continue;

        // Use same quantity as client item
        const total = item.quantity * price;
        installItems.push({
          name: item.itemName + " (монтаж)",
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: price,
          total,
        });
      }

      const roomTotal = installItems.reduce((s, i) => s + i.total, 0);
      grandTotal += roomTotal;

      return { name: rr.roomName ?? "Комната", area: rr.area ?? 0, items: installItems, total: roomTotal };
    });

    // ── Generate PDF ──
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const promise = collectPdf(doc);
    const pageW = 595.28;
    const ML = 40;
    const MR = 40;
    const contentW = pageW - ML - MR;
    const RE = pageW - MR;

    doc.registerFont("Sans", NOTO_SANS_REGULAR);
    doc.registerFont("Sans-Bold", NOTO_SANS_BOLD);

    // ── Header ──
    const headerH = 100;
    doc.rect(0, 0, pageW, headerH).fill(C.primary);
    doc.rect(0, headerH - 3, pageW, 3).fill(C.accent);

    doc.font("Sans-Bold").fontSize(20).fillColor(C.white)
      .text(company, ML, 25, { width: contentW });

    doc.font("Sans").fontSize(12).fillColor(C.white).opacity(0.9)
      .text("НАРЯД-ЗАДАНИЕ НА МОНТАЖ", ML, 55);
    doc.opacity(1);

    const dateStr = new Date(estimate.createdAt).toLocaleDateString("ru-RU");
    doc.font("Sans").fontSize(9).fillColor(C.white).opacity(0.7)
      .text(dateStr, ML, 75);
    doc.opacity(1);

    // ── Client/Address info ──
    let y = headerH + 16;

    if (estimate.clientName || estimate.clientAddress) {
      doc.save();
      roundedRect(doc, ML, y, contentW, 40, 6);
      doc.fill(C.bg);
      doc.restore();

      if (estimate.clientAddress) {
        doc.font("Sans").fontSize(8).fillColor(C.textMuted).text("АДРЕС", ML + 12, y + 6);
        doc.font("Sans-Bold").fontSize(10).fillColor(C.text).text(estimate.clientAddress, ML + 12, y + 18);
      } else if (estimate.clientName) {
        doc.font("Sans").fontSize(8).fillColor(C.textMuted).text("КЛИЕНТ", ML + 12, y + 6);
        doc.font("Sans-Bold").fontSize(10).fillColor(C.text).text(estimate.clientName, ML + 12, y + 18);
      }
      y += 52;
    }

    // ── Summary pills ──
    doc.font("Sans").fontSize(9).fillColor(C.textLight)
      .text(`Помещений: ${roomResults.length}  •  Площадь: ${(calc.totalArea ?? 0).toFixed(1)} м²  •  Светильников: ${calc.totalSpots ?? 0}`, ML, y, { width: contentW, align: "center" });
    y += 22;

    // ── Rooms ──
    const colX = [ML, ML + 240, ML + 320, ML + 400];
    const colW2 = [230, 70, 70, RE - (ML + 400)];

    for (const room of installRooms) {
      if (y > 680) { doc.addPage(); y = 40; }

      // Room header
      doc.rect(ML, y, 4, 20).fill(C.accent);
      doc.font("Sans-Bold").fontSize(12).fillColor(C.primary)
        .text(`${room.name} — ${room.area.toFixed(1)} м²`, ML + 12, y + 3);
      y += 28;

      // Table header
      doc.save();
      roundedRect(doc, ML, y, contentW, 18, 3);
      doc.fill(C.primary);
      doc.restore();

      doc.font("Sans-Bold").fontSize(8).fillColor(C.white);
      doc.text("Работа", colX[0] + 8, y + 5, { width: colW2[0] });
      doc.text("Кол-во", colX[1], y + 5, { width: colW2[1], align: "center" });
      doc.text("Цена", colX[2], y + 5, { width: colW2[2], align: "right" });
      doc.text("Сумма", colX[3], y + 5, { width: colW2[3], align: "right" });
      y += 22;

      for (let ii = 0; ii < room.items.length; ii++) {
        const item = room.items[ii];
        if (y > 760) { doc.addPage(); y = 40; }

        if (ii % 2 === 0) doc.rect(ML, y - 1, contentW, 15).fill(C.bgRow);

        doc.font("Sans").fontSize(9).fillColor(C.text)
          .text(item.name, colX[0] + 8, y, { width: colW2[0] });
        doc.fillColor(C.textLight)
          .text(`${item.quantity} ${item.unit}`, colX[1], y, { width: colW2[1], align: "center" })
          .text(fmtPrice(item.unitPrice), colX[2], y, { width: colW2[2], align: "right" });
        doc.font("Sans-Bold").fillColor(C.text)
          .text(fmtPrice(item.total), colX[3], y, { width: colW2[3], align: "right" });
        y += 16;
      }

      if (room.items.length === 0) {
        doc.font("Sans").fontSize(9).fillColor(C.textMuted)
          .text("Нет монтажных работ", ML + 8, y);
        y += 16;
      }

      // Room total
      doc.font("Sans-Bold").fontSize(10).fillColor(C.primary)
        .text(`Итого: ${fmtPrice(room.total)}`, ML, y, { width: contentW, align: "right" });
      y += 24;
    }

    // ── Grand Total ──
    if (y > 700) { doc.addPage(); y = 40; }
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor(C.primary).lineWidth(2).stroke();
    y += 14;

    doc.save();
    roundedRect(doc, ML, y, contentW, 44, 8);
    doc.fill(C.primary);
    doc.restore();

    doc.font("Sans").fontSize(10).fillColor(C.white).opacity(0.8)
      .text("ИТОГО ЗА МОНТАЖ", ML + 16, y + 8);
    doc.opacity(1);
    doc.font("Sans-Bold").fontSize(20).fillColor(C.white)
      .text(fmtPrice(grandTotal), ML + 16, y + 22, { width: contentW - 32, align: "right" });
    y += 60;

    // ── Footer ──
    doc.font("Sans").fontSize(7).fillColor(C.textMuted)
      .text("Документ сформирован автоматически  •  potolok.ai", ML, Math.max(y + 20, 800), { width: contentW, align: "center" });

    doc.end();
    const pdfBuffer = await promise;
    const filename = sanitizeFilename(`Montazh-${estimate.clientName || "order"}-${estimate.publicId.slice(0, 8)}`);

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
    console.error("Installer PDF error:", msg);
    return NextResponse.json({ error: "Ошибка генерации" }, { status: 500 });
  }
}
