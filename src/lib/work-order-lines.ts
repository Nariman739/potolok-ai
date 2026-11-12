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
import { defaultPricesFor } from "@/lib/constants";
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
  // Как в приложении: бра в наряде идёт по ставке установки подвесного светильника.
  pendant: "pendant_install",
  track_magnetic: "install_track",
  track_surface: "install_track",
  light_line: "install_lightline",
  // Верхнее полотно 2-го уровня натягивается как полотно; борт и подсветка — без своей
  // ставки (см. noRateKind «level2»).
  level2_canvas: "install_canvas",
  curtain_ldsp: "install_curtain",
  curtain_aluminum: "install_curtain",
  gardina_single: "install_gardina",
  gardina_plastic: "install_gardina",
  gardina_aluminum: "install_gardina",
  corner_plastic: "install_corner",
  corner_aluminum: "install_corner",
  pipe_bypass: "install_pipe",
  // Подшторник монтируется по ставке карниза, как в приложении.
  podshtornik_aluminum: "install_curtain",
  podshtornik_plastic: "install_curtain",
  podshtornik_ldsp: "install_curtain",
  // Своей строки «Для бригады» нет: цена работы позиции, иначе 30 % (см. autoWorkOrderLines).
  corner_rounded: "install_corner_rounded",
};

/** Строки, которые не схлопываются с карнизом или углами: у них свой метраж и своя ставка. */
const OWN_LINE_CODES = new Set(["podshtornik_aluminum", "podshtornik_plastic", "podshtornik_ldsp", "corner_rounded"]);

/** Эти работы оплачиваются по метрам каждой строки КП: схлопывать нельзя. */
const PER_LINE_INSTALL = new Set(["install_track", "install_lightline", "install_gardina"]);

/** Ключ схлопывания строк одной комнаты. Профиль и вставка — один монтаж, остальное построчно. */
export function installSeenKey(installCode: string, itemCode: string): string {
  return installCode === "install_spot" || itemCode === "level2_canvas" || PER_LINE_INSTALL.has(installCode) || OWN_LINE_CODES.has(itemCode)
    ? `${installCode}:${itemCode}`
    : installCode;
}

