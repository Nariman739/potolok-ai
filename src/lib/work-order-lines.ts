/**
 * Строки оплаты монтажнику в наряде (29.10.2026).
 *
 * Башарлан (Potolkovi4): «не добавляются цены услуг монтажников — чтоб сразу
 * монтажникам скидывать полную детализацию». До этого наряд (/n/[token])
 * показывал одну цифру installerFee, а разбивка по работам жила только в
 * PDF из КП и считалась заново при каждом открытии. Теперь наряд — как КП:
 * строки берутся из главного КП, мастер правит любую (количество, ставку),
 * добавляет свои, и ровно это видит монтажник по ссылке и в PDF.
 *
 * Хранение: MeasurementObject.workOrderLines (WorkOrderLinesDoc). null —
 * мастер ничего не трогал и не отправлял. installerFee на объекте всегда
 * равен сумме строк — модуль «Деньги» его так и читает.
 */
import { DEFAULT_PRICES } from "@/lib/constants";
import type { CalculationResult, LineItem } from "@/lib/types";

/** Клиентская позиция КП → монтажная ставка из прайса (для КП, посчитанных на сайте). */
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
  spot_pair_ours: "install_spot",
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

/** Свой вариант прайса приходит из мобилки с itemCode = pickerKey («canvas», «spot:v:<id>»…). */
function installCodeFor(itemCode: string): string | undefined {
  if (INSTALL_MAP[itemCode]) return INSTALL_MAP[itemCode];
  const head = itemCode.split(":")[0];
  switch (head) {
    case "canvas": return "install_canvas";
    case "profile": return "install_profile";
    case "spot": case "spot_pair": return "install_spot";
    case "chandelier": return "install_chandelier";
    case "track": return "install_track";
    case "lightline": return "install_lightline";
    case "curtain": return "install_curtain";
    case "gardina": case "podshtornik": return "install_gardina";
    default: return undefined;
  }
}

/** Строки монтажнику в КП мобилки без кода (itemCode = "custom") — узнаём работу по имени. */
export function installCodeByName(name: string): string | undefined {
  const n = name.toLowerCase();
  if (n.startsWith("монтаж полотна")) return "install_canvas";
  if (n.includes("софит")) return "install_spot";
  if (n.includes("люстр")) return "install_chandelier";
  if (n.includes("трек")) return "install_track";
  if (n.includes("свет")) return "install_lightline";
  if (n.includes("гардин")) return "install_gardina";
  if (n.includes("карниз")) return "install_curtain";
  if (n.includes("труб")) return "install_pipe";
  if (n.includes("угл")) return "install_corner";
  if (n.includes("профил") || n.includes("подшторник") || n.includes("лдсп") || n.includes("брус")) return "install_profile";
  return undefined;
}

export type WorkOrderLine = {
  /** Стабильный ключ строки — по нему мобилка правит и удаляет; `own:<id>` для своих. */
  key: string;
  /** Комната, к которой относится строка; "" — по объекту в целом (допы, свои строки). */
  room: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  /** Вид работы (install_canvas…): по нему мастер меняет ставку сразу во всех комнатах. */
  code?: string;
};

export type WorkOrderLinesDoc = {
  v: 1;
  lines: WorkOrderLine[];
  updatedAt: string;
  /** От какого КП строки — чтобы заметить, что КП изменилось после наряда. */
  estimateId?: string;
  estimateUpdatedAt?: string;
};

const MAX_LINES = 60;
const MAX_NAME = 80;
const MAX_NUM = 100_000_000;

/** Комната КП, как её сохраняет мобилка: с готовыми строками монтажнику (installerItems). */
type RoomWithInstaller = CalculationResult["roomResults"][number] & { installerItems?: LineItem[] };
/** Доп. позиция КП, как её сохраняет мобилка: с ценой монтажнику (30 % от клиентской, если мастер не задал). */
type ExtraWithInstaller = LineItem & { installerPrice?: number; installerTotal?: number };

/**
 * Авто-строки по главному КП. Мобилка кладёт в каждую комнату installerItems —
 * ровно то, что мастер видел во вкладке «Монтажнику» (свои варианты, пары
 * софитов, его правки). Берём их; пересчёт по INSTALL_MAP — только для КП,
 * посчитанных на сайте, где installerItems нет.
 */
