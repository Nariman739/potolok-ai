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

export function resolveSpotKind(
  el: { spotType?: string; priceVariantId?: string; spotStyle?: "cup" | "gx53" },
  variants: VariantNames,
): SpotKind {
  if (el.priceVariantId) {
    const n = variantName(el.priceVariantId, variants).replace(/[\s\-_]/g, "");
    if (/bh10|gu10/.test(n)) return "bh10";
    if (/bh53/.test(n)) return "bh53";
    return "gx53";
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