/** Свой вариант прайса приходит из мобилки с itemCode = pickerKey («canvas», «spot:v:<id>»…). */
function installCodeFor(itemCode: string | null | undefined): string | undefined {
  // В старых КП приложения код бывает null.
  if (!itemCode) return undefined;
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
  // Вставка и LED-лента — без ставки в прайсе: не цеплять к профилю/световой линии.
  if (n.startsWith("монтаж вставки") || n.startsWith("монтаж led") || n.startsWith("монтаж: вставка") || n.startsWith("монтаж: led")) return undefined;
  // «Монтаж полотна 2-го уровня» — всё же полотно (до guard'а ниже, ревью 08.11.2026).
  if (n.startsWith("монтаж полотна")) return "install_canvas";
  // «Монтаж 2-го уровня» / «Подсветка в ступеньке» — ставки нет; иначе «свет» в слове
  // «подсветка» увело бы строку в install_lightline (08.11.2026).
  if (n.includes("2-го уровня") || n.includes("ступеньк")) return undefined;
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

/**
 * Оплата процентом от КП (12.11.2026, просьба «Ваш Потолок», решение Наримана): многие бригады
 * платят монтажнику не по работам, а 10/20/30 % от суммы заказа. base — итог главного КП
 * (Estimate.total, уже после скидки) на момент расчёта; сумма — строка PCT_KEY в lines,
 * её считает сервер. Старые сборки приложения pay не знают и видят одну обычную строку.
 */
export type WorkOrderPay = { mode: "percent"; percent: number; base: number };

export const PCT_KEY = "pct";

/** % от 0,5 до 100 с шагом 0,5; иначе null. */
export function sanitizePercent(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const r = Math.round(n * 2) / 2;
  return r >= 0.5 && r <= 100 ? r : null;
}

export function percentAmount(percent: number, base: number): number {
  return Math.max(0, Math.round((base * percent) / 100));
}

/** «30 %», «12,5 %» — для строки наряда (мастер видит базу на своём экране, монтажник — нет). */
export function percentLabel(percent: number): string {
  return `${String(percent).replace(".", ",")} %`;
}

/** Строка оплаты процентом. Имя — для старых сборок; /n и PDF пишут свой текст по ключу. */
export function percentLine(percent: number, base: number): WorkOrderLine {
  return { key: PCT_KEY, room: "", name: `${percentLabel(percent)} от суммы заказа`, qty: 1, unit: "усл.", price: percentAmount(percent, base) };
}

/** Свои строки мастера («+ Добавить работу») — переживают смену режима оплаты. */
export function isOwnLine(l: WorkOrderLine): boolean {
  return l.key.startsWith("own:");
}

export type WorkOrderLinesBackup = { lines: WorkOrderLine[]; estimateId?: string; estimateUpdatedAt?: string };

export type WorkOrderLinesDoc = {
  v: 1;
  lines: WorkOrderLine[];
  /** Есть — оплата процентом от КП; нет — по работам. */
  pay?: WorkOrderPay;
  /**
   * Строки «по работам» до перехода на процент (аудит 12.11.2026): случайный тап «Процент» →
   * «По работам» не должен стирать правки мастера и ручную сумму. Только для экрана мастера —
   * /n и PDF читают lines, этого поля не показывают.
   */
  linesBackup?: WorkOrderLinesBackup;
  updatedAt: string;
  /** От какого КП строки — чтобы заметить, что КП изменилось после наряда. */
  estimateId?: string;
  estimateUpdatedAt?: string;
};

/**
 * Позиции КП, у которых нет своей ставки в прайсе «Для бригады» (вставка идёт
 * в монтаж профиля, LED-лента — в подшторник). Нариман 29.10.2026: «все
 * позиции, которые есть в КП, должны появляться и в наряде» — мастер сам
 * ставит цену или убирает строку. Поэтому они идут отдельной строкой с 0.
 */
type NoRateKind = "insert" | "led" | "level2";
function noRateKind(item: { itemCode?: string; itemName: string }): NoRateKind | null {
  const n = item.itemName.toLowerCase();
  if (item.itemCode === "insert" || n.startsWith("вставка")) return "insert";
  if (item.itemCode === "led_strip" || n.startsWith("led")) return "led";
  // Борт 2-го уровня (08.11.2026): одна строка монтажнику на м.п. борта, подсветка в неё
  // же — отдельной ставки у подсветки нет.
  if (item.itemCode === "level2_step" || n.startsWith("переход уровня")) return "level2";
  return null;
}
const NO_RATE_PREFIX: Record<NoRateKind, string> = { insert: "монтаж вставки", led: "монтаж led", level2: "монтаж 2-го уровня" };
/** Мобилка с 30.10.2026 сама кладёт «Монтаж вставки» / «Монтаж LED-подсветки» в installerItems. */
function hasNoRateLine(saved: LineItem[], kind: NoRateKind): boolean {
  const prefix = NO_RATE_PREFIX[kind];
  return saved.some((s) => s.itemName.toLowerCase().startsWith(prefix));
}
/** Имена как у мобилки: «просто монтаж вставки», без «(алюм.)» (Нариман 30.10.2026). */
function noRateName(kind: NoRateKind): string {
  return kind === "insert" ? "Монтаж вставки" : kind === "led" ? "Монтаж LED-подсветки" : "Монтаж 2-го уровня";
}

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
  /** Валюта владельца — дефолтные ставки монтажа, если в прайсе нет строки (10.11.2026). */
  currency?: string | null,
): WorkOrderLine[] {
  if (!calc) return [];
  const defaults = defaultPricesFor(currency);
  const priceOf = (code: string) => installPrices[code] ?? defaults[code] ?? 0;
  const out: WorkOrderLine[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomResults: RoomWithInstaller[] = calc.roomResults ?? (calc as any)?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  for (const rr of roomResults) {
    const roomName = rr.roomName ?? "";
    const roomKey = rr.roomId ?? roomName;
    const saved = Array.isArray(rr.installerItems) ? rr.installerItems : [];
    if (saved.length > 0) {
      // Нулевую ставку оставляем строкой с 0 (Нариман 29.10.2026): «вдруг со
      // временем захотят добавить». Монтажнику такие строки не показываются.
      saved.forEach((it, i) => {
        if (!(it.quantity > 0)) return;
        let price = Math.max(0, Math.round(it.unitPrice || 0));
        // КП, посчитанные мобилкой до 29.10.2026, несут баг: ставка «Для бригады»
        // умножена на 30 % (900 → 270; у пары софитов — ×2). Узнаём его по точному
        // совпадению и берём ставку из прайса; свои правки мастера так не выглядят.
        const code = installCodeFor(it.itemCode) ?? installCodeByName(it.itemName);
        const rate = code ? priceOf(code) : 0;
        if (rate > 0 && price === Math.round(rate * 0.3)) price = Math.round(rate);
        else if (rate > 0 && price === Math.round(rate * 0.3) * 2) price = Math.round(rate) * 2;
        out.push({ key: `${roomKey}:ii:${i}:${it.itemCode}`, room: roomName, name: it.itemName, qty: round2(it.quantity), unit: it.unit, price, code });
      });
      // КП, сохранённые мобилкой до 30.10.2026: вставки и LED-ленты в
      // installerItems нет — добавляем строкой с 0, чтобы мастер её увидел.
      ((rr.items ?? []) as LineItem[]).forEach((item, i) => {
        const kind = noRateKind(item);
        if (!kind || !(item.quantity > 0) || hasNoRateLine(saved, kind)) return;
        out.push({ key: `${roomKey}:kp:${i}:${kind}`, room: roomName, name: noRateName(kind), qty: round2(item.quantity), unit: item.unit, price: 0 });
      });
      continue;
    }
    const seen = new Set<string>();
    const usedCodes = new Set<string>();
    for (const [i, item] of ((rr.items ?? []) as LineItem[]).entries()) {
      // Строка со своим монтажом (профиль по стенам, подшторник, скругление) — как у мобилки.
      if (item.installerName) {
        if (item.quantity > 0) out.push({ key: `${roomKey}:wp:${i}:${item.itemCode}`, room: roomName, name: item.installerName, qty: round2(item.quantity), unit: item.unit, price: Math.max(0, Math.round(item.installerRate ?? 0)), ...(item.installCode && { code: item.installCode }) });
        continue;
      }
      const kind = noRateKind(item);
      if (kind) {
        if (item.quantity > 0) out.push({ key: `${roomKey}:kp:${i}:${kind}`, room: roomName, name: noRateName(kind), qty: round2(item.quantity), unit: item.unit, price: 0 });
        continue;
      }
      const installCode = item.installCode ?? installCodeFor(item.itemCode);
      if (!installCode) continue;
      // Софиты разных типов монтируются отдельно, полотно 2-го уровня — отдельно от
      // основного; остальное по коду монтажа схлопываем (профиль + вставка = один монтаж профиля).
      const seenKey = installSeenKey(installCode, item.itemCode);
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const price = item.installerRate
        ?? (item.itemCode === "corner_rounded" ? Math.round(item.unitPrice * 0.3) : Math.max(0, priceOf(installCode)));
      if (item.quantity <= 0) continue;
      // Первая строка трека, линии и гардины хранит прежний ключ: на него ссылаются правки мастера.
      const lineKey = PER_LINE_INSTALL.has(installCode) && !usedCodes.has(installCode) ? installCode : seenKey;
      usedCodes.add(installCode);
      out.push({ key: `${roomKey}:${lineKey}`, room: roomName, name: `${item.itemName} (монтаж)`, qty: round2(item.quantity), unit: item.unit, price, code: installCode });
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
    ...(parsePay(doc.pay) && { pay: parsePay(doc.pay)! }),
    ...(parseBackup(doc.linesBackup) && { linesBackup: parseBackup(doc.linesBackup)! }),
  };
}

function parseBackup(raw: unknown): WorkOrderLinesBackup | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<WorkOrderLinesBackup>;
  if (!Array.isArray(b.lines)) return null;
  return {
    lines: b.lines.filter(isLine),
    ...(typeof b.estimateId === "string" && { estimateId: b.estimateId }),
    ...(typeof b.estimateUpdatedAt === "string" && { estimateUpdatedAt: b.estimateUpdatedAt }),
  };
}

function parsePay(raw: unknown): WorkOrderPay | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<WorkOrderPay>;
  const percent = sanitizePercent(p.percent);
  if (p.mode !== "percent" || percent == null || typeof p.base !== "number" || !Number.isFinite(p.base) || p.base < 0) return null;
  return { mode: "percent", percent, base: p.base };
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
