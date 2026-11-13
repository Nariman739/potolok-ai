// Этап 3 «что продано = что показано» (04.11.2026): тип светильника из КП →
// модель в 3D. Тип живёт на элементе чертежа (shared/spot-types.ts,
// shared/track-types.ts): стандартный код или свой вариант прайса мастера.
//
// Софиты (фото из прайсов мастеров, 04.11):
//   spot_ours  — GX53 «таблетка»: белое кольцо заподлицо + матовый рассеиватель;
//   spot_bh53  — BH53 GAP, безрамочный GX53: белая воронка в полотне без кольца,
//                диск лампы в глубине (фото price-items 511d…/bf8d…);
//   spot_bh10  — BH10 GAP, безрамочный GU10: воронка глубже, маленькая линза
//                с хромовым патроном в глубине (фото price-items 18f8…/bf8d…);
//   spot_client — софит клиента, неизвестен → GX53 (самый частый).
// Свой вариант мастера (priceVariantId) — по названию: «BH10 / GU10» → bh10,
// «BH53» → bh53, иначе GX53. Фото варианта на полотно НЕ кладём: это
// продуктовые кадры и коллажи (в базе 4 фото на 70 вариантов), на потолке
// они врали бы сильнее, чем геометрия по названию.
//
// Треки: track_magnetic — встраиваемый магнитный (рейка заподлицо, линейные
// модули, эталон трек-1/-4); track_surface — накладной (рейка выступает,
// поворотные споты-цилиндры, эталон трек-2/-3). Свой трек — по названию
// («наклад» → surface), иначе магнитный.

export type SpotKind = "gx53" | "bh53" | "bh10" | "cup";
export type TrackKind = "magnetic" | "surface";

export type VariantNames = Record<string, { name: string }> | undefined;

function variantName(id: string | undefined, variants: VariantNames): string {
  if (!id || !variants) return "";
  return (variants[id]?.name ?? "").toLowerCase();
}

/** Вид софита по названию своей позиции; sure=false — признаков нет, взят GX53 по умолчанию. */
export type SpotKindGuess = { kind: SpotKind; sure: boolean };

/** Кириллические «коды» мастеров перед числом → латиница: вн53/бш-53 = BH53, жх 53 = GX53, гу10 = GU10. */
function latinizeSpotCodes(s: string): string {
  return s
    .replace(/(^|[^a-zа-яё0-9])(вн|бн|вш|бш)(?=[\s\-_.]*(53|10))/g, "$1bh")
    .replace(/(^|[^a-zа-яё0-9])(жх|гх|джх|жк)(?=[\s\-_.]*53)/g, "$1gx")
    .replace(/(^|[^a-zа-яё0-9])гу(?=[\s\-_.]*10)/g, "$1gu");
}

/**
 * Название своей позиции прайса → вид (13.11.2026). Правила от сильных к слабым:
 *  1. код «буквы + отдельное число» с любыми разделителями: bh/gu 10 → bh10, bh 53 → bh53,
 *     gx 53 → gx53. Число отдельное — «3650», «5300», артикул «sl5300», «gx91» не ловим;
 *     перед буквами не буква/цифра — «sl53» не считаем за «53»;
 *  2. слова: «безрамочный» — воронка без кольца, визуально BH → bh53; «таблетка/тарелка» → gx53;
 *     «накладной» (и не «встраиваемый/утопленный») → cup;
 *  3. одинокое «53» без букв («встр. 53», «софит-53») — лампа 53 без BH = GX53;
 *     одинокое «10» не трогаем (штуки, ватты);
 *  4. иначе GX53 (самый частый), sure=false.
 * Раньше: только латинские bh10/gu10/bh53 в склеенной строке, всё прочее молча GX53 —
 * «бш-53» и «безрамочный …» мастеров шли таблеткой.
 */
export function guessSpotKind(rawName: string): SpotKindGuess {
  const s = latinizeSpotCodes(rawName.toLowerCase().trim());
  const code = (letters: string, num: string) => new RegExp(`(^|[^a-z0-9])${letters}[\\s\\-_.]*${num}(?!\\d)`);
  if (code("(bh|gu)", "10").test(s)) return { kind: "bh10", sure: true };
  if (code("bh", "53").test(s)) return { kind: "bh53", sure: true };
  if (code("gx", "53").test(s)) return { kind: "gx53", sure: true };
  if (/безрам|без\s*рам/.test(s)) return { kind: "bh53", sure: true };
  if (/таблет|тарелк/.test(s)) return { kind: "gx53", sure: true };
  if (/(^|[^а-яё])накл/.test(s) && !/встр|утопл/.test(s)) return { kind: "cup", sure: true };
  if (/(^|[^a-z0-9])53(?!\d)/.test(s)) return { kind: "gx53", sure: true };
  return { kind: "gx53", sure: false };
}

export function resolveSpotKind(
  el: { spotType?: string; priceVariantId?: string; spotStyle?: "cup" | "gx53" },
  variants: VariantNames,
): SpotKind {
  if (el.priceVariantId) {
    return guessSpotKind(variantName(el.priceVariantId, variants)).kind;
  }
  switch (el.spotType) {
    case "spot_bh53":
      return "bh53";
    case "spot_bh10":
      return "bh10";
    case "spot_ours":
    case "spot_client":
      return "gx53";
  }
  // Без типа (старые замеры): как раньше — spotStyle элемента, дефолт GX53.
  return el.spotStyle === "cup" ? "cup" : "gx53";
}

export function resolveTrackKind(
  el: { trackType?: string; priceVariantId?: string },
  variants: VariantNames,
): TrackKind {
  if (el.priceVariantId) {
    const n = variantName(el.priceVariantId, variants);
    return /наклад|surface|накладн/.test(n) ? "surface" : "magnetic";
  }
  return el.trackType === "track_surface" ? "surface" : "magnetic";
}
