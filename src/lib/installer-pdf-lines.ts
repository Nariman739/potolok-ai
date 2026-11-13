// «КП монтажнику» (сайт, /api/estimates/[id]/installer-pdf) — строки из того же
// источника, что наряд (13.11.2026). Раньше PDF пересчитывал КП по-своему: не видел
// installerItems мобилки (свои софиты, пары, гардину с подсветкой, правки ставок) и
// допы — у 417 из 568 КП из приложения сумма расходилась с нарядом.
import type { CalculationResult } from "@/lib/types";
import {
  autoWorkOrderLines,
  parseWorkOrderDoc,
  percentLabel,
  PCT_KEY,
  type WorkOrderLine,
} from "@/lib/work-order-lines";

export type InstallerPdfItem = { name: string; quantity: number; unit: string; unitPrice: number; total: number; flat?: boolean };
export type InstallerPdfRoom = { name: string; area: number | null; items: InstallerPdfItem[]; total: number };
export type InstallerPdfModel = { rooms: InstallerPdfRoom[]; total: number; spots: number; source: "work-order" | "auto" };

export const EXTRA_ROOM = "Дополнительно";
export const PAY_ROOM = "Оплата";

/**
 * 1) У объекта сохранён наряд от этого же КП → его строки (правки мастера; в проценте —
 *    одна строка «Оплата: N % от суммы заказа» без базы КП, как на /n).
 * 2) Иначе — autoWorkOrderLines: то же, что вкладка «Монтажнику» в приложении и наряд
 *    «По работам» до правок.
 * Строки с нулём не печатаем (как /n): они остаются мастеру в наряде.
 */
export function installerPdfModel(
  calc: CalculationResult | null | undefined,
  installPrices: Record<string, number>,
  currency: string,
  estimateId: string,
  savedDoc: unknown,
): InstallerPdfModel {
  const doc = parseWorkOrderDoc(savedDoc);
  const fromDoc = !!doc && doc.estimateId === estimateId;
  const auto = autoWorkOrderLines(calc, installPrices, currency);
  const lines: WorkOrderLine[] = fromDoc ? doc.lines : auto;
  const paid = lines.filter((l) => l.qty > 0 && l.price > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomResults: CalculationResult["roomResults"] = calc?.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  const areaOf = new Map<string, number>();
  for (const rr of roomResults) if (rr.roomName && !areaOf.has(rr.roomName)) areaOf.set(rr.roomName, rr.area ?? 0);

  // Порядок: «Оплата» процентом первой, затем комнаты как в КП; строки без комнаты (допы, свои) — в конце.
  const order = [PAY_ROOM, ...areaOf.keys()];
  const groups = new Map<string, InstallerPdfItem[]>();
  for (const l of paid) {
    const isPct = l.key === PCT_KEY && !!doc?.pay;
    const room = isPct ? PAY_ROOM : l.room && areaOf.has(l.room) ? l.room : l.room || EXTRA_ROOM;
    if (!groups.has(room)) groups.set(room, []);
    const total = l.qty * l.price;
    groups.get(room)!.push(
      isPct && doc?.pay
        ? { name: `Оплата: ${percentLabel(doc.pay.percent)} от суммы заказа`, quantity: 1, unit: "", unitPrice: total, total, flat: true }
        : { name: l.name, quantity: l.qty, unit: l.unit, unitPrice: l.price, total },
    );
  }
  const names = [...order.filter((n) => groups.has(n)), ...[...groups.keys()].filter((n) => !order.includes(n))];
  const rooms = names.map((name) => {
    const items = groups.get(name)!;
    return { name, area: areaOf.get(name) ?? null, items, total: items.reduce((s, i) => s + i.total, 0) };
  });

  // «Светильников»: мобилка пишет calc.totalSpots = 0 — считаем по строкам софитов КП
  // (авто-строки: в проценте или после правок мастера строк софитов в наряде может не быть).
  const spotQty = auto.filter((l) => l.code === "install_spot" && l.qty > 0).reduce((s, l) => s + l.qty, 0);
  const spots = spotQty > 0 ? spotQty : calc?.totalSpots ?? 0;

  return { rooms, total: Math.round(rooms.reduce((s, r) => s + r.total, 0)), spots, source: fromDoc ? "work-order" : "auto" };
}
