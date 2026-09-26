/**
 * Свой договор мастера: метки подстановки и защита документа (26.09.2026).
 *
 * Мастер правит договор словами, а переписывает текст языковая модель. Значит
 * нужны две страховки, иначе документ тихо перестанет быть документом:
 *
 * 1. Метки. В тексте живут места, куда подставляются имя клиента, адрес,
 *    сумма, срок. Модель, переписывая абзац, легко их «причешет» — и клиент
 *    получит договор с пустым местом вместо суммы. Поэтому метки проверяются
 *    до сохранения.
 * 2. Обязательные пункты. Мастер может попросить убрать лишнее и вместе с
 *    лишним снести предмет договора или сумму. Такое сохраняем только после
 *    честного предупреждения.
 */

/** Метка в тексте договора: {клиент}, {сумма}… Регистр и пробелы внутри не важны. */
export const CONTRACT_PLACEHOLDERS = [
  { key: "клиент", about: "имя заказчика" },
  { key: "телефон_клиента", about: "телефон заказчика" },
  { key: "адрес", about: "адрес объекта" },
  { key: "сумма", about: "сумма договора цифрами" },
  { key: "сумма_прописью", about: "сумма договора словами" },
  { key: "предоплата", about: "размер и порядок предоплаты" },
  { key: "срок", about: "срок выполнения работ" },
  { key: "дата_начала", about: "дата начала работ" },
  { key: "исполнитель", about: "название компании или имя мастера" },
  { key: "реквизиты_исполнителя", about: "БИН/ИИН, счёт, банк" },
  { key: "телефон_исполнителя", about: "телефон мастера" },
  { key: "город", about: "город заключения договора" },
  { key: "дата", about: "дата договора" },
  { key: "номер", about: "номер договора" },
  { key: "таблица_работ", about: "перечень работ с ценами" },
  { key: "гарантия_материал", about: "срок гарантии на полотно" },
  { key: "гарантия_монтаж", about: "срок гарантии на монтаж" },
] as const;

export type PlaceholderKey = (typeof CONTRACT_PLACEHOLDERS)[number]["key"];

/**
 * Метки, без которых договор не документ. Остальные мастер вправе убрать:
 * кто-то не указывает срок, кто-то работает без предоплаты.
 */
const REQUIRED: PlaceholderKey[] = [
  "клиент",
  "адрес",
  "сумма",
  "сумма_прописью",
  "исполнитель",
  "таблица_работ",
];

const TAG = /\{\s*([a-zа-яё_]+)\s*\}/gi;

/** Какие метки реально стоят в тексте. */
export function usedPlaceholders(body: string): Set<string> {
  const found = new Set<string>();
  for (const m of body.matchAll(TAG)) found.add(m[1].toLowerCase().replace(/\s+/g, "_"));
  return found;
}

export type TemplateCheck = {
  ok: boolean;
  /** Обязательные метки, которых не хватает — по ним предупреждаем мастера. */
  missing: { key: string; about: string }[];
  /** Метки, которых мы не знаем: опечатка модели или выдумка. */
  unknown: string[];
};

export function checkTemplate(body: string): TemplateCheck {
  const used = usedPlaceholders(body);
  const known = new Set<string>(CONTRACT_PLACEHOLDERS.map((p) => p.key));
  const missing = REQUIRED.filter((k) => !used.has(k)).map((k) => ({
    key: k,
    about: CONTRACT_PLACEHOLDERS.find((p) => p.key === k)?.about ?? k,
  }));
  const unknown = [...used].filter((k) => !known.has(k));
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

/** Подстановка значений в текст договора. Неизвестные метки остаются как есть. */
export function fillTemplate(body: string, values: Partial<Record<PlaceholderKey, string>>): string {
  return body.replace(TAG, (whole, raw: string) => {
    const key = raw.toLowerCase().replace(/\s+/g, "_") as PlaceholderKey;
    const v = values[key];
    return v == null ? whole : v;
  });
}

/**
 * Человеческое объяснение, что не так с шаблоном. Мастеру, не разработчику:
 * он правит документ голосом и не обязан знать слово «плейсхолдер».
 */
export function explainCheck(check: TemplateCheck, lang: "ru" | "kk" = "ru"): string | null {
  if (check.ok) return null;
  const parts: string[] = [];
  if (check.missing.length > 0) {
    const list = check.missing.map((m) => m.about).join(", ");
    parts.push(
      lang === "kk"
        ? `Шартта мыналар жоғалып кетті: ${list}. Оларсыз құжат жарамсыз.`
        : `Из договора пропало: ${list}. Без этого документ не работает.`,
    );
  }
  if (check.unknown.length > 0) {
    const list = check.unknown.map((u) => `{${u}}`).join(", ");
    parts.push(
      lang === "kk"
        ? `Түсініксіз белгілер бар: ${list} — олар мәтінде сол күйі қалады.`
        : `В тексте есть непонятные метки: ${list} — они так и останутся словами.`,
    );
  }
  return parts.join(" ");
}
