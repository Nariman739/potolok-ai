/**
 * Два языка на сервере: русский и казахский (25.09.2026).
 *
 * Зачем отдельно от мобильного словаря: здесь переводится не интерфейс, а то,
 * что видит ЗАКАЗЧИК мастера — страница КП, договор, акт, наряд монтажнику.
 * Язык выбирает мастер в приложении (`Master.language`), а на публичной
 * странице КП его может переключить и сам клиент: у мастера-казаха бывает
 * русскоязычный заказчик и наоборот.
 *
 * Устройство простое, как в приложении: плоские ключи, русский — источник
 * правды, чего нет по-казахски, показывается по-русски.
 */

export type Lang = "ru" | "kk";

export function asLang(raw: unknown): Lang {
  return raw === "kk" ? "kk" : "ru";
}

/** Локаль для дат и чисел. Тенге и разделители в обоих языках одинаковы. */
export function localeOf(lang: Lang): string {
  return lang === "kk" ? "kk-KZ" : "ru-KZ";
}

/**
 * Месяцы для дат в документах. `Intl` на сервере знает казахский, но выдаёт
 * форму «қыркүйектің» и иногда латиницу в зависимости от версии ICU —
 * в документе нужна предсказуемость, поэтому список свой.
 */
const MONTHS: Record<Lang, string[]> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  kk: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"],
};

/** «25 сентября 2026 г.» / «2026 жылғы 25 қыркүйек» — как принято в документах. */
export function formatDocDate(date: Date, lang: Lang): string {
  const d = date.getDate();
  const m = MONTHS[lang][date.getMonth()];
  const y = date.getFullYear();
  return lang === "kk" ? `${y} жылғы ${d} ${m}` : `${d} ${m} ${y} г.`;
}

const DICT: Record<Lang, Record<string, string>> = {
  ru: {},
  kk: {},
};

/** Регистрация словаря раздела: документы подключают свои строки сами. */
export function registerDict(lang: Lang, entries: Record<string, string>): void {
  Object.assign(DICT[lang], entries);
}

export function tFor(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const raw = DICT[lang][key] ?? DICT.ru[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in vars ? String(vars[name]) : whole,
    );
  };
}
