import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CalculationResult, RoomResult } from "@/lib/types";

function fmtPrice(n: number | undefined | null): string {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(val)) + " ₸";
}

function escXml(s: unknown): string {
  const str = String(s ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, "_");
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

    // Support both new (roomResults) and old (variants) format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomResults: RoomResult[] = calc?.roomResults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms
      ?? [];

    // Build HTML for PDF-like download
    let roomsHtml = "";
    for (const rr of roomResults) {
      let itemsHtml = "";
      for (const item of (rr.items ?? [])) {
        itemsHtml += `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;">${escXml(item.itemName)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:center;">${item.quantity} ${escXml(item.unit)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${fmtPrice(item.unitPrice)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-weight:600;">${fmtPrice(item.total)}</td>
        </tr>`;
      }
      roomsHtml += `
        <h3 style="margin:16px 0 8px;font-size:14px;color:#1e3a5f;">${escXml(rr.roomName)} — ${(rr.area ?? 0).toFixed(1)} м²</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Наименование</th>
              <th style="padding:6px 8px;text-align:center;font-size:11px;color:#6b7280;">Кол-во</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">Цена</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">Сумма</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        ${rr.heightMultiplied ? '<p style="font-size:11px;color:#d97706;">× 1.3 (высота > 3м)</p>' : ""}
        <p style="text-align:right;font-size:13px;font-weight:600;margin-top:4px;">Итого ${escXml(rr.roomName)}: ${fmtPrice(rr.subtotalAfterHeight ?? 0)}</p>
      `;
    }

    const contactPhone = estimate.master.whatsappPhone || estimate.master.phone || "";

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 24px; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
    <div>
      <h1 style="margin:0;font-size:22px;color:#1e3a5f;">${escXml(company)}</h1>
      ${contactPhone ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${escXml(contactPhone)}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <p style="margin:0;font-size:11px;color:#6b7280;">Коммерческое предложение</p>
      <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">${new Date(estimate.createdAt).toLocaleDateString("ru-RU")}</p>
    </div>
  </div>

  ${estimate.clientName ? `<p style="font-size:13px;margin-bottom:4px;"><strong>Клиент:</strong> ${escXml(estimate.clientName)}</p>` : ""}
  ${estimate.clientPhone ? `<p style="font-size:13px;margin-bottom:4px;"><strong>Телефон:</strong> ${escXml(estimate.clientPhone)}</p>` : ""}
  ${estimate.clientAddress ? `<p style="font-size:13px;margin-bottom:4px;"><strong>Адрес:</strong> ${escXml(estimate.clientAddress)}</p>` : ""}

  <hr style="border:none;border-top:2px solid #1e3a5f;margin:16px 0;">

  ${roomsHtml}

  <hr style="border:none;border-top:2px solid #1e3a5f;margin:16px 0;">

  <div style="text-align:right;">
    ${calc.minOrderApplied ? '<p style="font-size:11px;color:#6b7280;margin-bottom:4px;">* Применён минимальный заказ</p>' : ""}
    <p style="font-size:20px;font-weight:bold;color:#1e3a5f;margin:0;">
      ИТОГО: ${fmtPrice(total)}
    </p>
    ${(calc.totalArea ?? 0) > 0 ? `<p style="font-size:12px;color:#6b7280;margin-top:4px;">${fmtPrice(Math.round(total / calc.totalArea))}/м² | ${calc.totalArea.toFixed(1)} м²</p>` : ""}
  </div>

  <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:32px;">
    * Расчёт предварительный. Точная стоимость определяется после замера.<br>
    Создано в PotolokAI
  </p>
</body>
</html>`;

    const filename = sanitizeFilename(`KP-${estimate.clientName || "estimate"}-${estimate.publicId.slice(0, 8)}`);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.html"`,
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
