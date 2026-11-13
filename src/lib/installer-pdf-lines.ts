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
export type InstallerPdfModel = { rooms: InstallerPdfRoom[]; total: number; spots: number; roomCount: number; source: "work-order" | "fee" | "auto" };

export const EXTRA_ROOM = "Дополнительно";
export const PAY_ROOM = "Оплата";
/** Ключ строки ручной суммы — как в GET наряда. */
const FEE_KEY = "fee";

/**
 * 1) У объекта сохранён наряд от этого же КП → его строки (правки мастера; в проценте —
 *    одна строка «Оплата: N % от суммы заказа» без базы КП, как на /n).
 * 2) Наряда нет, это главное КП объекта (pickPrimaryEstimate — как GET наряда) и сумма
 *    монтажнику вбита руками (installerFee > 0) → одна строка «Оплата за монтаж» (13.11.2026).
 *    installerFee живёт на объекте: неглавному/старому КП её не печатаем; 0 — авто-строки.
 * 3) Иначе — autoWorkOrderLines: то же, что вкладка «Монтажнику» в приложении и наряд
 *    «По работам» до правок.
 * Строки с нулём не печатаем (как /n): они остаются мастеру в наряде.
 * Группы — по ключу комнаты (roomId), не по имени: две «Спальни» — две группы.
 */
export function installerPdfModel(
  calc: CalculationResult | null | undefined,
  installPrices: Record<string, number>,
  currency: string,
  estimateId: string,
  savedDoc: unknown,
  /** MeasurementObject.installerFee и главное КП объекта (pickPrimaryEstimate). */
  fee?: { installerFee: number | null; primaryEstimateId: string | null } | null,
): InstallerPdfModel {
  const doc = parseWorkOrderDoc(savedDoc);
  const fromDoc = !!doc && doc.estimateId === estimateId;
  const feeAmount = fee?.installerFee ?? 0;
  const fromFee = !doc && feeAmount > 0 && fee?.primaryEstimateId === estimateId;
  const auto = autoWorkOrderLines(calc, installPrices, currency);
  const lines: WorkOrderLine[] = fromDoc
    ? doc.lines
    : fromFee
      ? [{ key: FEE_KEY, room: "", name: "Оплата за монтаж", qty: 1, unit: "усл.", price: feeAmount }]
      : auto;
  const paid = lines.filter((l) => l.qty > 0 && l.price > 0);

  // Комнаты КП по ключу, как в autoWorkOrderLines (roomId ?? roomName); одноимённые без roomId
  // склеены и там — площадь суммируем.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomResults: CalculationResult["roomResults"] = calc?.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  const roomOf = new Map<string, { name: string; area: number }>();
  for (const rr of roomResults) {
    const key = rr.roomId ?? rr.roomName ?? "";
    const cur = roomOf.get(key);
    if (cur) cur.area += rr.area ?? 0;
    else roomOf.set(key, { name: rr.roomName || "Комната", area: rr.area ?? 0 });
  }
  // Длинные ключи первыми: «Зал 2:…» не должен уйти в «Зал».
  const roomKeys = [...roomOf.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const roomKeyOf = (l: WorkOrderLine): string | null => {
    const byKey = roomKeys.find((k) => l.key.startsWith(`${k}:`));
    if (byKey) return byKey;
    // Своя строка мастера с комнатой — по имени (первая такая комната).
    if (l.room) for (const [k, r] of roomOf) if (r.name === l.room) return k;
    return null;
  };

  // Порядок: «Оплата» первой, затем комнаты как в КП; строки без комнаты (допы, свои) — в конце.
  const PAY = "\u0000pay";
  const EXTRA = "\u0000extra";
  const order = [PAY, ...roomOf.keys(), EXTRA];
  const groups = new Map<string, InstallerPdfItem[]>();
  for (const l of paid) {
    const isPct = l.key === PCT_KEY && !!doc?.pay;
    const isFee = fromFee && l.key === FEE_KEY;
    const g = isPct || isFee ? PAY : roomKeyOf(l) ?? (l.room ? `\u0000room:${l.room}` : EXTRA);
    if (!groups.has(g)) groups.set(g, []);
    const total = l.qty * l.price;
    groups.get(g)!.push(
      isPct && doc?.pay
        ? { name: `Оплата: ${percentLabel(doc.pay.percent)} от суммы заказа`, quantity: 1, unit: "", unitPrice: total, total, flat: true }
        : isFee
          ? { name: l.name, quantity: 1, unit: "", unitPrice: total, total, flat: true }
          : { name: l.name, quantity: l.qty, unit: l.unit, unitPrice: l.price, total },
    );
  }
  const keys = [...order.filter((k) => groups.has(k)), ...[...groups.keys()].filter((k) => !order.includes(k))];
  const rooms = keys.map((k) => {
    const items = groups.get(k)!;
    const r = roomOf.get(k);
    const name = k === PAY ? PAY_ROOM : k === EXTRA ? EXTRA_ROOM : r ? r.name : k.replace("\u0000room:", "");
    return { name, area: r ? r.area : null, items, total: items.reduce((s, i) => s + i.total, 0) };
  });

  // «Светильников»: мобилка пишет calc.totalSpots = 0 — считаем по строкам софитов КП
  // (авто-строки: в проценте или после правок мастера строк софитов в наряде может не быть).
  const spotQty = auto.filter((l) => l.code === "install_spot" && l.qty > 0).reduce((s, l) => s + l.qty, 0);
  const spots = spotQty > 0 ? spotQty : calc?.totalSpots ?? 0;

  return {
    rooms,
    total: Math.round(rooms.reduce((s, r) => s + r.total, 0)),
    spots,
    // «Помещений: N» — сколько комнат различает PDF (две «Спальни» с roomId — две).
    roomCount: roomOf.size,
    source: fromDoc ? "work-order" : fromFee ? "fee" : "auto",
  };
}