export function autoWorkOrderLines(
  calc: CalculationResult | null | undefined,
  installPrices: Record<string, number>,
): WorkOrderLine[] {
  if (!calc) return [];
  const priceOf = (code: string) => installPrices[code] ?? DEFAULT_PRICES[code] ?? 0;
  const out: WorkOrderLine[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomResults: RoomWithInstaller[] = calc.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  for (const rr of roomResults) {
    const roomName = rr.roomName ?? "";
    const roomKey = rr.roomId ?? roomName;
    const saved = Array.isArray(rr.installerItems) ? rr.installerItems : [];
    if (saved.length > 0) {
      saved.forEach((it, i) => {
        if (!(it.quantity > 0) || !(it.unitPrice > 0)) return;
        let price = Math.round(it.unitPrice);
        // КП, посчитанные мобилкой до 29.10.2026, несут баг: ставка «Для бригады»
        // умножена на 30 % (900 → 270; у пары софитов — ×2). Узнаём его по точному
        // совпадению и берём ставку из прайса; свои правки мастера так не выглядят.
        const code = installCodeFor(it.itemCode) ?? installCodeByName(it.itemName);
        const rate = code ? priceOf(code) : 0;
        if (rate > 0 && price === Math.round(rate * 0.3)) price = Math.round(rate);
        else if (rate > 0 && price === Math.round(rate * 0.3) * 2) price = Math.round(rate) * 2;
        out.push({ key: `${roomKey}:ii:${i}:${it.itemCode}`, room: roomName, name: it.itemName, qty: round2(it.quantity), unit: it.unit, price, code });
      });
      continue;
    }
    const seen = new Set<string>();
    for (const item of (rr.items ?? []) as LineItem[]) {
      const installCode = item.installCode ?? installCodeFor(item.itemCode);
      if (!installCode) continue;
      // Софиты разных типов монтируются отдельно; остальное по коду монтажа схлопываем
      // (профиль + вставка = один монтаж профиля).
      const seenKey = installCode === "install_spot" ? `${installCode}:${item.itemCode}` : installCode;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const price = priceOf(installCode);
      if (price <= 0 || item.quantity <= 0) continue;
      out.push({ key: `${roomKey}:${seenKey}`, room: roomName, name: `${item.itemName} (монтаж)`, qty: round2(item.quantity), unit: item.unit, price, code: installCode });
    }
  }

  // Допы вне комнат — у мобилки там цена монтажнику (своя или 30 % от клиентской).
  (calc.extraItems ?? []).forEach((ei: ExtraWithInstaller, i) => {
    const price = ei.installerPrice ?? 0;
    if (ei.itemCode === "min_order" || price <= 0 || ei.quantity <= 0) return;
    out.push({ key: `extra:${i}:${ei.itemName}`, room: "", name: ei.itemName, qty: round2(ei.quantity), unit: ei.unit, price: Math.round(price) });
  });
  return out;
}

export function workOrderTotal(lines: WorkOrderLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
}

/** Сохранённые строки, если мастер их правил или отправлял; иначе null. */
export function parseWorkOrderDoc(raw: unknown): WorkOrderLinesDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<WorkOrderLinesDoc>;
  if (doc.v !== 1 || !Array.isArray(doc.lines)) return null;
  return {
    v: 1,
    // Наряды, сохранённые до появления code (29.10.2026), — вид работы по имени,
    // иначе блок «Ставки по работам» для них пустой.
    lines: doc.lines.filter(isLine).map((l) => (l.code ? l : { ...l, code: installCodeByName(l.name) })),
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : "",
    estimateId: typeof doc.estimateId === "string" ? doc.estimateId : undefined,
    estimateUpdatedAt: typeof doc.estimateUpdatedAt === "string" ? doc.estimateUpdatedAt : undefined,
  };
}

/** Строки из тела PUT — проверяем границы, чтобы в наряд не уехал мусор. */
export function sanitizeWorkOrderLines(raw: unknown): WorkOrderLine[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "Нужен список строк" };
  if (raw.length > MAX_LINES) return { error: `Не больше ${MAX_LINES} строк` };
  const lines: WorkOrderLine[] = [];
  const keys = new Set<string>();
  let total = 0;
  for (const r of raw) {
    if (!isLine(r)) return { error: "Строка наряда некорректна" };
    const name = r.name.trim().slice(0, MAX_NAME);
    if (!name) return { error: "У строки нет названия" };
    let key = String(r.key).slice(0, 120);
    // Два одинаковых ключа — мобилка правила бы обе строки сразу.
    while (keys.has(key)) key += "#";
    keys.add(key);
    const line: WorkOrderLine = {
      key,
      room: String(r.room ?? "").slice(0, MAX_NAME),
      name,
      qty: round2(r.qty),
      unit: String(r.unit || "шт.").slice(0, 10),
      price: Math.round(r.price),
      ...(typeof r.code === "string" && r.code ? { code: r.code.slice(0, 40) } : {}),
    };
    total += line.qty * line.price;
    if (total > MAX_NUM) return { error: "Сумма наряда слишком большая" };
    lines.push(line);
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
    && (l.unit === undefined || typeof l.unit === "string")
    && (l.code === undefined || typeof l.code === "string");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
