// Пересев стартового прайса при смене валюты мастера (11.11.2026).
//
// Регистрация сеет прайс по валюте номера (currencyForPhone): «+77…» — тенге.
// Мастер из России с казахстанским номером переключал валюту на рубли, а 59
// строк прайса оставались тенговыми: минималка 90 000 «₽», полотно 1 500 «₽/м²».
// Обратная история — у рублёвого мастера, уехавшего в тенге, — та же.
//
// Правило (Нариман: «мастеру проще»): если прайс компании ещё стартовый —
// пересеять стартовыми ценами новой валюты; если мастер уже правил цены —
// ничего не трогать, только подсказка одной строкой. Сохранённые КП не трогаем.
//
// «Ещё стартовый» = у компании нет своих позиций и плёнок, и КАЖДАЯ каталожная
// строка равна стартовой цене старой валюты (текущей или до понижения 01.10 —
// LOWERED_DEFAULTS_2026_10) либо стартовой цене новой (общие значения, напр.
// коэффициент высоты). Совпадение всего прайса — более сильный признак, чем
// updatedAt ≈ createdAt из rub-prices-fix.mjs: миграции (01.10, 10.11) двигали
// updatedAt без участия мастера, а мастер, вернувший цену к дефолту, всё равно
// хочет дефолт новой валюты.
import { prisma } from "@/lib/prisma";
import { asCurrency, currencySymbol, type CurrencyCode } from "@/lib/currency";
import { DEFAULT_PRICES, DEFAULT_PRICES_RUB, LOWERED_DEFAULTS_2026_10, defaultPricesFor } from "@/lib/constants";

export type ReseedOutcome =
  /** Прайс был стартовым — пересеян в новую валюту. */
  | "reseeded"
  /** Мастер правил цены — прайс не трогали, нужна подсказка. */
  | "kept"
  /** Нечего пересевать: мастер не владелец, прайса ещё нет или валюта та же. */
  | "none";

/** Все стартовые значения кода в валюте: текущее + (для тенге) старое до понижения 01.10.2026. */
export function defaultPriceSet(code: string, currency: CurrencyCode): Set<number> {
  const set = new Set<number>();
  const cur = defaultPricesFor(currency)[code];
  if (cur != null) set.add(cur);
  if (currency === "KZT") {
    const lowered = LOWERED_DEFAULTS_2026_10[code];
    if (lowered) set.add(lowered.from);
  }
  return set;
}

/** Есть ли вообще разница стартовых цен между валютами для этого кода (для отчётов). */
export function defaultsDiffer(code: string): boolean {
  return DEFAULT_PRICES[code] !== DEFAULT_PRICES_RUB[code];
}

type Row = { id: string; templateCode: string | null; filmKey: string | null; price: number; installerPrice: number | null };

/** Чистая проверка «прайс ещё стартовый в валюте from» — без базы, для тестов и dry-run. */
export function isDefaultPriceBook(rows: Row[], from: CurrencyCode, to: CurrencyCode): boolean {
  if (rows.length === 0) return false;
  for (const r of rows) {
    if (!r.templateCode || r.filmKey) return false; // своя позиция или плёнка — мастер работал с прайсом
    if (r.installerPrice != null) return false; // ставка монтажнику задана рукой — наряд уже в старой валюте, прайс правленный
    const price = Number(r.price);
    if (defaultPriceSet(r.templateCode, from).has(price)) continue;
    if (defaultPriceSet(r.templateCode, to).has(price)) continue;
    return false;
  }
  return true;
}

/**
 * Вызывается после смены Master.currency владельца. Возвращает, что сделано,
 * — ответ /api/profile показывает мастеру одну строку.
 */
export async function reseedPricesOnCurrencyChange(ownerId: string, fromRaw: string | null | undefined, toRaw: string | null | undefined): Promise<ReseedOutcome> {
  const from = asCurrency(fromRaw);
  const to = asCurrency(toRaw);
  if (from === to) return "none";
  // Прайс и валюта — компании владельца; участник чужой бригады своей валютой прайс не задаёт.
  const company = await prisma.company.findUnique({ where: { ownerId }, select: { id: true } });
  if (!company) return "none";
  const rows = await prisma.priceItem.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, templateCode: true, filmKey: true, price: true, installerPrice: true },
  });
  if (rows.length === 0) return "none"; // засеется при первом открытии прайса уже в новой валюте
  if (!isDefaultPriceBook(rows, from, to)) return "kept";

  const next = defaultPricesFor(to);
  const updates = rows
    .map((r) => ({ id: r.id, prev: Number(r.price), next: next[r.templateCode!] as number | undefined }))
    .filter((u): u is { id: string; prev: number; next: number } => u.next != null && u.next !== u.prev);
  if (updates.length === 0) return "reseeded";
  // Один UPDATE на все строки (как в scratchpad/rub-prices-fix.mjs): атомарно и одной
  // отправкой. Пакет из ~50 updateMany в $transaction упирался в таймаут 5 с
  // интерактивной транзакции на Neon. Защита price = prev: строку, которую успели
  // поменять между чтением и записью, не трогаем.
  const ids = updates.map((u) => u.id);
  const prevs = updates.map((u) => u.prev);
  const nexts = updates.map((u) => u.next);
  const updated = await prisma.$executeRaw`
    UPDATE "PriceItem" p SET price = v.next, "updatedAt" = now()
    FROM unnest(${ids}::text[], ${prevs}::float8[], ${nexts}::float8[]) AS v(id, prev, next)
    WHERE p.id = v.id AND p."companyId" = ${company.id} AND p.price = v.prev AND p."deletedAt" IS NULL`;
  if (updated !== updates.length) console.warn(`reseed prices: обновлено ${updated} из ${updates.length} строк (часть изменилась между чтением и записью)`);
  return "reseeded";
}

/** Одна строка мастеру по итогу: на его языке, со знаком валюты. */
export function reseedHint(outcome: ReseedOutcome, _from: string | null | undefined, to: string | null | undefined, language: string | null | undefined): string | null {
  const kk = language === "kk";
  const newSym = currencySymbol(to);
  // kept: не утверждаем, в какой валюте цены (при переключении туда-обратно прежняя
  // валюта профиля ≠ фактическая валюта прайса) — только что валюта сменилась.
  if (outcome === "kept") return kk ? `Валюта ${newSym} болып өзгертілді — прайстағы бағаларды тексеріңіз` : `Валюта изменена на ${newSym} — проверьте цены в прайсе`;
  if (outcome === "reseeded") return kk ? `Бастапқы бағалар ${newSym} валютасына ауыстырылды — прайсты тексеріңіз` : `Стартовые цены переведены в ${newSym} — проверьте прайс`;
  return null;
}
