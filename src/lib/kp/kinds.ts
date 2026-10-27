/**
 * Типы элементов потолка для фото в КП (Нариман 26.10.2026: «поставил в
 * дизайнере магнитный трек — в КП появилось фото с ним; если мастер загрузил
 * своё фото, его, иначе наше»).
 *
 * Тип определяется двумя путями и объединяется:
 *  1) по элементам замера (Estimate.roomsData[].elements, wallProfiles);
 *  2) по названиям позиций в расчёте (ключевые слова) — так ловим вставку,
 *     галтель, полотно и вид софита (GX53 / утопленный), которых в дизайнере
 *     как отдельных элементов нет.
 */

export type KpKind =
  | "track"
  | "lightline"
  | "shadow"
  | "floating"
  | "curtain"
  | "shower_curtain"
  | "subcurtain"
  | "vent"
  | "chandelier"
  | "spot_gx53"
  | "spot_recessed"
  | "spot"
  | "spot_platform"
  | "insert"
  | "galtel"
  | "canvas_matte"
  | "canvas_satin"
  | "canvas_gloss";

export const KP_KINDS: KpKind[] = [
  "track", "lightline", "shadow", "floating", "curtain", "shower_curtain", "subcurtain",
  "vent", "chandelier", "spot_gx53", "spot_recessed", "spot", "spot_platform",
  "insert", "galtel", "canvas_matte", "canvas_satin", "canvas_gloss",
];

/** Подпись и объяснение для клиента — одна строка, без жаргона. */
export const KIND_INFO: Record<KpKind, { label: string; caption: string }> = {
  track: { label: "Магнитный трек", caption: "Шина в потолке, по которой свободно двигаются светильники: споты, линейные, подвесы — меняются без электрика" },
  lightline: { label: "Световая линия", caption: "Ровная полоса света прямо в полотне, без видимых светильников — освещает мягко и равномерно" },
  shadow: { label: "Теневой профиль", caption: "Потолок не касается стены: по периметру тонкий тёмный зазор вместо плинтуса — выглядит как дорогой гипсокартон" },
  floating: { label: "Парящий потолок", caption: "Подсветка по периметру из-под кромки полотна — потолок будто висит в воздухе" },
  curtain: { label: "Гардина", caption: "Ниша под шторы прямо в потолке: карниз спрятан, шторы идут от самого потолка" },
  shower_curtain: { label: "Шторка для ванны", caption: "Потолочная направляющая под шторку в душевой — без штанги между стенами" },
  subcurtain: { label: "Подшторник", caption: "Ниша вдоль окна под карниз: карниза не видно, шторы висят из потолка" },
  vent: { label: "Теневая вытяжка", caption: "Вентиляционный выход заподлицо с полотном: аккуратный круг вместо решётки" },
  chandelier: { label: "Люстра", caption: "Закладная под люстру ставится до натяжки, люстра крепится к ней — полотно не нагружается" },
  spot_gx53: { label: "Софиты GX53", caption: "Плоские встраиваемые светильники со сменной лампой — самый ходовой и недорогой вариант" },
  spot_recessed: { label: "Утопленные софиты", caption: "Светильник спрятан в потолке, снаружи только круг света — без выступающих частей" },
  spot: { label: "Софиты", caption: "Точечные светильники: расставляются по вашему плану, мощность и свет подбираем вместе" },
  spot_platform: { label: "Закладная под софит", caption: "Платформа под каждым светильником: держит его на полотне и не даёт провиснуть" },
  insert: { label: "Вставка", caption: "Декоративная лента в стык потолка и стены: закрывает зазор, вместо плинтуса" },
  galtel: { label: "Галтель", caption: "Потолочный плинтус по периметру — классическое оформление стыка со стеной" },
  canvas_matte: { label: "Матовое полотно", caption: "Выглядит как идеально ровный окрашенный потолок — без бликов, подходит везде" },
  canvas_satin: { label: "Сатиновое полотно", caption: "Лёгкий шёлковый отблеск: мягче глянца, наряднее матового" },
  canvas_gloss: { label: "Глянцевое полотно", caption: "Зеркальный отблеск: комната кажется выше и светлее" },
};

