/**
 * Строки оплаты монтажнику в наряде (29.10.2026).
 *
 * Башарлан (Potolkovi4): «не добавляются цены услуг монтажников — чтоб сразу
 * монтажникам скидывать полную детализацию». До этого наряд (/n/[token])
 * показывал одну цифру installerFee, а разбивка по работам жила только в
 * PDF из КП и считалась заново при каждом открытии. Теперь наряд — как КП:
 * строки считаются из главного КП по ставкам раздела «Для бригады», мастер
 * правит любую (количество, ставку), добавляет свои, и ровно это видит
 * монтажник по ссылке и в PDF.
 *
 * Хранение: MeasurementObject.workOrderLines (WorkOrderLinesDoc). null —
 * мастер ничего не трогал, показываем авто-расчёт. installerFee на объекте
 * всегда равен сумме строк — модуль «Деньги» его так и читает.
 */
import { DEFAULT_PRICES } from "@/lib/constants";
import type { CalculationResult, LineItem } from "@/lib/types";

/** Клиентская позиция КП → монтажная ставка из прайса. */
export const INSTALL_MAP: Record<string, string> = {
  canvas_320: "install_canvas",
  canvas_550: "install_canvas",
  canvas_over: "install_canvas",
  profile_plastic: "install_profile",
  insert: "install_profile",
  profile_shadow: "install_profile",
  profile_gapless: "install_profile",
  profile_aluminum: "install_profile",
  profile_floating: "install_profile",
  spot_client: "install_spot",
  spot_ours: "install_spot",
  spot_bh53: "install_spot",
  spot_bh10: "install_spot",
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

export type WorkOrderLine = {
  /** Стабильный ключ строки: `<roomId>:<installCode>:<itemCode>` для авто-строк, `own:<id>` для своих. */
  key: string;
  /** Комната, к которой относится строка; "" — по объекту в целом (допы, свои строки). */
  room: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

export type WorkOrderLinesDoc = {
  v: 1;
  lines: WorkOrderLine[];
  updatedAt: string;
};

const MAX_LINES = 60;
const MAX_NAME = 80;
const MAX_NUM = 100_000_000;

/** Доп. позиция КП, как её сохраняет мобилка: с ценой монтажнику. */
type ExtraWithInstaller = LineItem & { installerPrice?: number; installerTotal?: number };

/**
 * Авто-строки по главному КП: та же логика, что была в /estimates/[id]/installer-pdf.
 * Ставка берётся как есть из прайса (раздел «Для бригады»), нулевые работы не показываем.
 */
export function autoWorkOrderLines(
  calc: CalculationResult | null | undefined,
  installPrices: Record<string, number>,
): WorkOrderLine[] {
  if (!calc) return [];
  const priceOf = (code: string) => installPrices[code] ?? DEFAULT_PRICES[code] ?? 0;
  const out: WorkOrderLine[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomResults = calc.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  for (const rr of roomResults) {
    const seen = new Set<string>();
    const roomName = rr.roomName ?? "";
    for (const item of (rr.items ?? []) as LineItem[]) {
      const installCode = item.installCode ?? INSTALL_MAP[item.itemCode];
      if (!installCode) continue;
      // Софиты разных типов монтируются отдельно; остальное по коду монтажа схлопываем
      // (профиль + вставка = один монтаж профиля).
      const seenKey = installCode === "install_spot" ? `${installCode}:${item.itemCode}` : installCode;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const price = priceOf(installCode);
      if (price <= 0 || item.quantity <= 0) continue;
      out.push({
        key: `${rr.roomId ?? roomName}:${seenKey}`,
        room: roomName,
        name: `${item.itemName} (монтаж)`,
        qty: round2(item.quantity),
        unit: item.unit,
        price,
      });
    }
  }

  // Допы вне комнат — мобилка кладёт туда цену монтажнику; без неё работу не выдумываем.
  for (const ei of (calc.extraItems ?? []) as ExtraWithInstaller[]) {
    const price = ei.installerPrice ?? 0;
    if (ei.itemCode === "min_order" || price <= 0 || ei.quantity <= 0) continue;
    out.push({ key: `extra:${ei.itemCode}:${ei.itemName}`, room: "", name: ei.itemName, qty: round2(ei.quantity), unit: ei.unit, price });
  }
  return out;
}

export function workOrderTotal(lines: WorkOrderLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
}

/** Сохранённые строки, если мастер их правил; иначе null. */
export function parseWorkOrderDoc(raw: unknown): WorkOrderLinesDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<WorkOrderLinesDoc>;
  if (doc.v !== 1 || !Array.isArray(doc.lines)) return null;
  return { v: 1, lines: doc.lines.filter(isLine), updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : "" };
}

/** Строки из тела PUT — проверяем границы, чтобы в наряд не уехал мусор. */
export function sanitizeWorkOrderLines(raw: unknown): WorkOrderLine[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "Нужен список строк" };
  if (raw.length > MAX_LINES) return { error: `Не больше ${MAX_LINES} строк` };
  const lines: WorkOrderLine[] = [];
  for (const r of raw) {
    if (!isLine(r)) return { error: "Строка наряда некорректна" };
    const name = r.name.trim().slice(0, MAX_NAME);
    if (!name) return { error: "У строки нет названия" };
    lines.push({
      key: String(r.key).slice(0, 120),
      room: String(r.room ?? "").slice(0, MAX_NAME),
      name,
      qty: round2(r.qty),
      unit: String(r.unit || "шт.").slice(0, 10),
      price: Math.round(r.price),
    });
  }
  return lines;
}

function isLine(r: unknown): r is WorkOrderLine {
  if (!r || typeof r !== "object") return false;
  const l = r as Record<string, unknown>;
  return typeof l.key === "string" && typeof l.name === "string"
    && typeof l.qty === "number" && Number.isFinite(l.qty) && l.qty >= 0 && l.qty <= MAX_NUM
    && typeof l.price === "number" && Number.isFinite(l.price) && l.price >= 0 && l.price <= MAX_NUM
    && (l.room === undefined || typeof l.room === "string")
    && (l.unit === undefined || typeof l.unit === "string");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
