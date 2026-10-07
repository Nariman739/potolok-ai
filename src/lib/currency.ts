// Валюта мастера (07.10.2026). До этого тенге был зашит во всём коде, а у нас
// 176 мастеров с российскими номерами — они вбивают рубли, а видят «₸».
// Цифры не пересчитываем: меняется только знак, слово и сумма прописью.
// Валюта одна на компанию: у участников берётся у владельца (как бренд КП).
//
// Этот файл ОБЩИЙ с мобилкой: копия лежит в potolok-ai-app/src/lib/shared/currency.ts.

export type CurrencyCode = "KZT" | "RUB";

export const DEFAULT_CURRENCY: CurrencyCode = "KZT";

export type CurrencyInfo = {
  code: CurrencyCode;
  /** Знак рядом с числом: «120 000 ₸». */
  symbol: string;
  /** Название в списке выбора. */
  nameRu: string;
  nameKk: string;
  /** Формы слова для суммы прописью (1, 2–4, 5+). У тенге форма одна. */
  wordsRu: [string, string, string];
  wordsKk: string;
  /** Как мастер привык называть в речи: «тг», «руб». Для разбора голосовых. */
  spoken: string[];
};

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  KZT: {
    code: "KZT",
    symbol: "₸",
    nameRu: "Тенге (₸)",
    nameKk: "Теңге (₸)",
    wordsRu: ["тенге", "тенге", "тенге"],
    wordsKk: "теңге",
    spoken: ["тенге", "тг", "теңге"],
  },
  RUB: {
    code: "RUB",
    symbol: "₽",
    nameRu: "Рубли (₽)",
    nameKk: "Рубль (₽)",
    wordsRu: ["рубль", "рубля", "рублей"],
    wordsKk: "рубль",
    spoken: ["рублей", "рубля", "рубль", "руб", "р"],
  },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Строка из базы/запроса → известный код. Всё незнакомое = тенге. */
export function asCurrency(raw: unknown): CurrencyCode {
  return typeof raw === "string" && raw in CURRENCIES ? (raw as CurrencyCode) : DEFAULT_CURRENCY;
}

export function currencySymbol(code: CurrencyCode | string | null | undefined): string {
  return CURRENCIES[asCurrency(code)].symbol;
}

/** Валюта по номеру телефона при регистрации: российские мобильные +79… → рубли. */
export function currencyForPhone(phone: string | null | undefined): CurrencyCode {
  return /^\+79\d{9}$/.test(phone ?? "") ? "RUB" : "KZT";
}

/** Форма слова по числу: 1 рубль, 2 рубля, 5 рублей; тенге всегда тенге. */
export function currencyWord(amount: number, code: CurrencyCode | string | null | undefined, lang: "ru" | "kk" = "ru"): string {
  const info = CURRENCIES[asCurrency(code)];
  if (lang === "kk") return info.wordsKk;
  const n = Math.abs(Math.round(amount));
  const last2 = n % 100;
  const last = n % 10;
  if (last2 >= 11 && last2 <= 14) return info.wordsRu[2];
  if (last === 1) return info.wordsRu[0];
  if (last >= 2 && last <= 4) return info.wordsRu[1];
  return info.wordsRu[2];
}

/** «120 000 ₸» / «120 000 ₽». Разделитель — неразрывный пробел, как было. */
export function formatMoney(
  amount: number,
  code: CurrencyCode | string | null | undefined,
  locale: string = "ru-RU",
): string {
  return `${new Intl.NumberFormat(locale).format(Math.round(amount))} ${currencySymbol(code)}`;
}

/**
 * Единица «₸» у позиции min_order — это КОД единицы «фиксированная сумма»,
 * он лежит в базе и в ALLOWED_UNITS, его не меняем. При показе подставляем
 * знак текущей валюты мастера (07.10.2026).
 */
export function unitLabel(unit: string | null | undefined, symbol: string): string {
  if (!unit) return "";
  return unit === "₸" ? symbol : unit;
}