/** Папка на диске (kp-фото/<папка>) → тип. Для скрипта заливки библиотеки. */
export const FOLDER_TO_KIND: Record<string, KpKind> = {
  "трек": "track",
  "световая-линия": "lightline",
  "теневой": "shadow",
  "парящий": "floating",
  "гардина": "curtain",
  "гардина-ванная": "shower_curtain",
  "подшторник": "subcurtain",
  "вытяжка": "vent",
  "люстра": "chandelier",
  "софит-gx53": "spot_gx53",
  "софит-утопленный": "spot_recessed",
  "софит": "spot",
  "закладная-софит": "spot_platform",
  "вставка": "insert",
  "галтель": "galtel",
  "полотно-матовое": "canvas_matte",
  "полотно-сатин": "canvas_satin",
  "полотно-глянец": "canvas_gloss",
};

/** Тип по названию позиции расчёта; null — не распознали. */
export function kindFromItemName(name: string): KpKind | null {
  const n = name.toLowerCase().replace("ё", "е");
  if (/закладн/.test(n) && /софит|спот|светильник/.test(n)) return "spot_platform";
  if (/закладн/.test(n) && /люстр/.test(n)) return "chandelier";
  if (/трек|track/.test(n)) return "track";
  if (/свет\.?\s*лини|световая|световые|light ?line/.test(n)) return "lightline";
  if (/теневой|теневая|тенев\b|shadow|eurokraab|euro ?kraab/.test(n) && !/вытяж/.test(n)) return "shadow";
  if (/вытяжк|вентиляц|диффузор/.test(n)) return "vent";
  if (/парящ|floating/.test(n)) return "floating";
  if (/шторк|душев/.test(n)) return "shower_curtain";
  if (/подшторн/.test(n)) return "subcurtain";
  if (/гардин|карниз|пк-?14/.test(n)) return "curtain";
  if (/люстр/.test(n)) return "chandelier";
  if (/софит|спот|светильник|led|лед/.test(n)) {
    if (/gx ?53|гх ?53|жк ?53|gx53/.test(n)) return "spot_gx53";
    if (/gu ?10|gu ?5\.?3|mr ?16|утоплен|встроен|встраив|скрыт/.test(n)) return "spot_recessed";
    return "spot";
  }
  if (/вставк|маскировоч/.test(n)) return "insert";
  if (/галтел|плинтус/.test(n)) return "galtel";
  if (/полотн|пленк|плёнк|msd|bauf|pongs|ткан/.test(n)) {
    if (/глянц|лак/.test(n)) return "canvas_gloss";
    if (/сатин/.test(n)) return "canvas_satin";
    if (/матов|мат\b/.test(n)) return "canvas_matte";
    return null;
  }
  return null;
}

type RawElement = { type?: unknown; rows?: unknown };

/** Типы по элементам замера одной комнаты. */
export function kindsFromRoom(raw: unknown): KpKind[] {
  const out = new Set<KpKind>();
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { elements?: unknown; wallProfiles?: unknown };
  const els = Array.isArray(r.elements) ? (r.elements as RawElement[]) : [];
  for (const e of els) {
    const t = String(e.type ?? "");
    if (t === "track") out.add("track");
    else if (t === "lightline") out.add("lightline");
    else if (t === "curtain" || t === "builtin_gardina") out.add(e.rows === 1 ? "shower_curtain" : "curtain");
    else if (t === "shower_curtain") out.add("shower_curtain");
    else if (t === "subcurtain") out.add("subcurtain");
    else if (t === "vent") out.add("vent");
    else if (t === "chandelier" || t === "pendant") out.add("chandelier");
    else if (t === "spot") out.add("spot");
    else if (t === "floating") out.add("floating");
  }
  const prof = r.wallProfiles && typeof r.wallProfiles === "object" ? Object.values(r.wallProfiles as Record<string, unknown>) : [];
  for (const p of prof) {
    if (p === "shadow") out.add("shadow");
    else if (p === "floating") out.add("floating");
    else if (p === "subcurtain" || p === "subcurtain_light") out.add("subcurtain");
  }
  return [...out];
}

/**
 * Объединить типы из замера и из позиций: общий «spot» из замера уточняется
 * видом софита из прайса (GX53 / утопленный), если он там назван.
 */
export function mergeKinds(fromRooms: KpKind[], fromItems: KpKind[]): KpKind[] {
  const set = new Set<KpKind>([...fromRooms, ...fromItems]);
  if (set.has("spot") && (set.has("spot_gx53") || set.has("spot_recessed"))) set.delete("spot");
  // Порядок показа — как в KP_KINDS (свет и конструкция раньше полотна)
  return KP_KINDS.filter((k) => set.has(k));
}
